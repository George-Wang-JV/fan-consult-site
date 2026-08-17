require('dotenv').config();

const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const webpush = require('web-push');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === 'production';
const vapidPublicKey = String(process.env.VAPID_PUBLIC_KEY || '').trim();
const vapidPrivateKey = String(process.env.VAPID_PRIVATE_KEY || '').trim();
const vapidSubject = String(process.env.VAPID_SUBJECT || 'mailto:admin@example.com').trim();
const pushEnabled = Boolean(vapidPublicKey && vapidPrivateKey);
if (pushEnabled) webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
else console.warn('⚠️ Web Push 未启用：请配置 VAPID_PUBLIC_KEY 和 VAPID_PRIVATE_KEY。');
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  nickname TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS direct_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id INTEGER NOT NULL,
  to_user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(from_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(to_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'pending',
  mute_until TEXT,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (group_id, user_id),
  FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS group_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_direct_pair ON direct_messages(from_user_id, to_user_id, id);
CREATE INDEX IF NOT EXISTS idx_group_messages ON group_messages(group_id, id);
CREATE INDEX IF NOT EXISTS idx_group_member_status ON group_members(group_id, status);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
`);

// Tracks the chat visible in each subscribed browser. Unknown/offline endpoints still receive push.
const endpointPresence = new Map();

function isViewingChat(endpoint, chatType, chatId) {
  const browserTabs = endpointPresence.get(endpoint);
  return Boolean(browserTabs && [...browserTabs.values()].some((presence) =>
    presence.visible && presence.chatType === chatType && Number(presence.chatId) === Number(chatId)
  ));
}

function notificationPreview(content, max = 180) {
  const text = String(content || '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

async function sendPushToUsers(userIds, notification, chatType, chatId) {
  if (!pushEnabled || !userIds.length) return;
  const placeholders = userIds.map(() => '?').join(',');
  const subscriptions = db.prepare(`SELECT * FROM push_subscriptions WHERE user_id IN (${placeholders})`).all(...userIds);
  const payload = JSON.stringify(notification);

  await Promise.allSettled(subscriptions.map(async (row) => {
    if (isViewingChat(row.endpoint, chatType, chatId)) return;
    try {
      await webpush.sendNotification({
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth }
      }, payload, { TTL: 60 * 60, urgency: 'high' });
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(row.endpoint);
        endpointPresence.delete(row.endpoint);
        return;
      }
      console.error('Web Push 发送失败:', err.statusCode || err.message);
    }
  }));
}

function seedAdmin() {
  const existing = db.prepare('SELECT id FROM users WHERE is_admin = 1 LIMIT 1').get();
  if (existing) return;

  const email = (process.env.ADMIN_EMAIL || '').trim();
  const password = process.env.ADMIN_PASSWORD || '';
  const nickname = (process.env.ADMIN_NICKNAME || '管理员').trim();

  if (!email || !password) {
    console.warn('⚠️ 尚未创建管理员：请在 .env 中设置 ADMIN_EMAIL 和 ADMIN_PASSWORD 后重启。');
    return;
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  db.prepare(`
    INSERT INTO users (email, password_hash, nickname, is_admin)
    VALUES (?, ?, ?, 1)
  `).run(email, passwordHash, nickname);
  console.log(`✅ 已创建管理员账号：${email}`);
}
seedAdmin();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: false });

app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(express.json({ limit: '64kb' }));

const sessionMiddleware = session({
  store: new SQLiteStore({ db: 'sessions.db', dir: dataDir }),
  secret: process.env.SESSION_SECRET || 'dev-only-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 1000 * 60 * 60 * 24 * 14
  }
});
app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);

app.use(express.static(path.join(__dirname, 'public')));

function publicUser(row) {
  return row ? {
    id: row.id,
    email: row.email,
    nickname: row.nickname,
    isAdmin: Boolean(row.is_admin),
    createdAt: row.created_at
  } : null;
}

function currentUser(req) {
  if (!req.session.userId) return null;
  return db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: '请先登录' });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: '仅管理员可操作' });
  next();
}

function getAdmin() {
  const email = String(process.env.CONSULT_ADMIN_EMAIL || '')
    .trim()
    .toLowerCase();

  return db.prepare(`
    SELECT *
    FROM users
    WHERE is_admin = 1 AND email = ?
    LIMIT 1
  `).get(email);
}

function cleanText(value, max = 2000) {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.slice(0, max);
}

function isApprovedMember(groupId, userId) {
  return db.prepare(`
    SELECT * FROM group_members
    WHERE group_id = ? AND user_id = ? AND status = 'approved'
  `).get(groupId, userId);
}

function isMuted(member) {
  if (!member?.mute_until) return false;
  return new Date(member.mute_until + 'Z').getTime() > Date.now();
}

// ---------- Auth ----------
app.post('/api/register', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const nickname = cleanText(req.body.nickname, 30);
    const password = String(req.body.password || '');

    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: '请输入有效邮箱' });
    if (!nickname) return res.status(400).json({ error: '请输入昵称' });
    if (password.length < 8) return res.status(400).json({ error: '密码至少 8 位' });

    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (exists) return res.status(409).json({ error: '该邮箱已注册' });

    const hash = await bcrypt.hash(password, 12);
    const info = db.prepare(`
      INSERT INTO users (email, password_hash, nickname, is_admin)
      VALUES (?, ?, ?, 0)
    `).run(email, hash, nickname);

    req.session.userId = Number(info.lastInsertRowid);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '注册失败' });
  }
});

app.post('/api/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: '邮箱或密码错误' });
  }
  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

app.post('/api/logout', requireAuth, (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  res.json({ user: publicUser(currentUser(req)) });
});

// ---------- Web Push ----------
app.get('/api/push/public-key', requireAuth, (req, res) => {
  if (!pushEnabled) return res.status(503).json({ error: '服务器尚未配置 Web Push' });
  res.json({ publicKey: vapidPublicKey });
});

app.post('/api/push/subscribe', requireAuth, (req, res) => {
  const subscription = req.body.subscription;
  const endpoint = String(subscription?.endpoint || '').trim();
  const p256dh = String(subscription?.keys?.p256dh || '').trim();
  const auth = String(subscription?.keys?.auth || '').trim();
  let endpointUrl;
  try { endpointUrl = new URL(endpoint); } catch { endpointUrl = null; }
  if (!endpointUrl || endpointUrl.protocol !== 'https:' || !p256dh || !auth) {
    return res.status(400).json({ error: '订阅数据不完整' });
  }
  db.prepare(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh,
      auth = excluded.auth, updated_at = datetime('now')
  `).run(req.user.id, endpoint, p256dh, auth);
  res.json({ ok: true });
});

app.post('/api/push/unsubscribe', requireAuth, (req, res) => {
  const endpoint = String(req.body.endpoint || '').trim();
  if (endpoint) {
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, req.user.id);
    endpointPresence.delete(endpoint);
  }
  res.json({ ok: true });
});

// ---------- Direct consultation ----------
app.get('/api/direct/contacts', requireAuth, (req, res) => {
  if (req.user.is_admin) {
    const rows = db.prepare(`
      SELECT id, email, nickname, is_admin, created_at
      FROM users WHERE is_admin = 0 ORDER BY created_at DESC
    `).all();
    return res.json({ contacts: rows.map(publicUser) });
  }
  const admin = getAdmin();
  res.json({ contacts: admin ? [publicUser(admin)] : [] });
});

app.get('/api/direct/messages', requireAuth, (req, res) => {
  const admin = getAdmin();
  if (!admin) return res.status(503).json({ error: '管理员尚未配置' });

  let otherUserId;
  if (req.user.is_admin) {
    otherUserId = Number(req.query.userId);
    const target = db.prepare('SELECT * FROM users WHERE id = ? AND is_admin = 0').get(otherUserId);
    if (!target) return res.status(404).json({ error: '用户不存在' });
  } else {
    otherUserId = admin.id;
  }

  const rows = db.prepare(`
    SELECT dm.*, u.nickname AS from_nickname
    FROM direct_messages dm
    JOIN users u ON u.id = dm.from_user_id
    WHERE (dm.from_user_id = ? AND dm.to_user_id = ?)
       OR (dm.from_user_id = ? AND dm.to_user_id = ?)
    ORDER BY dm.id ASC
    LIMIT 500
  `).all(req.user.id, otherUserId, otherUserId, req.user.id);

  res.json({ messages: rows });
});

app.post('/api/direct/messages', requireAuth, (req, res) => {
  const content = cleanText(req.body.content);
  if (!content) return res.status(400).json({ error: '消息不能为空' });

  const admin = getAdmin();
  if (!admin) return res.status(503).json({ error: '管理员尚未配置' });

  let toUserId;
  if (req.user.is_admin) {
    toUserId = Number(req.body.toUserId);
    const target = db.prepare('SELECT * FROM users WHERE id = ? AND is_admin = 0').get(toUserId);
    if (!target) return res.status(404).json({ error: '用户不存在' });
  } else {
    toUserId = admin.id;
  }

  const info = db.prepare(`
    INSERT INTO direct_messages (from_user_id, to_user_id, content)
    VALUES (?, ?, ?)
  `).run(req.user.id, toUserId, content);

  const message = db.prepare(`
    SELECT dm.*, u.nickname AS from_nickname
    FROM direct_messages dm JOIN users u ON u.id = dm.from_user_id
    WHERE dm.id = ?
  `).get(info.lastInsertRowid);

  io.to(`user:${req.user.id}`).to(`user:${toUserId}`).emit('direct:new', message);
  void sendPushToUsers([toUserId], {
    title: `${req.user.nickname} 发来新咨询`, body: notificationPreview(content),
    tag: `direct-${req.user.id}`, url: `/?direct=${req.user.id}`
  }, 'direct', req.user.id).catch((err) => console.error('Web Push 处理失败:', err));
  res.json({ message });
});

// ---------- Groups ----------
app.get('/api/groups', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT g.*,
      gm.status AS my_status,
      gm.role AS my_role,
      gm.mute_until AS my_mute_until,
      (SELECT COUNT(*) FROM group_members x WHERE x.group_id = g.id AND x.status = 'approved') AS member_count
    FROM groups g
    LEFT JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ?
    ORDER BY g.created_at DESC
  `).all(req.user.id);
  res.json({ groups: rows });
});

app.post('/api/groups', requireAuth, requireAdmin, (req, res) => {
  const name = cleanText(req.body.name, 40);
  const description = cleanText(req.body.description, 200) || '';
  if (!name) return res.status(400).json({ error: '群名称不能为空' });

  const create = db.transaction(() => {
    const info = db.prepare(`INSERT INTO groups (name, description, created_by) VALUES (?, ?, ?)`)
      .run(name, description, req.user.id);
    const groupId = Number(info.lastInsertRowid);
    db.prepare(`
      INSERT INTO group_members (group_id, user_id, role, status)
      VALUES (?, ?, 'admin', 'approved')
    `).run(groupId, req.user.id);
    return groupId;
  });

  const groupId = create();
  res.json({ group: db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId) });
});

app.post('/api/groups/:groupId/join', requireAuth, (req, res) => {
  const groupId = Number(req.params.groupId);
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
  if (!group) return res.status(404).json({ error: '群不存在' });
  if (req.user.is_admin) return res.status(400).json({ error: '管理员无需申请加入' });

  const existing = db.prepare('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, req.user.id);
  if (existing?.status === 'approved') return res.status(409).json({ error: '你已经在群里' });
  if (existing?.status === 'pending') return res.status(409).json({ error: '申请已提交，请等待管理员审核' });

  db.prepare(`
    INSERT INTO group_members (group_id, user_id, role, status, mute_until)
    VALUES (?, ?, 'member', 'pending', NULL)
    ON CONFLICT(group_id, user_id) DO UPDATE SET status = 'pending', mute_until = NULL
  `).run(groupId, req.user.id);

  io.to(`user:${getAdmin()?.id}`).emit('group:request', { groupId, userId: req.user.id });
  res.json({ ok: true });
});

app.get('/api/groups/:groupId/requests', requireAuth, requireAdmin, (req, res) => {
  const groupId = Number(req.params.groupId);
  const rows = db.prepare(`
    SELECT u.id, u.email, u.nickname, gm.joined_at
    FROM group_members gm JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ? AND gm.status = 'pending'
    ORDER BY gm.joined_at ASC
  `).all(groupId);
  res.json({ requests: rows });
});

app.post('/api/groups/:groupId/requests/:userId/approve', requireAuth, requireAdmin, (req, res) => {
  const groupId = Number(req.params.groupId);
  const userId = Number(req.params.userId);
  const info = db.prepare(`
    UPDATE group_members SET status = 'approved', mute_until = NULL
    WHERE group_id = ? AND user_id = ? AND status = 'pending'
  `).run(groupId, userId);
  if (!info.changes) return res.status(404).json({ error: '没有找到待审核申请' });
  io.to(`user:${userId}`).emit('group:approved', { groupId });
  res.json({ ok: true });
});

app.post('/api/groups/:groupId/requests/:userId/reject', requireAuth, requireAdmin, (req, res) => {
  const groupId = Number(req.params.groupId);
  const userId = Number(req.params.userId);
  db.prepare(`DELETE FROM group_members WHERE group_id = ? AND user_id = ? AND status = 'pending'`).run(groupId, userId);
  io.to(`user:${userId}`).emit('group:rejected', { groupId });
  res.json({ ok: true });
});

app.get('/api/groups/:groupId/members', requireAuth, requireAdmin, (req, res) => {
  const groupId = Number(req.params.groupId);
  const rows = db.prepare(`
    SELECT u.id, u.email, u.nickname, u.is_admin, gm.role, gm.status, gm.mute_until, gm.joined_at
    FROM group_members gm JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ? AND gm.status = 'approved'
    ORDER BY u.is_admin DESC, gm.joined_at ASC
  `).all(groupId);
  res.json({ members: rows });
});

app.post('/api/groups/:groupId/members/:userId/mute', requireAuth, requireAdmin, (req, res) => {
  const groupId = Number(req.params.groupId);
  const userId = Number(req.params.userId);
  const minutes = Math.max(0, Math.min(10080, Number(req.body.minutes || 0)));
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!target || target.is_admin) return res.status(400).json({ error: '不能禁言该账号' });

  const muteUntil = minutes === 0 ? null : new Date(Date.now() + minutes * 60000).toISOString().slice(0, 19).replace('T', ' ');
  const info = db.prepare(`
    UPDATE group_members SET mute_until = ?
    WHERE group_id = ? AND user_id = ? AND status = 'approved'
  `).run(muteUntil, groupId, userId);
  if (!info.changes) return res.status(404).json({ error: '群成员不存在' });
  io.to(`user:${userId}`).emit('group:mute', { groupId, muteUntil });
  res.json({ ok: true, muteUntil });
});

app.delete('/api/groups/:groupId/members/:userId', requireAuth, requireAdmin, (req, res) => {
  const groupId = Number(req.params.groupId);
  const userId = Number(req.params.userId);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!target || target.is_admin) return res.status(400).json({ error: '不能移除管理员' });
  db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, userId);
  io.to(`user:${userId}`).emit('group:kicked', { groupId });
  res.json({ ok: true });
});

app.get('/api/groups/:groupId/messages', requireAuth, (req, res) => {
  const groupId = Number(req.params.groupId);
  const member = isApprovedMember(groupId, req.user.id);
  if (!member && !req.user.is_admin) return res.status(403).json({ error: '你尚未加入该群' });

  const rows = db.prepare(`
    SELECT gm.*, u.nickname, u.is_admin
    FROM group_messages gm JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
    ORDER BY gm.id ASC
    LIMIT 500
  `).all(groupId);
  res.json({ messages: rows });
});

app.post('/api/groups/:groupId/messages', requireAuth, (req, res) => {
  const groupId = Number(req.params.groupId);
  const content = cleanText(req.body.content);
  if (!content) return res.status(400).json({ error: '消息不能为空' });

  const member = isApprovedMember(groupId, req.user.id);
  if (!member && !req.user.is_admin) return res.status(403).json({ error: '你尚未加入该群' });
  if (!req.user.is_admin && isMuted(member)) return res.status(403).json({ error: `你已被禁言至 ${member.mute_until}` });

  const info = db.prepare(`INSERT INTO group_messages (group_id, user_id, content) VALUES (?, ?, ?)`)
    .run(groupId, req.user.id, content);
  const message = db.prepare(`
    SELECT gm.*, u.nickname, u.is_admin
    FROM group_messages gm JOIN users u ON u.id = gm.user_id
    WHERE gm.id = ?
  `).get(info.lastInsertRowid);
  io.to(`group:${groupId}`).emit('group:new', message);
  const group = db.prepare('SELECT name FROM groups WHERE id = ?').get(groupId);
  const recipients = db.prepare(`
    SELECT user_id FROM group_members
    WHERE group_id = ? AND status = 'approved' AND user_id != ?
  `).all(groupId, req.user.id).map((row) => row.user_id);
  void sendPushToUsers(recipients, {
    title: group?.name || '粉丝交流群', body: notificationPreview(`${req.user.nickname}：${content}`),
    tag: `group-${groupId}`, url: `/?group=${groupId}`
  }, 'group', groupId).catch((err) => console.error('Web Push 处理失败:', err));
  res.json({ message });
});

app.post('/api/groups/:groupId/messages/:messageId/pin', requireAuth, requireAdmin, (req, res) => {
  const groupId = Number(req.params.groupId);
  const messageId = Number(req.params.messageId);
  const target = db.prepare('SELECT * FROM group_messages WHERE id = ? AND group_id = ?').get(messageId, groupId);
  if (!target) return res.status(404).json({ error: '消息不存在' });

  const tx = db.transaction(() => {
    db.prepare('UPDATE group_messages SET is_pinned = 0 WHERE group_id = ?').run(groupId);
    db.prepare('UPDATE group_messages SET is_pinned = 1 WHERE id = ?').run(messageId);
  });
  tx();
  io.to(`group:${groupId}`).emit('group:pinned', { groupId, messageId });
  res.json({ ok: true });
});

// ---------- Socket.IO ----------
io.on('connection', (socket) => {
  const userId = socket.request.session?.userId;
  if (!userId) return socket.disconnect(true);

  socket.join(`user:${userId}`);
  const memberships = db.prepare(`
    SELECT group_id FROM group_members WHERE user_id = ? AND status = 'approved'
  `).all(userId);
  memberships.forEach((m) => socket.join(`group:${m.group_id}`));

  socket.on('group:join', (groupIdRaw) => {
    const groupId = Number(groupIdRaw);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (user?.is_admin || isApprovedMember(groupId, userId)) socket.join(`group:${groupId}`);
  });

  socket.on('presence:update', (raw = {}) => {
    const endpoint = String(raw.endpoint || '').trim();
    if (!endpoint) return;
    const owned = db.prepare('SELECT 1 FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').get(endpoint, userId);
    if (!owned) return;
    const chatType = raw.chatType === 'direct' || raw.chatType === 'group' ? raw.chatType : null;
    const browserTabs = endpointPresence.get(endpoint) || new Map();
    browserTabs.set(socket.id, {
      socketId: socket.id, userId: Number(userId), visible: Boolean(raw.visible), chatType,
      chatId: chatType ? Number(raw.chatId) : null
    });
    endpointPresence.set(endpoint, browserTabs);
  });

  socket.on('disconnect', () => {
    for (const [endpoint, browserTabs] of endpointPresence.entries()) {
      browserTabs.delete(socket.id);
      if (!browserTabs.size) endpointPresence.delete(endpoint);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
