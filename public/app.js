const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const state = {
  me: null,
  socket: null,
  directContact: null,
  groups: [],
  activeGroup: null,
  manageGroup: null
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

function showApp() {
  $('#authView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  $('#meCard').innerHTML = `<strong>${escapeHtml(state.me.nickname)}</strong><br><span class="muted">${state.me.isAdmin ? '管理员' : '粉丝用户'}</span>`;
  $('#adminBtn').classList.toggle('hidden', !state.me.isAdmin);
  connectSocket();
  goPage('home');
}

function connectSocket() {
  if (state.socket) state.socket.disconnect();
  state.socket = io();
  state.socket.on('direct:new', () => {
    if (!$('#directPage').classList.contains('hidden') && state.directContact) loadDirectMessages();
  });
  state.socket.on('group:new', (msg) => {
    if (state.activeGroup?.id === msg.group_id) loadGroupMessages(state.activeGroup.id);
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
  $('.sidebar').classList.remove('open');
  if (name === 'direct') loadDirectContacts();
  if (name === 'groups') loadGroups();
  if (name === 'admin' && state.me.isAdmin) loadAdminGroups();
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
  await api('/api/logout', { method:'POST' });
  state.me = null;
  state.socket?.disconnect();
  showAuth();
};

$$('.nav-btn').forEach(btn => btn.onclick = () => goPage(btn.dataset.page));
$$('[data-goto]').forEach(btn => btn.onclick = () => goPage(btn.dataset.goto));
$('#mobileMenu').onclick = () => $('.sidebar').classList.toggle('open');

// Direct chat
async function loadDirectContacts() {
  try {
    const { contacts } = await api('/api/direct/contacts');
    const box = $('#directContacts');
    if (!contacts.length) {
      box.innerHTML = '<div class="contact-item muted">暂无可用联系人</div>';
      return;
    }
    box.innerHTML = contacts.map(c => `
      <div class="contact-item ${state.directContact?.id === c.id ? 'active' : ''}" data-user-id="${c.id}">
        <div class="contact-name">${escapeHtml(c.nickname)} ${c.isAdmin ? '🛡️' : ''}</div>
        <div class="contact-meta">${escapeHtml(c.email)}</div>
      </div>`).join('');
    $$('#directContacts .contact-item[data-user-id]').forEach(el => el.onclick = () => {
      state.directContact = contacts.find(c => c.id === Number(el.dataset.userId));
      loadDirectContacts();
      loadDirectMessages();
    });
    if (!state.directContact && contacts.length === 1) {
      state.directContact = contacts[0];
      loadDirectMessages();
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
        <h3>${escapeHtml(g.name)}</h3>
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
  } catch (err) { toast(err.message); }
}

async function openGroup(groupId) {
  state.activeGroup = state.groups.find(g => g.id === groupId) || { id: groupId, name:'群聊' };
  $('#groupChat').classList.remove('hidden');
  $('#groupHeader').textContent = state.activeGroup.name;
  state.socket?.emit('group:join', groupId);
  await loadGroupMessages(groupId);
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
