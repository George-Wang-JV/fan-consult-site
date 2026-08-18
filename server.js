require('dotenv').config();

const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
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
const uploadsDir = path.join(dataDir, 'uploads');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

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

CREATE TABLE IF NOT EXISTS direct_read_state (
  user_id INTEGER NOT NULL,
  other_user_id INTEGER NOT NULL,
  last_read_message_id INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(user_id, other_user_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(other_user_id) REFERENCES users(id) ON DELETE CASCADE
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

CREATE TABLE IF NOT EXISTS media_uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  filename TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS message_reactions (
  message_scope TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(message_scope, message_id, user_id, emoji),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS message_deletions (
  message_scope TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(message_scope, message_id, user_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_direct_pair ON direct_messages(from_user_id, to_user_id, id);
CREATE INDEX IF NOT EXISTS idx_direct_recipient ON direct_messages(to_user_id, from_user_id, id);
CREATE INDEX IF NOT EXISTS idx_group_messages ON group_messages(group_id, id);
CREATE INDEX IF NOT EXISTS idx_group_member_status ON group_members(group_id, status);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_reactions_message ON message_reactions(message_scope, message_id);
CREATE INDEX IF NOT EXISTS idx_deletions_user ON message_deletions(user_id, message_scope, message_id);
`);

function ensureColumn(table, column, definition) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((item) => item.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

for (const table of ['direct_messages', 'group_messages']) {
  ensureColumn(table, 'message_type', "TEXT NOT NULL DEFAULT 'text'");
  ensureColumn(table, 'media_id', 'INTEGER');
  ensureColumn(table, 'metadata', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(table, 'is_recalled', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(table, 'recalled_at', 'TEXT');
}

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
  const stats = { subscriptions: 0, sent: 0, skipped: 0, expired: 0, failed: 0, errors: [] };
  if (!pushEnabled || !userIds.length) return stats;
  const placeholders = userIds.map(() => '?').join(',');
  const subscriptions = db.prepare(`SELECT * FROM push_subscriptions WHERE user_id IN (${placeholders})`).all(...userIds);
  stats.subscriptions = subscriptions.length;
  const payload = JSON.stringify(notification);

  await Promise.allSettled(subscriptions.map(async (row) => {
    if (isViewingChat(row.endpoint, chatType, chatId)) {
      stats.skipped += 1;
      return;
    }
    try {
      await webpush.sendNotification({
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth }
      }, payload, { TTL: 60 * 60, urgency: 'high' });
      stats.sent += 1;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(row.endpoint);
        endpointPresence.delete(row.endpoint);
        stats.expired += 1;
        return;
      }
      stats.failed += 1;
      stats.errors.push(String(err.statusCode || err.message || '未知错误').slice(0, 160));
      console.error('Web Push 发送失败:', err.statusCode || err.message);
    }
  }));
  return stats;
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

function directContact(row) {
  return {
    ...publicUser(row),
    unreadCount: Number(row.unread_count || 0),
    lastMessageId: row.last_message_id ? Number(row.last_message_id) : null,
    lastMessageContent: row.last_message_content || '',
    lastMessageAt: row.last_message_at || null
  };
}

function getDirectContacts(user) {
  const admin = user.is_admin ? null : getAdmin();
  if (!user.is_admin && !admin) return [];
  const where = user.is_admin ? 'u.is_admin = 0' : 'u.id = ?';
  return db.prepare(`
    SELECT u.*,
      (SELECT COUNT(*) FROM direct_messages incoming
       WHERE incoming.from_user_id = u.id AND incoming.to_user_id = ?
         AND incoming.is_recalled = 0
         AND NOT EXISTS (SELECT 1 FROM message_deletions deleted
           WHERE deleted.message_scope = 'direct' AND deleted.message_id = incoming.id AND deleted.user_id = ?)
         AND incoming.id > COALESCE((SELECT drs.last_read_message_id FROM direct_read_state drs
           WHERE drs.user_id = ? AND drs.other_user_id = u.id), 0)) AS unread_count,
      (SELECT latest.id FROM direct_messages latest
       WHERE ((latest.from_user_id = ? AND latest.to_user_id = u.id)
          OR (latest.from_user_id = u.id AND latest.to_user_id = ?))
         AND NOT EXISTS (SELECT 1 FROM message_deletions deleted
           WHERE deleted.message_scope = 'direct' AND deleted.message_id = latest.id AND deleted.user_id = ?)
       ORDER BY latest.id DESC LIMIT 1) AS last_message_id,
      (SELECT CASE
          WHEN latest.is_recalled = 1 THEN '[消息已撤回]'
          WHEN latest.message_type = 'image' THEN '[图片]'
          WHEN latest.message_type = 'video' THEN '[视频]'
          WHEN latest.message_type = 'audio' THEN '[语音]'
          WHEN latest.message_type = 'location' THEN '[位置]'
          ELSE latest.content END
       FROM direct_messages latest
       WHERE ((latest.from_user_id = ? AND latest.to_user_id = u.id)
          OR (latest.from_user_id = u.id AND latest.to_user_id = ?))
         AND NOT EXISTS (SELECT 1 FROM message_deletions deleted
           WHERE deleted.message_scope = 'direct' AND deleted.message_id = latest.id AND deleted.user_id = ?)
       ORDER BY latest.id DESC LIMIT 1) AS last_message_content,
      (SELECT latest.created_at FROM direct_messages latest
       WHERE ((latest.from_user_id = ? AND latest.to_user_id = u.id)
          OR (latest.from_user_id = u.id AND latest.to_user_id = ?))
         AND NOT EXISTS (SELECT 1 FROM message_deletions deleted
           WHERE deleted.message_scope = 'direct' AND deleted.message_id = latest.id AND deleted.user_id = ?)
       ORDER BY latest.id DESC LIMIT 1) AS last_message_at
    FROM users u
    WHERE ${where}
    ORDER BY (unread_count > 0) DESC, COALESCE(last_message_id, 0) DESC, u.created_at DESC
  `).all(
    user.id, user.id, user.id,
    user.id, user.id, user.id,
    user.id, user.id, user.id,
    user.id, user.id, user.id,
    ...(user.is_admin ? [] : [admin.id])
  );
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

const allowedReactions = new Set(['👍', '❤️', '😂', '😮', '😢', '🙏']);
const mediaTypes = {
  'image/jpeg': { kind:'image', ext:'.jpg' },
  'image/png': { kind:'image', ext:'.png' },
  'image/webp': { kind:'image', ext:'.webp' },
  'image/gif': { kind:'image', ext:'.gif' },
  'video/mp4': { kind:'video', ext:'.mp4' },
  'video/webm': { kind:'video', ext:'.webm' },
  'video/quicktime': { kind:'video', ext:'.mov' },
  'audio/webm': { kind:'audio', ext:'.webm' },
  'audio/mp4': { kind:'audio', ext:'.m4a' },
  'audio/mpeg': { kind:'audio', ext:'.mp3' },
  'audio/ogg': { kind:'audio', ext:'.ogg' },
  'audio/wav': { kind:'audio', ext:'.wav' },
  'audio/x-wav': { kind:'audio', ext:'.wav' }
};

function parseMetadata(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

function messageTable(scope) {
  if (scope === 'direct') return 'direct_messages';
  if (scope === 'group') return 'group_messages';
  return null;
}

function getAccessibleMessage(scope, messageId, user) {
  if (scope === 'direct') {
    const row = db.prepare('SELECT * FROM direct_messages WHERE id = ?').get(messageId);
    if (!row || (row.from_user_id !== user.id && row.to_user_id !== user.id)) return null;
    return row;
  }
  if (scope === 'group') {
    const row = db.prepare('SELECT * FROM group_messages WHERE id = ?').get(messageId);
    if (!row) return null;
    if (!user.is_admin && !isApprovedMember(row.group_id, user.id)) return null;
    return row;
  }
  return null;
}

function decorateMessages(scope, rows, userId) {
  if (!rows.length) return rows;
  const placeholders = rows.map(() => '?').join(',');
  const reactions = db.prepare(`
    SELECT emoji, user_id, message_id FROM message_reactions
    WHERE message_scope = ? AND message_id IN (${placeholders})
    ORDER BY created_at ASC
  `).all(scope, ...rows.map((row) => row.id));
  const grouped = new Map();
  for (const reaction of reactions) {
    const key = reaction.message_id;
    if (!grouped.has(key)) grouped.set(key, new Map());
    const emojiMap = grouped.get(key);
    const item = emojiMap.get(reaction.emoji) || { emoji:reaction.emoji, count:0, mine:false };
    item.count += 1;
    if (reaction.user_id === userId) item.mine = true;
    emojiMap.set(reaction.emoji, item);
  }
  return rows.map((row) => ({
    ...row,
    message_type: row.message_type || 'text',
    metadata: parseMetadata(row.metadata),
    media_url: row.media_id ? `/api/media/${row.media_id}` : null,
    is_recalled: Boolean(row.is_recalled),
    reactions: [...(grouped.get(row.id)?.values() || [])]
  }));
}

function emitMessageChange(scope, row, event = 'message:updated') {
  const payload = { scope, messageId:row.id, groupId:row.group_id || null };
  if (scope === 'direct') {
    io.to(`user:${row.from_user_id}`).to(`user:${row.to_user_id}`).emit(event, payload);
  } else {
    io.to(`group:${row.group_id}`).emit(event, payload);
  }
}

function cleanMessagePayload(body, user) {
  const messageType = ['text', 'image', 'video', 'audio', 'location'].includes(body.messageType) ? body.messageType : 'text';
  let content = cleanText(body.content);
  let mediaId = null;
  let metadata = {};

  if (messageType === 'text') {
    if (!content) throw Object.assign(new Error('消息不能为空'), { status:400 });
  } else if (messageType === 'location') {
    const latitude = Number(body.metadata?.latitude);
    const longitude = Number(body.metadata?.longitude);
    const accuracy = Math.max(0, Number(body.metadata?.accuracy || 0));
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw Object.assign(new Error('位置数据无效'), { status:400 });
    }
    metadata = { latitude, longitude, accuracy };
    content = content || '共享了一个位置';
  } else {
    mediaId = Number(body.mediaId);
    const media = db.prepare('SELECT * FROM media_uploads WHERE id = ? AND user_id = ?').get(mediaId, user.id);
    if (!media || mediaTypes[media.mime_type]?.kind !== messageType) {
      throw Object.assign(new Error('媒体文件不存在或类型不匹配'), { status:400 });
    }
    metadata = { originalName:media.original_name, size:media.size, mimeType:media.mime_type };
    content = content || ({ image:'[图片]', video:'[视频]', audio:'[语音]' }[messageType]);
  }

  return { content, messageType, mediaId, metadata:JSON.stringify(metadata) };
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

app.get('/api/push/status', requireAuth, (req, res) => {
  const subscriptions = db.prepare('SELECT COUNT(*) AS count FROM push_subscriptions WHERE user_id = ?').get(req.user.id).count;
  res.json({ configured: pushEnabled, subscriptions });
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

app.post('/api/push/test', requireAuth, async (req, res) => {
  if (!pushEnabled) return res.status(503).json({ error: '服务器尚未配置 VAPID 密钥' });
  try {
    const stats = await sendPushToUsers([req.user.id], {
      title: '通知测试成功',
      body: '你的浏览器已经可以接收新消息通知。',
      tag: `push-test-${Date.now()}`,
      url: '/'
    }, 'test', 0);
    if (!stats.subscriptions) return res.status(409).json({ error: '当前设备尚未完成 Push 订阅', stats });
    if (!stats.sent) return res.status(502).json({ error: `测试通知发送失败${stats.errors[0] ? `（${stats.errors[0]}）` : ''}`, stats });
    res.json({ ok: true, stats });
  } catch (err) {
    console.error('Web Push 测试失败:', err);
    res.status(500).json({ error: `测试通知失败：${err.message}` });
  }
});

// ---------- Media and message actions ----------
app.post('/api/media/upload', requireAuth, express.raw({ type:() => true, limit:'50mb' }), (req, res) => {
  const mimeType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const mediaType = mediaTypes[mimeType];
  if (!mediaType || !Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(400).json({ error:'不支持的文件类型' });
  }
  const maxSize = mediaType.kind === 'video' ? 50 * 1024 * 1024 : mediaType.kind === 'image' ? 12 * 1024 * 1024 : 15 * 1024 * 1024;
  if (req.body.length > maxSize) return res.status(413).json({ error:`${mediaType.kind === 'video' ? '视频' : mediaType.kind === 'image' ? '图片' : '语音'}文件过大` });

  let originalName = '';
  try { originalName = decodeURIComponent(String(req.headers['x-file-name'] || '')).slice(0, 180); } catch { originalName = ''; }
  const filename = `${crypto.randomUUID()}${mediaType.ext}`;
  fs.writeFileSync(path.join(uploadsDir, filename), req.body, { flag:'wx' });
  const info = db.prepare(`
    INSERT INTO media_uploads (user_id, filename, original_name, mime_type, size)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.id, filename, originalName, mimeType, req.body.length);
  res.json({ media:{ id:Number(info.lastInsertRowid), kind:mediaType.kind, mimeType, size:req.body.length } });
});

app.get('/api/media/:mediaId', requireAuth, (req, res) => {
  const media = db.prepare('SELECT * FROM media_uploads WHERE id = ?').get(Number(req.params.mediaId));
  if (!media) return res.status(404).json({ error:'文件不存在' });
  let allowed = media.user_id === req.user.id;

  if (!allowed) {
    allowed = Boolean(db.prepare(`
      SELECT 1 FROM direct_messages dm
      WHERE dm.media_id = ? AND dm.is_recalled = 0
        AND (dm.from_user_id = ? OR dm.to_user_id = ?)
        AND NOT EXISTS (SELECT 1 FROM message_deletions md
          WHERE md.message_scope = 'direct' AND md.message_id = dm.id AND md.user_id = ?)
      LIMIT 1
    `).get(media.id, req.user.id, req.user.id, req.user.id));
  }
  if (!allowed) {
    const groupMessages = db.prepare(`SELECT id, group_id FROM group_messages WHERE media_id = ? AND is_recalled = 0`).all(media.id);
    allowed = groupMessages.some((groupMessage) => {
      const deleted = db.prepare(`SELECT 1 FROM message_deletions WHERE message_scope = 'group' AND message_id = ? AND user_id = ?`)
        .get(groupMessage.id, req.user.id);
      return !deleted && (req.user.is_admin || Boolean(isApprovedMember(groupMessage.group_id, req.user.id)));
    });
  }
  if (!allowed) return res.status(403).json({ error:'无权查看该文件' });

  const filePath = path.join(uploadsDir, media.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error:'文件已丢失' });
  res.type(media.mime_type);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Content-Disposition', `inline; filename="media${mediaTypes[media.mime_type]?.ext || ''}"`);
  res.sendFile(filePath);
});

app.post('/api/messages/:scope/:messageId/reactions', requireAuth, (req, res) => {
  const scope = req.params.scope;
  const messageId = Number(req.params.messageId);
  const emoji = String(req.body.emoji || '');
  const message = getAccessibleMessage(scope, messageId, req.user);
  if (!message) return res.status(404).json({ error:'消息不存在' });
  if (message.is_recalled) return res.status(409).json({ error:'已撤回的消息不能回应' });
  if (!allowedReactions.has(emoji)) return res.status(400).json({ error:'不支持该表情' });

  const existing = db.prepare(`
    SELECT 1 FROM message_reactions WHERE message_scope = ? AND message_id = ? AND user_id = ? AND emoji = ?
  `).get(scope, messageId, req.user.id, emoji);
  if (existing) {
    db.prepare(`DELETE FROM message_reactions WHERE message_scope = ? AND message_id = ? AND user_id = ? AND emoji = ?`)
      .run(scope, messageId, req.user.id, emoji);
  } else {
    db.prepare(`INSERT INTO message_reactions (message_scope, message_id, user_id, emoji) VALUES (?, ?, ?, ?)`)
      .run(scope, messageId, req.user.id, emoji);
  }
  emitMessageChange(scope, message);
  res.json({ ok:true, active:!existing });
});

app.post('/api/messages/:scope/:messageId/recall', requireAuth, (req, res) => {
  const scope = req.params.scope;
  const messageId = Number(req.params.messageId);
  const table = messageTable(scope);
  const message = getAccessibleMessage(scope, messageId, req.user);
  if (!table || !message) return res.status(404).json({ error:'消息不存在' });
  const senderId = scope === 'direct' ? message.from_user_id : message.user_id;
  if (senderId !== req.user.id) return res.status(403).json({ error:'只能撤回自己发送的消息' });
  db.prepare(`UPDATE ${table} SET is_recalled = 1, recalled_at = datetime('now') WHERE id = ?`).run(messageId);
  db.prepare(`DELETE FROM message_reactions WHERE message_scope = ? AND message_id = ?`).run(scope, messageId);
  emitMessageChange(scope, message);
  res.json({ ok:true });
});

app.delete('/api/messages/:scope/:messageId', requireAuth, (req, res) => {
  const scope = req.params.scope;
  const messageId = Number(req.params.messageId);
  const message = getAccessibleMessage(scope, messageId, req.user);
  if (!message) return res.status(404).json({ error:'消息不存在' });
  db.prepare(`
    INSERT OR IGNORE INTO message_deletions (message_scope, message_id, user_id) VALUES (?, ?, ?)
  `).run(scope, messageId, req.user.id);
  io.to(`user:${req.user.id}`).emit('message:deleted', { scope, messageId, groupId:message.group_id || null });
  res.json({ ok:true });
});

// ---------- Direct consultation ----------
app.get('/api/direct/contacts', requireAuth, (req, res) => {
  res.json({ contacts: getDirectContacts(req.user).map(directContact) });
});

app.get('/api/direct/unread', requireAuth, (req, res) => {
  const contacts = getDirectContacts(req.user).map(directContact);
  const unread = contacts
    .filter((contact) => contact.unreadCount > 0)
    .map((contact) => ({ userId: contact.id, count: contact.unreadCount }));
  res.json({ unread, total: unread.reduce((sum, item) => sum + item.count, 0) });
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
    WHERE ((dm.from_user_id = ? AND dm.to_user_id = ?)
       OR (dm.from_user_id = ? AND dm.to_user_id = ?))
      AND NOT EXISTS (SELECT 1 FROM message_deletions md
        WHERE md.message_scope = 'direct' AND md.message_id = dm.id AND md.user_id = ?)
    ORDER BY dm.id ASC
    LIMIT 500
  `).all(req.user.id, otherUserId, otherUserId, req.user.id, req.user.id);

  const lastIncoming = db.prepare(`
    SELECT COALESCE(MAX(id), 0) AS id FROM direct_messages
    WHERE from_user_id = ? AND to_user_id = ?
  `).get(otherUserId, req.user.id).id;
  db.prepare(`
    INSERT INTO direct_read_state (user_id, other_user_id, last_read_message_id)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, other_user_id) DO UPDATE SET
      last_read_message_id = MAX(last_read_message_id, excluded.last_read_message_id),
      updated_at = datetime('now')
  `).run(req.user.id, otherUserId, lastIncoming);
  io.to(`user:${req.user.id}`).emit('direct:read', { userId: otherUserId });

  res.json({ messages: decorateMessages('direct', rows, req.user.id) });
});

app.post('/api/direct/messages', requireAuth, (req, res) => {
  let payload;
  try { payload = cleanMessagePayload(req.body, req.user); }
  catch (err) { return res.status(err.status || 400).json({ error:err.message }); }

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
    INSERT INTO direct_messages (from_user_id, to_user_id, content, message_type, media_id, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.user.id, toUserId, payload.content, payload.messageType, payload.mediaId, payload.metadata);

  const rawMessage = db.prepare(`
    SELECT dm.*, u.nickname AS from_nickname
    FROM direct_messages dm JOIN users u ON u.id = dm.from_user_id
    WHERE dm.id = ?
  `).get(info.lastInsertRowid);
  const message = decorateMessages('direct', [rawMessage], req.user.id)[0];

  io.to(`user:${req.user.id}`).to(`user:${toUserId}`).emit('direct:new', message);
  const preview = payload.messageType === 'text' ? payload.content :
    ({ image:'[图片]', video:'[视频]', audio:'[语音]', location:'[位置]' }[payload.messageType]);
  void sendPushToUsers([toUserId], {
    title: `${req.user.nickname} 发来新咨询`, body: notificationPreview(preview),
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
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
  io.emit('group:created', { group });
  res.json({ group });
});

app.patch('/api/groups/:groupId', requireAuth, requireAdmin, (req, res) => {
  const groupId = Number(req.params.groupId);
  const name = cleanText(req.body.name, 40);
  const description = cleanText(req.body.description, 200) || '';
  if (!Number.isInteger(groupId) || groupId < 1) return res.status(400).json({ error: '群聊参数无效' });
  if (!name) return res.status(400).json({ error: '群名称不能为空' });

  const info = db.prepare('UPDATE groups SET name = ?, description = ? WHERE id = ?')
    .run(name, description, groupId);
  if (!info.changes) return res.status(404).json({ error: '群不存在' });

  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
  io.emit('group:updated', { group });
  res.json({ group });
});

app.delete('/api/groups/:groupId', requireAuth, requireAdmin, (req, res) => {
  const groupId = Number(req.params.groupId);
  if (!Number.isInteger(groupId) || groupId < 1) return res.status(400).json({ error: '群聊参数无效' });
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
  if (!group) return res.status(404).json({ error: '群不存在' });

  db.prepare('DELETE FROM groups WHERE id = ?').run(groupId);
  io.emit('group:deleted', { groupId, name: group.name });
  res.json({ ok: true });
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
      AND NOT EXISTS (SELECT 1 FROM message_deletions md
        WHERE md.message_scope = 'group' AND md.message_id = gm.id AND md.user_id = ?)
    ORDER BY gm.id ASC
    LIMIT 500
  `).all(groupId, req.user.id);
  res.json({ messages: decorateMessages('group', rows, req.user.id) });
});

app.post('/api/groups/:groupId/messages', requireAuth, (req, res) => {
  const groupId = Number(req.params.groupId);
  let payload;
  try { payload = cleanMessagePayload(req.body, req.user); }
  catch (err) { return res.status(err.status || 400).json({ error:err.message }); }

  const member = isApprovedMember(groupId, req.user.id);
  if (!member && !req.user.is_admin) return res.status(403).json({ error: '你尚未加入该群' });
  if (!req.user.is_admin && isMuted(member)) return res.status(403).json({ error: `你已被禁言至 ${member.mute_until}` });

  const info = db.prepare(`
    INSERT INTO group_messages (group_id, user_id, content, message_type, media_id, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(groupId, req.user.id, payload.content, payload.messageType, payload.mediaId, payload.metadata);
  const rawMessage = db.prepare(`
    SELECT gm.*, u.nickname, u.is_admin
    FROM group_messages gm JOIN users u ON u.id = gm.user_id
    WHERE gm.id = ?
  `).get(info.lastInsertRowid);
  const message = decorateMessages('group', [rawMessage], req.user.id)[0];
  io.to(`group:${groupId}`).emit('group:new', message);
  const group = db.prepare('SELECT name FROM groups WHERE id = ?').get(groupId);
  const recipients = db.prepare(`
    SELECT user_id FROM group_members
    WHERE group_id = ? AND status = 'approved' AND user_id != ?
  `).all(groupId, req.user.id).map((row) => row.user_id);
  const preview = payload.messageType === 'text' ? payload.content :
    ({ image:'[图片]', video:'[视频]', audio:'[语音]', location:'[位置]' }[payload.messageType]);
  void sendPushToUsers(recipients, {
    title: group?.name || '粉丝交流群', body: notificationPreview(`${req.user.nickname}：${preview}`),
    tag: `group-${groupId}`, url: `/?group=${groupId}`
  }, 'group', groupId).catch((err) => console.error('Web Push 处理失败:', err));
  res.json({ message });
});

app.post('/api/groups/:groupId/messages/:messageId/pin', requireAuth, requireAdmin, (req, res) => {
  const groupId = Number(req.params.groupId);
  const messageId = Number(req.params.messageId);
  const target = db.prepare('SELECT * FROM group_messages WHERE id = ? AND group_id = ?').get(messageId, groupId);
  if (!target) return res.status(404).json({ error: '消息不存在' });

  const shouldPin = !target.is_pinned;
  const tx = db.transaction(() => {
    db.prepare('UPDATE group_messages SET is_pinned = 0 WHERE group_id = ?').run(groupId);
    if (shouldPin) db.prepare('UPDATE group_messages SET is_pinned = 1 WHERE id = ?').run(messageId);
  });
  tx();
  io.to(`group:${groupId}`).emit('group:pinned', { groupId, messageId: shouldPin ? messageId : null });
  res.json({ ok: true, pinned: shouldPin });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = Number(err.status || err.statusCode) || 500;
  if (status >= 500) console.error('请求处理失败:', err);
  const message = err.type === 'entity.too.large' ? '上传文件过大' : (err.message || '服务器错误');
  res.status(status).json({ error:message });
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
