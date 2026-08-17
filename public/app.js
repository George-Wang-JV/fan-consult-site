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
  pendingRoute: null
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

function showAuth() {
  $('#authView').classList.remove('hidden');
  $('#appView').classList.add('hidden');
}

async function showApp() {
  $('#authView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  $('#meCard').innerHTML = `<strong>${escapeHtml(state.me.nickname)}</strong><br><span class="muted">${state.me.isAdmin ? '管理员' : '粉丝用户'}</span>`;
  $('#adminBtn').classList.toggle('hidden', !state.me.isAdmin);
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
    scrollBottom($('#directMessages'));
  } catch (err) { toast(err.message); }
}

$('#directForm').onsubmit = async (e) => {
  e.preventDefault();
  const content = $('#directInput').value.trim();
  if (!content || !state.directContact) return;
  try {
    await api('/api/direct/messages', {
      method:'POST',
      body:JSON.stringify({ content, toUserId: state.me.isAdmin ? state.directContact.id : undefined })
    });
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
    $('#pinnedMessage').innerHTML = pinned ? `📌 <strong>置顶：</strong>${escapeHtml(pinned.content)}` : '';
    $('#groupMessages').innerHTML = messages.map(m => messageHtml(m, m.user_id === state.me.id, true)).join('');
    $$('[data-pin-message]').forEach(btn => btn.onclick = async () => {
      try { await api(`/api/groups/${groupId}/messages/${btn.dataset.pinMessage}/pin`, { method:'POST' }); }
      catch (err) { toast(err.message); }
    });
    scrollBottom($('#groupMessages'));
  } catch (err) { toast(err.message); }
}

function messageHtml(m, mine, isGroup) {
  const sender = isGroup ? (m.is_admin ? `${m.nickname} 🛡️` : m.nickname) : m.from_nickname;
  return `<div class="message-row ${mine ? 'mine' : ''}">
    <div class="bubble">
      <div class="message-meta">${escapeHtml(sender || '')} · ${fmtTime(m.created_at)}</div>
      <div>${escapeHtml(m.content)}</div>
      ${isGroup && state.me.isAdmin ? `<div class="message-tools"><button class="small-btn" data-pin-message="${m.id}">📌 置顶</button></div>` : ''}
    </div>
  </div>`;
}

$('#groupForm').onsubmit = async (e) => {
  e.preventDefault();
  const content = $('#groupInput').value.trim();
  if (!content || !state.activeGroup) return;
  try {
    await api(`/api/groups/${state.activeGroup.id}/messages`, { method:'POST', body:JSON.stringify({ content }) });
    $('#groupInput').value = '';
  } catch (err) { toast(err.message); }
};

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
