const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const state = {
  me: null,
  socket: null,
  directContact: null,
  groups: [],
  activeGroup: null,
  manageGroup: null,
  currentPage: 'home',
  pushEndpoint: null,
  directUnread: {},
  groupUnread: {},
  pendingRoute: null,
  actionMessage: null,
  pendingMedia: null,
  recorder: null,
  recordingStream: null,
  recordingChunks: [],
  recordingScope: null,
  recordingTimer: null,
  imageViewerUrl: null,
  imageViewerName: null,
  imageViewerScale: 1,
  imageViewerBaseWidth: 0,
  imageViewerBaseHeight: 0
};

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

function fmtTime(value) {
  if (!value) return '';
  const dt = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  return dt.toLocaleString('zh-CN', { hour12: false });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
  }[c]));
}

function beijingGreeting() {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone:'Asia/Shanghai', hour:'2-digit', hourCycle:'h23'
  }).format(new Date()));
  if (hour >= 5 && hour < 9) return '早上';
  if (hour >= 9 && hour < 12) return '上午';
  if (hour >= 12 && hour < 18) return '下午';
  return '晚上';
}

function renderHomeGreeting() {
  if (!state.me) return;
  const nickname = `<strong>${escapeHtml(state.me.nickname)}</strong>`;
  const adminTitle = state.me.isAdmin ? ' 管理员' : '';
  const destination = state.me.isAdmin ? '废慨vc咨询中心后台' : '废慨vc咨询中心';
  $('#homeGreeting').innerHTML = `尊敬的 ${nickname}${adminTitle}，北京时间${beijingGreeting()}好，欢迎来到${destination}。`;
}

function showAuth() {
  $('#authView').classList.remove('hidden');
  $('#appView').classList.add('hidden');
}

async function showApp() {
  $('#authView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  $('#meCard').innerHTML = `<strong>${escapeHtml(state.me.nickname)}</strong><br><span class="muted">${state.me.isAdmin ? '管理员' : '粉丝用户'}</span>`;
  $('#adminBtn').classList.toggle('hidden', !state.me.isAdmin);
  renderHomeGreeting();
  connectSocket();
  await Promise.all([setupPush(false), loadDirectUnread()]);
  await openInitialRoute();
}

function totalUnread(map) { return Object.values(map).reduce((sum, count) => sum + count, 0); }
function setBadge(selector, count) {
  const el = $(selector);
  el.textContent = count > 99 ? '99+' : String(count);
  el.classList.toggle('hidden', !count);
}
function renderUnread() {
  setBadge('#directUnread', totalUnread(state.directUnread));
  setBadge('#groupUnread', totalUnread(state.groupUnread));
}

function clearDirectUnread(userId) {
  delete state.directUnread[userId];
  renderUnread();
  document.querySelector(`[data-user-id="${userId}"] .unread-badge`)?.remove();
}

function clearGroupUnread(groupId) {
  delete state.groupUnread[groupId];
  renderUnread();
  document.querySelector(`[data-open-group="${groupId}"]`)?.closest('.group-card')?.querySelector('.unread-badge')?.remove();
}

async function loadDirectUnread() {
  try {
    const { unread } = await api('/api/direct/unread');
    const serverUnread = Object.fromEntries(unread.map((item) => [item.userId, item.count]));
    for (const [userId, count] of Object.entries(state.directUnread)) {
      serverUnread[userId] = Math.max(serverUnread[userId] || 0, count);
    }
    state.directUnread = serverUnread;
    renderUnread();
  } catch (err) {
    console.error('加载私聊未读数失败:', err);
  }
}

function activeChat() {
  if (document.visibilityState !== 'visible' || !document.hasFocus()) return null;
  if (state.currentPage === 'direct' && state.directContact) return { chatType:'direct', chatId:state.directContact.id };
  if (state.currentPage === 'groups' && state.activeGroup) return { chatType:'group', chatId:state.activeGroup.id };
  return null;
}

function updatePresence() {
  if (!state.socket?.connected || !state.pushEndpoint) return;
  const chat = activeChat();
  state.socket.emit('presence:update', {
    endpoint: state.pushEndpoint,
    visible: Boolean(chat),
    chatType: chat?.chatType || null,
    chatId: chat?.chatId || null
  });
}

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function setNotificationStatus(message, type = '') {
  const status = $('#notificationStatus');
  status.textContent = message;
  status.className = `notification-status ${type}`.trim();
}

function isIosDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandaloneApp() {
  return navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

function subscriptionUsesKey(subscription, publicKey) {
  const currentKey = subscription?.options?.applicationServerKey;
  if (!currentKey) return true;
  const expected = urlBase64ToUint8Array(publicKey);
  const current = new Uint8Array(currentKey);
  return current.length === expected.length && current.every((value, index) => value === expected[index]);
}

async function setupPush(requestPermission) {
  const button = $('#enableNotifications');
  button.classList.remove('hidden');
  if (!window.isSecureContext) {
    button.textContent = '需要 HTTPS'; button.disabled = true;
    setNotificationStatus('新消息通知只能在 HTTPS 网站上开启。', 'error'); return;
  }
  if (isIosDevice() && !isStandaloneApp()) {
    button.textContent = '请先添加到主屏幕'; button.disabled = true;
    setNotificationStatus('iPhone/iPad：请用 Safari 的“分享 → 添加到主屏幕”，再从主屏幕打开本站并开启通知。', 'error'); return;
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    button.textContent = '此浏览器不支持通知'; button.disabled = true;
    setNotificationStatus('当前浏览器不支持 Web Push，请使用最新版 Chrome、Edge 或 Safari。', 'error'); return;
  }

  button.disabled = true;
  button.textContent = '正在开启…';
  setNotificationStatus(requestPermission ? '正在请求通知权限…' : '正在检查通知状态…');
  try {
    // Permission must be requested before any await so mobile browsers retain the click gesture.
    let permission = Notification.permission;
    if (requestPermission && permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      const denied = permission === 'denied';
      button.textContent = denied ? '通知已被浏览器禁止' : '🔔 开启新消息通知';
      button.disabled = denied;
      setNotificationStatus(denied ? '通知权限已被禁止，请在浏览器的网站设置中改为“允许”。' : '尚未允许通知，请点击按钮开启。', denied ? 'error' : '');
      return;
    }

    setNotificationStatus('正在注册后台通知服务…');
    const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache:'none' });
    await registration.update().catch(() => {});
    await navigator.serviceWorker.ready;
    const { publicKey } = await api('/api/push/public-key');
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !subscriptionUsesKey(subscription, publicKey)) {
      const oldEndpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await api('/api/push/unsubscribe', { method:'POST', body:JSON.stringify({ endpoint:oldEndpoint }) }).catch(() => {});
      subscription = null;
    }
    if (!subscription) subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
    await api('/api/push/subscribe', { method:'POST', body:JSON.stringify({ subscription:subscription.toJSON() }) });
    state.pushEndpoint = subscription.endpoint;
    button.textContent = '✓ 新消息通知已开启'; button.disabled = true;
    button.classList.add('hidden');
    setNotificationStatus('新消息通知已开启。', 'success');
    updatePresence();
    if (requestPermission) {
      setNotificationStatus('订阅成功，正在发送一条测试通知…');
      await api('/api/push/test', { method:'POST' });
      setNotificationStatus('通知已开启，测试通知已发送。', 'success');
    }
  } catch (err) {
    const message = err.message || '开启通知失败';
    button.textContent = '🔔 重试开启通知'; button.disabled = false;
    setNotificationStatus(message, 'error');
    if (requestPermission) toast(message);
  }
}

async function openInitialRoute() {
  const params = new URLSearchParams(location.search);
  const directId = Number(params.get('direct'));
  const groupId = Number(params.get('group'));
  if (directId) {
    state.pendingRoute = { type:'direct', id:directId };
    goPage('direct');
  } else if (groupId) {
    state.pendingRoute = { type:'group', id:groupId };
    goPage('groups');
  } else goPage('home');
}

function connectSocket() {
  if (state.socket) state.socket.disconnect();
  state.socket = io();
  state.socket.on('connect', () => { updatePresence(); loadDirectUnread(); });
  state.socket.on('direct:new', (msg) => {
    const otherId = msg.from_user_id === state.me.id ? msg.to_user_id : msg.from_user_id;
    const chat = activeChat();
    if (msg.from_user_id !== state.me.id && !(chat?.chatType === 'direct' && chat.chatId === otherId)) {
      state.directUnread[otherId] = (state.directUnread[otherId] || 0) + 1;
      renderUnread();
      if (state.currentPage === 'direct') loadDirectContacts();
    }
    if (state.currentPage === 'direct' && state.directContact?.id === otherId) loadDirectMessages();
  });
  state.socket.on('direct:read', ({ userId }) => {
    clearDirectUnread(userId);
    if (state.currentPage === 'direct') loadDirectContacts();
  });
  state.socket.on('group:new', (msg) => {
    const chat = activeChat();
    if (msg.user_id !== state.me.id && !(chat?.chatType === 'group' && chat.chatId === msg.group_id)) {
      state.groupUnread[msg.group_id] = (state.groupUnread[msg.group_id] || 0) + 1;
      renderUnread();
      if (state.currentPage === 'groups') loadGroups();
    }
    if (state.currentPage === 'groups' && state.activeGroup?.id === msg.group_id) loadGroupMessages(msg.group_id);
  });
  state.socket.on('group:pinned', ({ groupId }) => {
    if (state.activeGroup?.id === groupId) loadGroupMessages(groupId);
  });
  state.socket.on('message:updated', ({ scope, groupId }) => {
    if (scope === 'direct' && state.currentPage === 'direct' && state.directContact) loadDirectMessages();
    if (scope === 'group' && state.currentPage === 'groups' && state.activeGroup?.id === groupId) loadGroupMessages(groupId);
  });
  state.socket.on('message:deleted', ({ scope, groupId }) => {
    if (scope === 'direct' && state.currentPage === 'direct' && state.directContact) loadDirectMessages();
    if (scope === 'group' && state.currentPage === 'groups' && state.activeGroup?.id === groupId) loadGroupMessages(groupId);
  });
  state.socket.on('group:approved', ({ groupId }) => {
    toast('你的入群申请已通过');
    state.socket.emit('group:join', groupId);
    loadGroups();
  });
  state.socket.on('group:rejected', () => { toast('你的入群申请未通过'); loadGroups(); });
  state.socket.on('group:kicked', ({ groupId }) => {
    toast('你已被移出群聊');
    if (state.activeGroup?.id === groupId) state.activeGroup = null;
    loadGroups();
  });
  state.socket.on('group:mute', () => toast('管理员更新了你的禁言状态'));
  state.socket.on('group:request', () => {
    if (state.me.isAdmin && state.manageGroup) loadGroupManage(state.manageGroup.id);
  });
}

function goPage(name) {
  const titles = { home:'我的主页', direct:'一对一咨询', groups:'粉丝交流群', admin:'管理后台' };
  $$('.page').forEach(x => x.classList.add('hidden'));
  $(`#${name}Page`).classList.remove('hidden');
  $$('.nav-btn').forEach(x => x.classList.toggle('active', x.dataset.page === name));
  $('#pageTitle').textContent = titles[name];
  state.currentPage = name;
  if (name === 'home') renderHomeGreeting();
  $('.sidebar').classList.remove('open');
  if (name === 'direct') loadDirectContacts();
  if (name === 'groups') loadGroups();
  if (name === 'admin' && state.me.isAdmin) loadAdminGroups();
  updatePresence();
}

// Auth tabs
$('#loginTab').onclick = () => {
  $('#loginTab').classList.add('active'); $('#registerTab').classList.remove('active');
  $('#loginForm').classList.remove('hidden'); $('#registerForm').classList.add('hidden');
};
$('#registerTab').onclick = () => {
  $('#registerTab').classList.add('active'); $('#loginTab').classList.remove('active');
  $('#registerForm').classList.remove('hidden'); $('#loginForm').classList.add('hidden');
};

$('#loginForm').onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const data = await api('/api/login', { method:'POST', body:JSON.stringify(Object.fromEntries(f)) });
    state.me = data.user; showApp();
  } catch (err) { toast(err.message); }
};

$('#registerForm').onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const data = await api('/api/register', { method:'POST', body:JSON.stringify(Object.fromEntries(f)) });
    state.me = data.user; showApp();
  } catch (err) { toast(err.message); }
};

$('#logoutBtn').onclick = async () => {
  if (state.pushEndpoint) await api('/api/push/unsubscribe', { method:'POST', body:JSON.stringify({ endpoint:state.pushEndpoint }) }).catch(() => {});
  await api('/api/logout', { method:'POST' });
  state.me = null;
  state.socket?.disconnect();
  showAuth();
};

$$('.nav-btn').forEach(btn => btn.onclick = () => goPage(btn.dataset.page));
$$('[data-goto]').forEach(btn => btn.onclick = () => goPage(btn.dataset.goto));
$('#mobileMenu').onclick = () => $('.sidebar').classList.toggle('open');
$('#enableNotifications').onclick = () => setupPush(true);
navigator.serviceWorker?.addEventListener('message', (event) => {
  if (event.data?.type === 'push-subscription-changed') setupPush(false);
});
document.addEventListener('visibilitychange', updatePresence);
window.addEventListener('focus', updatePresence);
window.addEventListener('blur', updatePresence);

// Direct chat
async function loadDirectContacts() {
  try {
    const { contacts } = await api('/api/direct/contacts');
    const contactIds = new Set(contacts.map((contact) => String(contact.id)));
    for (const contact of contacts) {
      state.directUnread[contact.id] = Math.max(state.directUnread[contact.id] || 0, contact.unreadCount || 0);
      if (!state.directUnread[contact.id]) delete state.directUnread[contact.id];
    }
    for (const userId of Object.keys(state.directUnread)) {
      if (!contactIds.has(String(userId))) delete state.directUnread[userId];
    }
    renderUnread();
    const box = $('#directContacts');
    if (!contacts.length) {
      box.innerHTML = '<div class="contact-item muted">暂无可用联系人</div>';
      return;
    }
    box.innerHTML = contacts.map(c => `
      <div class="contact-item ${state.directContact?.id === c.id ? 'active' : ''}" data-user-id="${c.id}">
        <div class="contact-name"><span>${escapeHtml(c.nickname)} ${c.isAdmin ? '🛡️' : ''}</span>${state.directUnread[c.id] ? `<span class="unread-badge">${state.directUnread[c.id]}</span>` : ''}</div>
        <div class="contact-meta">${c.lastMessageContent ? `${escapeHtml(c.lastMessageContent.slice(0, 38))}${c.lastMessageContent.length > 38 ? '…' : ''} · ${fmtTime(c.lastMessageAt)}` : escapeHtml(c.email)}</div>
      </div>`).join('');
    $$('#directContacts .contact-item[data-user-id]').forEach(el => el.onclick = async () => {
      state.directContact = contacts.find(c => c.id === Number(el.dataset.userId));
      clearDirectUnread(state.directContact.id);
      await loadDirectMessages();
      await loadDirectContacts();
      updatePresence();
    });
    if (!state.directContact && contacts.length === 1) {
      state.directContact = contacts[0];
      loadDirectMessages();
    }
    if (state.pendingRoute?.type === 'direct') {
      const target = contacts.find(c => c.id === state.pendingRoute.id);
      state.pendingRoute = null;
      if (target) {
        state.directContact = target;
        clearDirectUnread(target.id);
        await loadDirectMessages();
        await loadDirectContacts();
        updatePresence();
      }
    }
  } catch (err) { toast(err.message); }
}

async function loadDirectMessages() {
  if (!state.directContact) return;
  try {
    const query = state.me.isAdmin ? `?userId=${state.directContact.id}` : '';
    const { messages } = await api('/api/direct/messages' + query);
    $('#directHeader').textContent = `与 ${state.directContact.nickname} 的对话`;
    $('#directForm').classList.remove('hidden');
    $('#directMessages').innerHTML = messages.map(m => messageHtml(m, m.from_user_id === state.me.id, false)).join('');
    bindMessageInteractions($('#directMessages'), 'direct');
    scrollBottom($('#directMessages'));
  } catch (err) { toast(err.message); }
}

$('#directForm').onsubmit = async (e) => {
  e.preventDefault();
  const content = $('#directInput').value.trim();
  if (!content || !state.directContact) return;
  try {
    await sendMessage('direct', { content });
    $('#directInput').value = '';
  } catch (err) { toast(err.message); }
};

// Groups
async function loadGroups() {
  try {
    const { groups } = await api('/api/groups');
    state.groups = groups;
    const box = $('#groupList');
    box.innerHTML = groups.length ? groups.map(g => {
      let action = '';
      if (state.me.isAdmin || g.my_status === 'approved') action = `<button class="primary" data-open-group="${g.id}">进入群聊</button>`;
      else if (g.my_status === 'pending') action = `<button class="small-btn" disabled>等待审核</button>`;
      else action = `<button class="secondary" data-join-group="${g.id}">申请加入</button>`;
      return `<article class="group-card">
        <h3><span>${escapeHtml(g.name)}</span>${state.groupUnread[g.id] ? `<span class="unread-badge">${state.groupUnread[g.id]}</span>` : ''}</h3>
        <p>${escapeHtml(g.description || '暂无简介')}</p>
        <div class="badge">${g.member_count} 位成员</div><br>
        ${action}
      </article>`;
    }).join('') : '<div class="panel muted">目前还没有群聊。</div>';

    $$('[data-join-group]').forEach(btn => btn.onclick = async () => {
      try { await api(`/api/groups/${btn.dataset.joinGroup}/join`, { method:'POST' }); toast('入群申请已提交'); loadGroups(); }
      catch (err) { toast(err.message); }
    });
    $$('[data-open-group]').forEach(btn => btn.onclick = () => openGroup(Number(btn.dataset.openGroup)));
    if (state.pendingRoute?.type === 'group') {
      const groupId = state.pendingRoute.id; state.pendingRoute = null;
      if (groups.some(g => g.id === groupId && (state.me.isAdmin || g.my_status === 'approved'))) openGroup(groupId);
    }
  } catch (err) { toast(err.message); }
}

async function openGroup(groupId) {
  state.activeGroup = state.groups.find(g => g.id === groupId) || { id: groupId, name:'群聊' };
  $('#groupChat').classList.remove('hidden');
  $('#groupHeader').textContent = state.activeGroup.name;
  clearGroupUnread(groupId);
  state.socket?.emit('group:join', groupId);
  await loadGroupMessages(groupId);
  updatePresence();
  $('#groupChat').scrollIntoView({ behavior:'smooth', block:'start' });
}

async function loadGroupMessages(groupId) {
  try {
    const { messages } = await api(`/api/groups/${groupId}/messages`);
    const pinned = messages.find(m => m.is_pinned);
    $('#pinnedMessage').classList.toggle('hidden', !pinned);
    $('#pinnedMessage').innerHTML = pinned ? `📌 <strong>置顶：</strong>${escapeHtml(messageSummary(pinned))}` : '';
    $('#groupMessages').innerHTML = messages.map(m => messageHtml(m, m.user_id === state.me.id, true)).join('');
    bindMessageInteractions($('#groupMessages'), 'group');
    $$('[data-pin-message]').forEach(btn => btn.onclick = async () => {
      try { await api(`/api/groups/${groupId}/messages/${btn.dataset.pinMessage}/pin`, { method:'POST' }); }
      catch (err) { toast(err.message); }
    });
    scrollBottom($('#groupMessages'));
  } catch (err) { toast(err.message); }
}

function messageSummary(message) {
  if (message.is_recalled) return '消息已撤回';
  return ({ image:'[图片]', video:'[视频]', audio:'[语音]', location:'[位置]' }[message.message_type]) || message.content || '';
}

function messageContentHtml(message) {
  if (message.is_recalled) return '<div class="message-body recalled-message">此消息已撤回</div>';
  const url = escapeHtml(message.media_url || '');
  const mimeType = escapeHtml(message.metadata?.mimeType || '');
  if (message.message_type === 'image') {
    const imageName = escapeHtml(message.metadata?.originalName || '聊天图片');
    return `<img class="message-media message-image" src="${url}" alt="聊天图片" loading="lazy" data-preview-image data-image-name="${imageName}" />`;
  }
  if (message.message_type === 'video') {
    return `<video class="message-media" controls playsinline preload="metadata"><source src="${url}" type="${mimeType}" />你的浏览器无法播放此视频。</video>`;
  }
  if (message.message_type === 'audio') {
    return `<audio class="message-audio" controls preload="metadata" src="${url}">你的浏览器无法播放此语音。</audio>`;
  }
  if (message.message_type === 'location') {
    const latitude = Number(message.metadata?.latitude);
    const longitude = Number(message.metadata?.longitude);
    const safeLatitude = Number.isFinite(latitude) ? latitude.toFixed(6) : '0';
    const safeLongitude = Number.isFinite(longitude) ? longitude.toFixed(6) : '0';
    const mapUrl = `https://www.openstreetmap.org/?mlat=${safeLatitude}&mlon=${safeLongitude}#map=16/${safeLatitude}/${safeLongitude}`;
    return `<a class="location-card" href="${mapUrl}" target="_blank" rel="noopener noreferrer"><strong>📍 查看共享位置</strong><span>${safeLatitude}, ${safeLongitude}</span></a>`;
  }
  return `<div class="message-body">${escapeHtml(message.content)}</div>`;
}

function messageHtml(message, mine, isGroup) {
  const sender = isGroup ? (message.is_admin ? `${message.nickname} 🛡️` : message.nickname) : message.from_nickname;
  const reactions = (message.reactions || []).map(reaction => `
    <button type="button" class="reaction-chip ${reaction.mine ? 'mine' : ''}" data-existing-reaction="${escapeHtml(reaction.emoji)}">${escapeHtml(reaction.emoji)} ${reaction.count}</button>
  `).join('');
  return `<div class="message-row ${mine ? 'mine' : ''}" data-message-id="${message.id}" data-message-mine="${mine ? '1' : '0'}" data-message-recalled="${message.is_recalled ? '1' : '0'}">
    <div class="message-stack">
      ${reactions ? `<div class="message-reactions">${reactions}</div>` : ''}
      <div class="bubble" data-message-bubble>
        <div class="message-meta">${escapeHtml(sender || '')} · ${fmtTime(message.created_at)}</div>
        ${messageContentHtml(message)}
        ${isGroup && state.me.isAdmin && !message.is_recalled ? `<div class="message-tools"><button type="button" class="small-btn" data-pin-message="${message.id}">📌 置顶</button></div>` : ''}
      </div>
    </div>
  </div>`;
}

function openMessageActions(row, scope) {
  state.actionMessage = {
    scope,
    id: Number(row.dataset.messageId),
    mine: row.dataset.messageMine === '1',
    recalled: row.dataset.messageRecalled === '1'
  };
  const canReact = !state.actionMessage.recalled;
  $('.reaction-picker').classList.toggle('hidden', !canReact);
  $('.action-title').textContent = canReact ? '回应这条消息' : '消息操作';
  $('#recallMessage').classList.toggle('hidden', !state.actionMessage.mine || state.actionMessage.recalled);
  $('#messageActions').classList.remove('hidden');
}

function closeMessageActions() {
  $('#messageActions').classList.add('hidden');
  state.actionMessage = null;
}

async function toggleReaction(scope, messageId, emoji) {
  await api(`/api/messages/${scope}/${messageId}/reactions`, {
    method:'POST', body:JSON.stringify({ emoji })
  });
}

function bindMessageInteractions(container, scope) {
  container.querySelectorAll('.message-row').forEach(row => {
    const bubble = row.querySelector('[data-message-bubble]');
    if (!bubble) return;
    let timer = null;
    let longPressed = false;
    let startX = 0;
    let startY = 0;
    const cancel = () => { clearTimeout(timer); timer = null; };
    bubble.addEventListener('pointerdown', (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      if (event.target.closest('button')) return;
      longPressed = false;
      startX = event.clientX; startY = event.clientY;
      timer = setTimeout(() => {
        timer = null;
        longPressed = true;
        navigator.vibrate?.(25);
        openMessageActions(row, scope);
      }, 550);
    });
    bubble.addEventListener('pointermove', (event) => {
      if (Math.abs(event.clientX - startX) > 10 || Math.abs(event.clientY - startY) > 10) cancel();
    });
    bubble.addEventListener('pointerup', cancel);
    bubble.addEventListener('pointercancel', cancel);
    bubble.addEventListener('pointerleave', cancel);
    bubble.addEventListener('click', (event) => {
      if (!longPressed) return;
      event.preventDefault();
      event.stopPropagation();
      longPressed = false;
    }, true);
    bubble.addEventListener('contextmenu', (event) => {
      if (event.target.closest('button')) return;
      event.preventDefault();
      cancel();
      openMessageActions(row, scope);
    });
    row.querySelectorAll('[data-existing-reaction]').forEach(button => {
      button.onclick = async () => {
        try { await toggleReaction(scope, Number(row.dataset.messageId), button.dataset.existingReaction); }
        catch (err) { toast(err.message); }
      };
    });
    row.querySelectorAll('[data-preview-image]').forEach(image => {
      image.addEventListener('click', (event) => {
        event.stopPropagation();
        openImageViewer(image.currentSrc || image.src, image.dataset.imageName || '聊天图片');
      });
      image.addEventListener('dragstart', (event) => event.preventDefault());
    });
  });
}

function updateImageViewerSize() {
  const image = $('#imageViewerImage');
  if (!state.imageViewerBaseWidth || !state.imageViewerBaseHeight) return;
  image.style.width = `${Math.round(state.imageViewerBaseWidth * state.imageViewerScale)}px`;
  image.style.height = `${Math.round(state.imageViewerBaseHeight * state.imageViewerScale)}px`;
  $('#imageZoomLabel').textContent = `${Math.round(state.imageViewerScale * 100)}%`;
}

function fitImageViewer() {
  const image = $('#imageViewerImage');
  const stage = $('#imageViewerStage');
  if (!image.naturalWidth || !image.naturalHeight) return;
  const maxWidth = Math.max(160, stage.clientWidth - 40);
  const maxHeight = Math.max(160, stage.clientHeight - 40);
  const fitRatio = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  state.imageViewerBaseWidth = image.naturalWidth * fitRatio;
  state.imageViewerBaseHeight = image.naturalHeight * fitRatio;
  state.imageViewerScale = 1;
  updateImageViewerSize();
}

function setImageViewerScale(scale) {
  state.imageViewerScale = Math.min(4, Math.max(.5, scale));
  updateImageViewerSize();
}

function openImageViewer(url, name) {
  state.imageViewerUrl = url;
  state.imageViewerName = name;
  state.imageViewerScale = 1;
  const viewer = $('#imageViewer');
  const image = $('#imageViewerImage');
  viewer.classList.remove('hidden');
  viewer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('viewer-open');
  image.onload = fitImageViewer;
  image.src = url;
  if (image.complete) fitImageViewer();
  $('#imageViewerClose').focus();
}

function closeImageViewer() {
  const viewer = $('#imageViewer');
  viewer.classList.add('hidden');
  viewer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('viewer-open');
  $('#imageViewerImage').removeAttribute('src');
  state.imageViewerUrl = null;
}

async function downloadViewerImage() {
  if (!state.imageViewerUrl) return;
  const button = $('#imageDownload');
  button.disabled = true;
  try {
    const response = await fetch(state.imageViewerUrl);
    if (!response.ok) throw new Error('图片下载失败');
    const blob = await response.blob();
    const extension = ({ 'image/jpeg':'.jpg', 'image/png':'.png', 'image/webp':'.webp', 'image/gif':'.gif' })[blob.type] || '';
    const requestedName = String(state.imageViewerName || '').split(/[\\/]/).pop();
    const filename = requestedName && /\.[a-z0-9]{2,5}$/i.test(requestedName) ? requestedName : `聊天图片${extension}`;
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch (err) {
    toast(err.message || '图片下载失败');
  } finally {
    button.disabled = false;
  }
}

$('#imageZoomOut').onclick = () => setImageViewerScale(state.imageViewerScale - .25);
$('#imageZoomIn').onclick = () => setImageViewerScale(state.imageViewerScale + .25);
$('#imageZoomReset').onclick = fitImageViewer;
$('#imageDownload').onclick = downloadViewerImage;
$('#imageViewerClose').onclick = closeImageViewer;
$('#imageViewer').onclick = (event) => { if (event.target === $('#imageViewer')) closeImageViewer(); };
$('#imageViewerImage').ondblclick = () => setImageViewerScale(state.imageViewerScale === 1 ? 2 : 1);
$('#imageViewerStage').addEventListener('wheel', (event) => {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  setImageViewerScale(state.imageViewerScale + (event.deltaY < 0 ? .25 : -.25));
}, { passive:false });
window.addEventListener('resize', () => {
  if (!$('#imageViewer').classList.contains('hidden')) fitImageViewer();
});

async function sendMessage(scope, payload) {
  if (scope === 'direct') {
    if (!state.directContact) throw new Error('请先选择联系人');
    return api('/api/direct/messages', {
      method:'POST',
      body:JSON.stringify({ ...payload, toUserId:state.me.isAdmin ? state.directContact.id : undefined })
    });
  }
  if (!state.activeGroup) throw new Error('请先进入群聊');
  return api(`/api/groups/${state.activeGroup.id}/messages`, {
    method:'POST', body:JSON.stringify(payload)
  });
}

$('#groupForm').onsubmit = async (e) => {
  e.preventDefault();
  const content = $('#groupInput').value.trim();
  if (!content || !state.activeGroup) return;
  try {
    await sendMessage('group', { content });
    $('#groupInput').value = '';
  } catch (err) { toast(err.message); }
};

function refreshActiveMessages(scope) {
  if (scope === 'direct' && state.directContact) return loadDirectMessages();
  if (scope === 'group' && state.activeGroup) return loadGroupMessages(state.activeGroup.id);
  return Promise.resolve();
}

$('#messageActions').onclick = (event) => {
  if (event.target === $('#messageActions')) closeMessageActions();
};
$('.action-sheet').onclick = (event) => event.stopPropagation();
$('#closeMessageActions').onclick = closeMessageActions;
$$('[data-reaction]').forEach(button => button.onclick = async () => {
  const target = state.actionMessage;
  if (!target) return;
  closeMessageActions();
  try {
    await toggleReaction(target.scope, target.id, button.dataset.reaction);
    await refreshActiveMessages(target.scope);
  } catch (err) { toast(err.message); }
});
$('#recallMessage').onclick = async () => {
  const target = state.actionMessage;
  if (!target || !confirm('撤回后，聊天中的所有人都将无法再查看这条消息。确定撤回吗？')) return;
  closeMessageActions();
  try {
    await api(`/api/messages/${target.scope}/${target.id}/recall`, { method:'POST' });
    await refreshActiveMessages(target.scope);
  } catch (err) { toast(err.message); }
};
$('#deleteMessage').onclick = async () => {
  const target = state.actionMessage;
  if (!target || !confirm('这条消息只会从你自己的聊天记录中删除，确定继续吗？')) return;
  closeMessageActions();
  try {
    await api(`/api/messages/${target.scope}/${target.id}`, { method:'DELETE' });
    await refreshActiveMessages(target.scope);
  } catch (err) { toast(err.message); }
};
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('#messageActions').classList.contains('hidden')) closeMessageActions();
  if (event.key === 'Escape' && !$('#imageViewer').classList.contains('hidden')) closeImageViewer();
});

async function uploadMedia(file) {
  const res = await fetch('/api/media/upload', {
    method:'POST',
    headers:{ 'Content-Type':file.type, 'X-File-Name':encodeURIComponent(file.name || 'media') },
    body:file
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '上传失败');
  return data.media;
}

function mediaSizeLimit(type) {
  return type === 'video' ? 50 * 1024 * 1024 : type === 'image' ? 12 * 1024 * 1024 : 15 * 1024 * 1024;
}

async function uploadAndSend(scope, type, file) {
  if (!file?.size) throw new Error('请选择有效文件');
  if (file.size > mediaSizeLimit(type)) {
    throw new Error(type === 'video' ? '视频不能超过 50MB' : type === 'image' ? '图片不能超过 12MB' : '语音不能超过 15MB');
  }
  toast(type === 'video' ? '视频正在上传…' : type === 'image' ? '图片正在上传…' : '语音正在上传…');
  const media = await uploadMedia(file);
  await sendMessage(scope, { messageType:type, mediaId:media.id });
  toast('发送成功');
}

const mediaPicker = $('#mediaPicker');
mediaPicker.onchange = async () => {
  const pending = state.pendingMedia;
  const file = mediaPicker.files?.[0];
  mediaPicker.value = '';
  state.pendingMedia = null;
  if (!pending || !file) return;
  try { await uploadAndSend(pending.scope, pending.type, file); }
  catch (err) { toast(err.message); }
};

function chooseMedia(scope, type) {
  if (scope === 'direct' && !state.directContact) return toast('请先选择联系人');
  if (scope === 'group' && !state.activeGroup) return toast('请先进入群聊');
  state.pendingMedia = { scope, type };
  mediaPicker.accept = type === 'image' ? 'image/jpeg,image/png,image/webp,image/gif' : 'video/mp4,video/webm,video/quicktime';
  mediaPicker.click();
}

function resetRecordingUi() {
  clearTimeout(state.recordingTimer);
  state.recordingStream?.getTracks().forEach(track => track.stop());
  $$('[data-rich-action="audio"]').forEach(button => {
    button.classList.remove('recording');
    button.textContent = '🎤 语音';
  });
  state.recorder = null;
  state.recordingStream = null;
  state.recordingScope = null;
  state.recordingTimer = null;
}

async function startVoiceRecording(scope) {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('当前浏览器不支持语音录制');
  if (scope === 'direct' && !state.directContact) throw new Error('请先选择联系人');
  if (scope === 'group' && !state.activeGroup) throw new Error('请先进入群聊');
  const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
  const supportedType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus']
    .find(type => MediaRecorder.isTypeSupported(type));
  let recorder;
  try { recorder = new MediaRecorder(stream, supportedType ? { mimeType:supportedType } : undefined); }
  catch (err) {
    stream.getTracks().forEach(track => track.stop());
    throw err;
  }
  state.recorder = recorder;
  state.recordingStream = stream;
  state.recordingChunks = [];
  state.recordingScope = scope;
  const button = document.querySelector(`[data-rich-action="audio"][data-scope="${scope}"]`);
  button.classList.add('recording');
  button.textContent = '⏹️ 停止录音';
  recorder.ondataavailable = event => { if (event.data.size) state.recordingChunks.push(event.data); };
  recorder.onstop = async () => {
    const chunks = state.recordingChunks;
    const recordingScope = state.recordingScope;
    const mimeType = recorder.mimeType?.split(';')[0] || chunks[0]?.type?.split(';')[0] || 'audio/webm';
    resetRecordingUi();
    const blob = new Blob(chunks, { type:mimeType });
    if (blob.size < 200) return toast('录音时间太短，请重新录制');
    const extension = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
    try { await uploadAndSend(recordingScope, 'audio', new File([blob], `voice-${Date.now()}.${extension}`, { type:mimeType })); }
    catch (err) { toast(err.message); }
  };
  recorder.onerror = () => { resetRecordingUi(); toast('录音失败，请检查麦克风权限'); };
  recorder.start(500);
  state.recordingTimer = setTimeout(() => {
    if (state.recorder?.state === 'recording') state.recorder.stop();
  }, 60000);
  toast('正在录音，再点一次“停止录音”即可发送');
}

async function toggleVoiceRecording(scope) {
  if (state.recorder?.state === 'recording') {
    state.recorder.stop();
    return;
  }
  await startVoiceRecording(scope);
}

async function shareLocation(scope) {
  if (!navigator.geolocation) throw new Error('当前浏览器不支持定位');
  if (scope === 'direct' && !state.directContact) throw new Error('请先选择联系人');
  if (scope === 'group' && !state.activeGroup) throw new Error('请先进入群聊');
  toast('正在获取位置…');
  const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, {
    enableHighAccuracy:true, timeout:15000, maximumAge:30000
  }));
  await sendMessage(scope, {
    messageType:'location',
    metadata:{ latitude:position.coords.latitude, longitude:position.coords.longitude, accuracy:position.coords.accuracy }
  });
  toast('位置已发送');
}

$$('[data-rich-action]').forEach(button => button.onclick = async () => {
  const { scope, richAction } = button.dataset;
  try {
    if (richAction === 'image' || richAction === 'video') chooseMedia(scope, richAction);
    else if (richAction === 'audio') await toggleVoiceRecording(scope);
    else if (richAction === 'location') await shareLocation(scope);
  } catch (err) {
    const permissionMessage = err?.name === 'NotAllowedError' ? '权限被拒绝，请在浏览器的网站设置中允许麦克风或位置权限' : err.message;
    toast(permissionMessage || '操作失败');
  }
});

// Admin
$('#createGroupForm').onsubmit = async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  try {
    await api('/api/groups', { method:'POST', body:JSON.stringify(body) });
    e.target.reset(); toast('群聊已创建'); loadAdminGroups();
  } catch (err) { toast(err.message); }
};

async function loadAdminGroups() {
  const { groups } = await api('/api/groups');
  state.groups = groups;
  $('#adminGroupList').innerHTML = groups.length ? groups.map(g => `
    <div class="admin-group-row">
      <div><strong>${escapeHtml(g.name)}</strong><div class="muted">${g.member_count} 位成员</div></div>
      <button class="small-btn" data-manage-group="${g.id}">管理</button>
    </div>`).join('') : '<div class="muted">暂无群聊</div>';
  $$('[data-manage-group]').forEach(btn => btn.onclick = () => loadGroupManage(Number(btn.dataset.manageGroup)));
}

async function loadGroupManage(groupId) {
  state.manageGroup = state.groups.find(g => g.id === groupId);
  $('#groupManagePanel').classList.remove('hidden');
  $('#manageGroupTitle').textContent = `管理：${state.manageGroup?.name || '群聊'}`;
  try {
    const [r1, r2] = await Promise.all([
      api(`/api/groups/${groupId}/requests`),
      api(`/api/groups/${groupId}/members`)
    ]);
    $('#joinRequests').innerHTML = r1.requests.length ? r1.requests.map(u => `
      <div class="request-row">
        <div><strong>${escapeHtml(u.nickname)}</strong><div class="muted">${escapeHtml(u.email)}</div></div>
        <div class="row-actions">
          <button class="small-btn" data-approve="${u.id}">通过</button>
          <button class="danger" data-reject="${u.id}">拒绝</button>
        </div>
      </div>`).join('') : '<div class="muted">暂无待审核申请</div>';

    $('#groupMembers').innerHTML = r2.members.map(u => `
      <div class="member-row">
        <div><strong>${escapeHtml(u.nickname)} ${u.is_admin ? '🛡️' : ''}</strong>
          <div class="muted">${u.mute_until ? `禁言至 ${fmtTime(u.mute_until)}` : '正常'}</div></div>
        ${u.is_admin ? '' : `<div class="row-actions">
          <button class="small-btn" data-mute="${u.id}" data-minutes="60">禁言1小时</button>
          <button class="small-btn" data-mute="${u.id}" data-minutes="0">解除禁言</button>
          <button class="danger" data-kick="${u.id}">踢出</button>
        </div>`}
      </div>`).join('');

    $$('[data-approve]').forEach(btn => btn.onclick = () => adminAction(`/api/groups/${groupId}/requests/${btn.dataset.approve}/approve`, 'POST', groupId));
    $$('[data-reject]').forEach(btn => btn.onclick = () => adminAction(`/api/groups/${groupId}/requests/${btn.dataset.reject}/reject`, 'POST', groupId));
    $$('[data-mute]').forEach(btn => btn.onclick = () => adminAction(`/api/groups/${groupId}/members/${btn.dataset.mute}/mute`, 'POST', groupId, { minutes:Number(btn.dataset.minutes) }));
    $$('[data-kick]').forEach(btn => btn.onclick = async () => {
      if (!confirm('确定要把该用户踢出群聊吗？')) return;
      await adminAction(`/api/groups/${groupId}/members/${btn.dataset.kick}`, 'DELETE', groupId);
    });
  } catch (err) { toast(err.message); }
}

async function adminAction(url, method, groupId, body) {
  try {
    await api(url, { method, body: body ? JSON.stringify(body) : undefined });
    toast('操作成功'); loadGroupManage(groupId); loadAdminGroups();
  } catch (err) { toast(err.message); }
}

function scrollBottom(el) { requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; }); }

(async function init() {
  try {
    const { user } = await api('/api/me');
    state.me = user;
    user ? showApp() : showAuth();
  } catch { showAuth(); }
})();
