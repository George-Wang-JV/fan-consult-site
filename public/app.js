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
  deferredInstallPrompt: null,
  serviceWorkerRegistrationPromise: null,
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
  imageViewerBaseHeight: 0,
  languagePreference: localStorage.getItem('uiLanguage') || 'zh-CN',
  language: 'zh-CN',
  theme: localStorage.getItem('uiTheme') === 'dark' ? 'dark' : 'light'
};

const translations = {
  'zh-CN': {
    authDescription:'注册后可进行一对一咨询，并申请加入粉丝交流群。', login:'登录', register:'注册',
    email:'邮箱', password:'密码', nickname:'昵称', createAccount:'创建账号', home:'我的主页',
    direct:'一对一咨询', groups:'粉丝交流群', admin:'管理后台', logout:'退出登录', followSystem:'跟随系统',
    homeDescription:'没有审核，畅所欲言', startConsultation:'开始咨询', viewGroups:'查看群聊',
    enableNotifications:'开启新消息通知', notificationHint:'点击开启后，浏览器会请求通知权限。',
    installApp:'安装到桌面', installIos:'添加到主屏幕', installedApp:'已添加到桌面', installingApp:'正在完成安装…', installHelpTitle:'添加到桌面', gotIt:'知道了',
    installIosHelp:'请使用 Safari 打开本站，点击浏览器的“分享”按钮，然后选择“添加到主屏幕”。',
    installBrowserHelp:'如果浏览器没有弹出安装框，请打开浏览器菜单，选择“安装应用”或“添加到主屏幕”。',
    installHttpsHelp:'安装应用需要通过 HTTPS 网站访问，请打开本站的 HTTPS 地址后重试。',
    installed:'应用已安装到桌面', installDismissed:'已取消安装，你可以稍后再次点击。', backgroundServiceFailed:'后台服务注册失败，请刷新页面后重试。',
    installDetected:'当前环境：{browser}', installGuideWechat:'微信内置浏览器通常不会显示网页安装按钮，请先转到系统浏览器。',
    installGuideQq:'QQ 内置浏览器通常需要先转到系统浏览器，再添加到桌面。', installGuideHuawei:'华为浏览器支持把 PWA 直接添加到手机桌面。',
    installGuideIos:'iPhone/iPad 需要从浏览器的分享菜单添加到主屏幕。', installGuideDesktop:'当前浏览器没有返回系统安装弹窗，请使用浏览器菜单或 Windows 备用快捷方式。',
    installGuideMobile:'当前浏览器没有返回系统安装弹窗，请从浏览器菜单添加到手机桌面。',
    openBrowserStep1:'点击右上角“…”菜单', openBrowserStep2:'选择“在浏览器打开”', openBrowserStep3:'在系统浏览器中再次点击网页上的“安装到桌面”',
    huaweiStep1:'点击浏览器右下角“∷”菜单', huaweiStep2:'选择“添加至”', huaweiStep3:'选择“桌面”并确认',
    iosStep1:'点击浏览器的“分享”按钮', iosStep2:'向下滑动并选择“添加到主屏幕”', iosStep3:'点击右上角“添加”',
    desktopStep1:'先查看地址栏右侧是否有安装图标', desktopStep2:'如果没有，打开右上角菜单，寻找“安装应用”“将此站点作为应用安装”或“创建快捷方式”', desktopStep3:'国产浏览器仍没有该选项时，使用下方 Windows 快捷方式备用按钮',
    mobileStep1:'打开浏览器的“菜单”或“更多”', mobileStep2:'选择“添加到桌面”“添加到主屏幕”或“安装应用”', mobileStep3:'允许浏览器创建桌面图标',
    copyWebsiteUrl:'复制网站地址', urlCopied:'网站地址已复制', copyUrlFailed:'复制失败，请长按地址栏复制网址。',
    downloadWindowsShortcut:'Windows备用：下载快捷方式', shortcutDownloaded:'快捷方式已下载，请将它移动到桌面后双击使用。',
    referralTitle:'使用我的邀请码注册享受返佣！', registerNow:'点我注册', selectContact:'请选择联系人',
    messagePlaceholder:'输入消息…', groupMessagePlaceholder:'发送群消息…', send:'发送', createGroup:'创建粉丝群',
    groupName:'群名称', description:'简介', createGroupChat:'创建群聊', groupManagement:'群管理',
    saveChanges:'保存修改', dissolveGroup:'解散群聊', pendingRequests:'待审核申请', groupMembers:'群成员',
    roleAdmin:'管理员', roleFan:'粉丝用户', noContacts:'暂无可用联系人', conversationWith:'与 {name} 的对话',
    enterGroup:'进入群聊', waitingReview:'等待审核', requestJoin:'申请加入', noDescription:'暂无简介',
    memberCount:'{count} 位成员', noGroups:'目前还没有群聊。', joinSubmitted:'入群申请已提交',
    pinned:'置顶', unpin:'取消置顶', pinnedLabel:'置顶', recalled:'消息已撤回', image:'[图片]', video:'[视频]',
    audio:'[语音]', location:'[位置]', noAdminGroups:'暂无群聊', manage:'管理', manageNamed:'管理：{name}',
    approve:'通过', reject:'拒绝', noRequests:'暂无待审核申请', normal:'正常', mutedUntil:'禁言至 {time}',
    muteHour:'禁言1小时', unmute:'解除禁言', remove:'踢出', operationSuccess:'操作成功', groupCreated:'群聊已创建',
    groupSaved:'群聊资料已更新', groupDissolved:'群聊已解散', confirmDissolve:'确定要解散“{name}”吗？群成员和聊天记录将无法恢复。',
    confirmKick:'确定要把该用户踢出群聊吗？', groupUpdated:'群聊资料已更新', groupRemoved:'该群聊已被解散',
    themeDark:'切换深色模式', themeLight:'切换亮色模式', language:'切换语言', openMenu:'打开菜单', closeMenu:'关闭菜单',
    moreWays:'更多发送方式', photo:'照片', videoLabel:'视频', voice:'语音', stopRecording:'停止录音', locationLabel:'位置', replyMessage:'回应这条消息',
    recallAll:'撤回（所有人不可见）', deleteSelf:'删除（仅自己不可见）', cancel:'取消', fitScreen:'适应屏幕', download:'下载',
    requiresHttps:'需要 HTTPS', httpsOnly:'新消息通知只能在 HTTPS 网站上开启。', addHomeScreen:'请先添加到主屏幕',
    iosPushHint:'iPhone/iPad：请用 Safari 的“分享 → 添加到主屏幕”，再从主屏幕打开本站并开启通知。',
    notificationsUnsupported:'此浏览器不支持通知', notificationsUnsupportedHint:'当前浏览器不支持 Web Push，请使用最新版 Chrome、Edge 或 Safari。',
    enabling:'正在开启…', requestingPermission:'正在请求通知权限…', checkingNotifications:'正在检查通知状态…',
    notificationsBlocked:'通知已被浏览器禁止', notificationsBlockedHint:'通知权限已被禁止，请在浏览器的网站设置中改为“允许”。',
    notificationsNotAllowed:'尚未允许通知，请点击按钮开启。', registeringPush:'正在注册后台通知服务…', notificationsEnabled:'新消息通知已开启。',
    testingPush:'订阅成功，正在发送一条测试通知…', testSent:'通知已开启，测试通知已发送。', retryNotifications:'重试开启通知', notificationFailed:'开启通知失败',
    morningEarly:'早上', morning:'上午', afternoon:'下午', evening:'晚上'
  },
  en: {
    authDescription:'Register to start one-to-one consultations and request access to fan groups.', login:'Log in', register:'Register',
    email:'Email', password:'Password', nickname:'Nickname', createAccount:'Create account', home:'Home',
    direct:'One-to-one', groups:'Fan groups', admin:'Admin', logout:'Log out', followSystem:'Use system language',
    homeDescription:'No review — speak freely.', startConsultation:'Start consultation', viewGroups:'View groups',
    enableNotifications:'Enable notifications', notificationHint:'Click Enable to allow browser notifications.',
    installApp:'Install app', installIos:'Add to Home Screen', installedApp:'Added to desktop', installingApp:'Finishing installation…', installHelpTitle:'Install this app', gotIt:'Got it',
    installIosHelp:'Open this site in Safari, tap the Share button, then choose Add to Home Screen.',
    installBrowserHelp:'If no install dialog appears, open the browser menu and choose Install app or Add to Home Screen.',
    installHttpsHelp:'App installation requires HTTPS. Open the HTTPS version of this site and try again.',
    installed:'The app has been installed', installDismissed:'Installation cancelled. You can try again later.', backgroundServiceFailed:'The background service could not be registered. Refresh the page and try again.',
    installDetected:'Detected: {browser}', installGuideWechat:'WeChat usually does not show web app installation. Open this page in your system browser first.',
    installGuideQq:'The QQ in-app browser usually needs to hand this page off to your system browser first.', installGuideHuawei:'Huawei Browser can add this PWA directly to your Home screen.',
    installGuideIos:'On iPhone/iPad, add the app from the browser Share menu.', installGuideDesktop:'The browser did not provide an automatic install prompt. Use its menu or the Windows shortcut fallback.',
    installGuideMobile:'The browser did not provide an automatic install prompt. Add it from the browser menu.',
    openBrowserStep1:'Open the “…” menu in the top-right corner', openBrowserStep2:'Choose “Open in browser”', openBrowserStep3:'In the system browser, tap “Install app” on this page again',
    huaweiStep1:'Open the “∷” menu at the bottom-right', huaweiStep2:'Choose “Add to”', huaweiStep3:'Choose “Desktop” and confirm',
    iosStep1:'Tap the browser Share button', iosStep2:'Scroll down and choose Add to Home Screen', iosStep3:'Tap Add in the top-right corner',
    desktopStep1:'First look for an install icon on the right side of the address bar', desktopStep2:'Otherwise open the top-right menu and look for Install app, Install this site as an app, or Create shortcut', desktopStep3:'If a domestic browser has no such option, use the Windows shortcut fallback below',
    mobileStep1:'Open the browser Menu or More options', mobileStep2:'Choose Add to desktop, Add to Home Screen, or Install app', mobileStep3:'Allow the browser to create a Home screen icon',
    copyWebsiteUrl:'Copy website address', urlCopied:'Website address copied', copyUrlFailed:'Could not copy it. Please copy the URL from the address bar.',
    downloadWindowsShortcut:'Windows fallback: download shortcut', shortcutDownloaded:'Shortcut downloaded. Move it to the desktop and double-click it to open the app.',
    referralTitle:'Register with my invitation link to enjoy rebates!', registerNow:'Register now', selectContact:'Select a contact',
    messagePlaceholder:'Type a message…', groupMessagePlaceholder:'Send a group message…', send:'Send', createGroup:'Create fan group',
    groupName:'Group name', description:'Description', createGroupChat:'Create group', groupManagement:'Group management',
    saveChanges:'Save changes', dissolveGroup:'Dissolve group', pendingRequests:'Pending requests', groupMembers:'Group members',
    roleAdmin:'Administrator', roleFan:'Fan user', noContacts:'No contacts available', conversationWith:'Conversation with {name}',
    enterGroup:'Enter group', waitingReview:'Pending review', requestJoin:'Request to join', noDescription:'No description',
    memberCount:'{count} members', noGroups:'There are no groups yet.', joinSubmitted:'Your request has been submitted',
    pinned:'Pin', unpin:'Unpin', pinnedLabel:'Pinned', recalled:'Message recalled', image:'[Image]', video:'[Video]',
    audio:'[Audio]', location:'[Location]', noAdminGroups:'No groups yet', manage:'Manage', manageNamed:'Manage: {name}',
    approve:'Approve', reject:'Reject', noRequests:'No pending requests', normal:'Active', mutedUntil:'Muted until {time}',
    muteHour:'Mute 1 hour', unmute:'Unmute', remove:'Remove', operationSuccess:'Done', groupCreated:'Group created',
    groupSaved:'Group details updated', groupDissolved:'Group dissolved', confirmDissolve:'Dissolve “{name}”? Members and chat history cannot be restored.',
    confirmKick:'Remove this user from the group?', groupUpdated:'Group details updated', groupRemoved:'This group has been dissolved',
    themeDark:'Switch to dark mode', themeLight:'Switch to light mode', language:'Change language', openMenu:'Open menu', closeMenu:'Close menu',
    moreWays:'More ways to send', photo:'Photo', videoLabel:'Video', voice:'Voice', stopRecording:'Stop recording', locationLabel:'Location', replyMessage:'React to this message',
    recallAll:'Recall for everyone', deleteSelf:'Delete for me', cancel:'Cancel', fitScreen:'Fit to screen', download:'Download',
    requiresHttps:'HTTPS required', httpsOnly:'Notifications can only be enabled on an HTTPS website.', addHomeScreen:'Add to Home Screen first',
    iosPushHint:'On iPhone/iPad, open this site in Safari, choose Share → Add to Home Screen, then open it from the Home Screen and enable notifications.',
    notificationsUnsupported:'Notifications unsupported', notificationsUnsupportedHint:'This browser does not support Web Push. Use the latest Chrome, Edge, or Safari.',
    enabling:'Enabling…', requestingPermission:'Requesting notification permission…', checkingNotifications:'Checking notification status…',
    notificationsBlocked:'Notifications are blocked', notificationsBlockedHint:'Notifications are blocked. Change this site’s browser permission to Allow.',
    notificationsNotAllowed:'Notifications have not been allowed. Click the button to enable them.', registeringPush:'Registering the background notification service…', notificationsEnabled:'Notifications are enabled.',
    testingPush:'Subscription saved. Sending a test notification…', testSent:'Notifications enabled and test sent.', retryNotifications:'Retry notifications', notificationFailed:'Could not enable notifications',
    morningEarly:'early morning', morning:'morning', afternoon:'afternoon', evening:'evening'
  }
};

function resolveLanguage(preference = state.languagePreference) {
  if (preference === 'auto') return navigator.language?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
  return preference === 'en' ? 'en' : 'zh-CN';
}

function tr(key, values = {}) {
  let output = translations[state.language]?.[key] || translations['zh-CN'][key] || key;
  for (const [name, value] of Object.entries(values)) output = output.replaceAll(`{${name}}`, String(value));
  return output;
}

function applyLanguage(preference = state.languagePreference, rerender = true) {
  state.languagePreference = preference;
  state.language = resolveLanguage(preference);
  localStorage.setItem('uiLanguage', preference);
  document.documentElement.lang = state.language;
  $$('[data-i18n]').forEach(el => { el.textContent = tr(el.dataset.i18n); });
  $$('[data-i18n-placeholder]').forEach(el => { el.placeholder = tr(el.dataset.i18nPlaceholder); });
  $$('[data-rich-action]').forEach(button => {
    if (button.classList.contains('recording')) return;
    const labels = { image:`📷 ${tr('photo')}`, video:`🎬 ${tr('videoLabel')}`, audio:`🎤 ${tr('voice')}`, location:`📍 ${tr('locationLabel')}` };
    button.textContent = labels[button.dataset.richAction];
  });
  $('#languageButton').title = tr('language');
  $('#languageButton').setAttribute('aria-label', tr('language'));
  $('#mobileMenu').setAttribute('aria-label', tr('openMenu'));
  $$('[data-language]').forEach(button => button.classList.toggle('active', button.dataset.language === preference));
  updateInstallButton();
  if (!rerender || !state.me) return;
  renderHomeGreeting();
  renderMeCard();
  $('#pageTitle').textContent = tr(state.currentPage);
  if (state.currentPage === 'direct') loadDirectContacts();
  if (state.currentPage === 'groups') state.activeGroup ? loadGroupMessages(state.activeGroup.id) : loadGroups();
  if (state.currentPage === 'admin') loadAdminGroups();
  setupPush(false);
}

function applyTheme(theme = state.theme) {
  state.theme = theme === 'dark' ? 'dark' : 'light';
  localStorage.setItem('uiTheme', state.theme);
  document.documentElement.dataset.theme = state.theme;
  const dark = state.theme === 'dark';
  $('#themeToggle').textContent = dark ? '☀️' : '🌙';
  $('#themeToggle').title = tr(dark ? 'themeLight' : 'themeDark');
  $('#themeToggle').setAttribute('aria-label', tr(dark ? 'themeLight' : 'themeDark'));
  $('#themeColor').content = dark ? '#0b1120' : '#f5f7fb';
}

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

function beijingGreetingPeriod() {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone:'Asia/Shanghai', hour:'2-digit', hourCycle:'h23'
  }).format(new Date()));
  if (hour >= 5 && hour < 9) return 'morningEarly';
  if (hour >= 9 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

function renderHomeGreeting() {
  if (!state.me) return;
  const nickname = `<strong>${escapeHtml(state.me.nickname)}</strong>`;
  const period = tr(beijingGreetingPeriod());
  if (state.language === 'en') {
    const role = state.me.isAdmin ? ' Administrator' : '';
    const destination = state.me.isAdmin ? 'the 废慨VC Consultation Center admin portal' : 'the 废慨VC Consultation Center';
    $('#homeGreeting').innerHTML = `Good ${period}, respected ${nickname}${role}. Welcome to ${destination}.`;
    return;
  }
  const adminTitle = state.me.isAdmin ? ' 管理员' : '';
  const destination = state.me.isAdmin ? '废慨vc咨询中心后台' : '废慨vc咨询中心';
  $('#homeGreeting').innerHTML = `尊敬的 ${nickname}${adminTitle}，北京时间${period}好，欢迎来到${destination}。`;
}

function renderMeCard() {
  if (!state.me) return;
  $('#meCard').innerHTML = `<strong>${escapeHtml(state.me.nickname)}</strong><br><span class="muted">${tr(state.me.isAdmin ? 'roleAdmin' : 'roleFan')}</span>`;
}

function showAuth() {
  $('#authView').classList.remove('hidden');
  $('#appView').classList.add('hidden');
}

async function showApp() {
  $('#authView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  renderMeCard();
  $('#adminBtn').classList.toggle('hidden', !state.me.isAdmin);
  renderHomeGreeting();
  updateInstallButton();
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

function updateInstallButton() {
  const button = $('#installApp');
  if (!button) return;
  const installed = isStandaloneApp();
  button.classList.remove('hidden');
  button.disabled = installed;
  button.classList.toggle('installed', installed);
  $('#installAppIcon').textContent = installed ? '✓' : '📲';
  const label = button.querySelector('[data-i18n="installApp"]');
  if (label) label.textContent = tr(installed ? 'installedApp' : (isIosDevice() ? 'installIos' : 'installApp'));
  button.classList.toggle('install-ready', Boolean(state.deferredInstallPrompt));
}

function detectInstallEnvironment() {
  const ua = navigator.userAgent || '';
  const isWindows = /Windows/i.test(ua);
  const isMobile = isIosDevice() || /Android|Mobile/i.test(ua);
  let kind = isWindows ? 'desktop' : (isMobile ? 'mobile' : 'desktop');
  let name = isWindows ? 'Windows 浏览器' : '手机浏览器';
  if (/MicroMessenger/i.test(ua)) { kind = 'wechat'; name = '微信内置浏览器'; }
  else if (/(?:^|[;\s])QQ\//i.test(ua)) { kind = 'qq'; name = 'QQ 内置浏览器'; }
  else if (isIosDevice()) { kind = 'ios'; name = /CriOS/i.test(ua) ? 'iPhone Chrome' : (/EdgiOS/i.test(ua) ? 'iPhone Edge' : 'iPhone/iPad 浏览器'); }
  else if (/HuaweiBrowser/i.test(ua)) { kind = 'huawei'; name = '华为浏览器'; }
  else if (/MiuiBrowser/i.test(ua)) name = '小米浏览器';
  else if (/MQQBrowser/i.test(ua)) name = 'QQ浏览器';
  else if (/UCBrowser|UCWEB/i.test(ua)) name = 'UC浏览器';
  else if (/360SE|360EE|QihooBrowser/i.test(ua)) name = '360浏览器';
  else if (/baidubrowser|BIDUBrowser/i.test(ua)) name = '百度浏览器';
  else if (/Quark/i.test(ua)) name = '夸克浏览器';
  else if (/Edg/i.test(ua)) name = 'Microsoft Edge';
  else if (/Chrome/i.test(ua)) name = 'Google Chrome';
  else if (/Safari/i.test(ua)) name = 'Safari';
  return { kind, name, isWindows, isMobile };
}

function installGuideFor(environment) {
  if (environment.kind === 'wechat') return { summary:'installGuideWechat', steps:['openBrowserStep1','openBrowserStep2','openBrowserStep3'], copy:true };
  if (environment.kind === 'qq') return { summary:'installGuideQq', steps:['openBrowserStep1','openBrowserStep2','openBrowserStep3'], copy:true };
  if (environment.kind === 'huawei') return { summary:'installGuideHuawei', steps:['huaweiStep1','huaweiStep2','huaweiStep3'] };
  if (environment.kind === 'ios') return { summary:'installGuideIos', steps:['iosStep1','iosStep2','iosStep3'] };
  if (environment.isWindows) return { summary:'installGuideDesktop', steps:['desktopStep1','desktopStep2','desktopStep3'], windowsShortcut:true };
  return { summary:'installGuideMobile', steps:['mobileStep1','mobileStep2','mobileStep3'], copy:environment.isMobile };
}

function showInstallHelp(message = '') {
  const environment = detectInstallEnvironment();
  const guide = installGuideFor(environment);
  $('#installEnvironment').textContent = tr('installDetected', { browser:environment.name });
  $('#installHelpText').textContent = message || tr(guide.summary);
  $('#installHelpSteps').innerHTML = guide.steps.map((key, index) => (
    `<li><span>${index + 1}</span><div>${escapeHtml(tr(key))}</div></li>`
  )).join('');
  $('#copyInstallUrl').classList.toggle('hidden', !guide.copy);
  $('#downloadWindowsShortcut').classList.toggle('hidden', !guide.windowsShortcut);
  $('#installHelp').classList.remove('hidden');
  $('#installHelp').setAttribute('aria-hidden', 'false');
  document.body.classList.add('dialog-open');
  $('#closeInstallHelp').focus();
}

function closeInstallHelp() {
  const dialog = $('#installHelp');
  if (dialog.classList.contains('hidden')) return;
  dialog.classList.add('hidden');
  dialog.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('dialog-open');
  if (!$('#installApp').disabled) $('#installApp').focus();
}

async function copyInstallUrl() {
  const url = `${location.origin}/`;
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
    else {
      const input = document.createElement('textarea');
      input.value = url;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      if (!document.execCommand('copy')) throw new Error('copy failed');
      input.remove();
    }
    toast(tr('urlCopied'));
  } catch {
    toast(tr('copyUrlFailed'));
  }
}

function downloadWindowsShortcut() {
  const content = `[InternetShortcut]\r\nURL=${location.origin}/\r\n`;
  const url = URL.createObjectURL(new Blob([content], { type:'application/internet-shortcut' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = '废慨VC咨询中心.url';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(tr('shortcutDownloaded'));
}

async function handleInstallApp() {
  if (isStandaloneApp()) {
    updateInstallButton();
    return;
  }
  if (!window.isSecureContext) {
    showInstallHelp(tr('installHttpsHelp'));
    return;
  }
  if (state.deferredInstallPrompt) {
    const promptEvent = state.deferredInstallPrompt;
    state.deferredInstallPrompt = null;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') {
      $('#installAppIcon').textContent = '✓';
      $('#installApp').querySelector('[data-i18n="installApp"]').textContent = tr('installingApp');
      $('#installApp').disabled = true;
    }
    else {
      toast(tr('installDismissed'));
      updateInstallButton();
    }
    return;
  }
  showInstallHelp();
}

async function registerAppServiceWorker() {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) return null;
  if (!state.serviceWorkerRegistrationPromise) {
    state.serviceWorkerRegistrationPromise = navigator.serviceWorker.register('/sw.js', { updateViaCache:'none' })
      .then(async (registration) => {
        await registration.update().catch(() => {});
        return registration;
      })
      .catch((err) => {
        state.serviceWorkerRegistrationPromise = null;
        throw err;
      });
  }
  try {
    return await state.serviceWorkerRegistrationPromise;
  } catch (err) {
    console.error('Service Worker registration failed:', err);
    return null;
  }
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
    button.textContent = tr('requiresHttps'); button.disabled = true;
    setNotificationStatus(tr('httpsOnly'), 'error'); return;
  }
  if (isIosDevice() && !isStandaloneApp()) {
    button.textContent = tr('addHomeScreen'); button.disabled = true;
    setNotificationStatus(tr('iosPushHint'), 'error'); return;
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    button.textContent = tr('notificationsUnsupported'); button.disabled = true;
    setNotificationStatus(tr('notificationsUnsupportedHint'), 'error'); return;
  }

  button.disabled = true;
  button.textContent = tr('enabling');
  setNotificationStatus(tr(requestPermission ? 'requestingPermission' : 'checkingNotifications'));
  try {
    // Permission must be requested before any await so mobile browsers retain the click gesture.
    let permission = Notification.permission;
    if (requestPermission && permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      const denied = permission === 'denied';
      button.textContent = denied ? tr('notificationsBlocked') : `🔔 ${tr('enableNotifications')}`;
      button.disabled = denied;
      setNotificationStatus(tr(denied ? 'notificationsBlockedHint' : 'notificationsNotAllowed'), denied ? 'error' : '');
      return;
    }

    setNotificationStatus(tr('registeringPush'));
    const registration = await registerAppServiceWorker();
    if (!registration) throw new Error(tr('backgroundServiceFailed'));
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
    button.textContent = `✓ ${tr('notificationsEnabled')}`; button.disabled = true;
    button.classList.add('hidden');
    setNotificationStatus(tr('notificationsEnabled'), 'success');
    updatePresence();
    if (requestPermission) {
      setNotificationStatus(tr('testingPush'));
      await api('/api/push/test', { method:'POST' });
      setNotificationStatus(tr('testSent'), 'success');
    }
  } catch (err) {
    const message = err.message || tr('notificationFailed');
    button.textContent = `🔔 ${tr('retryNotifications')}`; button.disabled = false;
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
  state.socket.on('group:created', () => {
    if (state.currentPage === 'groups') loadGroups();
    if (state.currentPage === 'admin') loadAdminGroups();
  });
  state.socket.on('group:updated', ({ group }) => {
    state.groups = state.groups.map(item => item.id === group.id ? { ...item, ...group } : item);
    if (state.activeGroup?.id === group.id) {
      state.activeGroup = { ...state.activeGroup, ...group };
      $('#groupHeader').textContent = group.name;
    }
    if (state.currentPage === 'groups' && !state.activeGroup) loadGroups();
    if (state.currentPage === 'admin') loadAdminGroups();
  });
  state.socket.on('group:deleted', ({ groupId }) => {
    state.groups = state.groups.filter(group => group.id !== groupId);
    delete state.groupUnread[groupId];
    renderUnread();
    if (state.activeGroup?.id === groupId) {
      closeGroupChat(false);
      toast(tr('groupRemoved'));
    }
    if (state.manageGroup?.id === groupId) {
      state.manageGroup = null;
      $('#groupManagePanel').classList.add('hidden');
    }
    if (state.currentPage === 'groups') loadGroups();
    if (state.currentPage === 'admin') loadAdminGroups();
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
  $$('.page').forEach(x => x.classList.add('hidden'));
  $(`#${name}Page`).classList.remove('hidden');
  $$('.nav-btn').forEach(x => x.classList.toggle('active', x.dataset.page === name));
  $('#pageTitle').textContent = tr(name);
  state.currentPage = name;
  if (name === 'home') renderHomeGreeting();
  setSidebarOpen(false);
  if (name === 'direct') loadDirectContacts();
  if (name === 'groups') {
    closeGroupChat(false);
    loadGroups();
  }
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
function setSidebarOpen(open) {
  $('.sidebar').classList.toggle('open', open);
  $('#sidebarBackdrop').classList.toggle('hidden', !open);
  $('#mobileMenu').setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('menu-open', open);
}
$('#mobileMenu').onclick = () => setSidebarOpen(!$('.sidebar').classList.contains('open'));
$('#sidebarBackdrop').onclick = () => setSidebarOpen(false);
$('#enableNotifications').onclick = () => setupPush(true);
$('#installApp').onclick = handleInstallApp;
$('#closeInstallHelp').onclick = closeInstallHelp;
$('#copyInstallUrl').onclick = copyInstallUrl;
$('#downloadWindowsShortcut').onclick = downloadWindowsShortcut;
$('#installHelp').onclick = (event) => { if (event.target === $('#installHelp')) closeInstallHelp(); };
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  state.deferredInstallPrompt = event;
  updateInstallButton();
});
window.addEventListener('appinstalled', () => {
  state.deferredInstallPrompt = null;
  closeInstallHelp();
  updateInstallButton();
  toast(tr('installed'));
});
$('#languageButton').onclick = (event) => {
  event.stopPropagation();
  const menu = $('#languageMenu');
  const open = menu.classList.toggle('hidden') === false;
  $('#languageButton').setAttribute('aria-expanded', String(open));
};
$$('[data-language]').forEach(button => button.onclick = () => {
  applyLanguage(button.dataset.language);
  $('#languageMenu').classList.add('hidden');
  $('#languageButton').setAttribute('aria-expanded', 'false');
});
$('#themeToggle').onclick = () => applyTheme(state.theme === 'dark' ? 'light' : 'dark');
navigator.serviceWorker?.addEventListener('message', (event) => {
  if (event.data?.type === 'push-subscription-changed') setupPush(false);
});
document.addEventListener('visibilitychange', updatePresence);
window.addEventListener('focus', updatePresence);
window.addEventListener('blur', updatePresence);
window.addEventListener('resize', () => { if (window.innerWidth > 820) setSidebarOpen(false); });
document.addEventListener('click', (event) => {
  if (!event.target.closest('.language-switcher')) {
    $('#languageMenu').classList.add('hidden');
    $('#languageButton').setAttribute('aria-expanded', 'false');
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  setSidebarOpen(false);
  $('#languageMenu').classList.add('hidden');
  closeInstallHelp();
  if (state.activeGroup) closeGroupChat(false);
});

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
      box.innerHTML = `<div class="contact-item muted">${tr('noContacts')}</div>`;
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
    $('#directHeader').textContent = tr('conversationWith', { name:state.directContact.nickname });
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
      if (state.me.isAdmin || g.my_status === 'approved') action = `<button class="primary" data-open-group="${g.id}">${tr('enterGroup')}</button>`;
      else if (g.my_status === 'pending') action = `<button class="small-btn" disabled>${tr('waitingReview')}</button>`;
      else action = `<button class="secondary" data-join-group="${g.id}">${tr('requestJoin')}</button>`;
      return `<article class="group-card">
        <h3><span>${escapeHtml(g.name)}</span>${state.groupUnread[g.id] ? `<span class="unread-badge">${state.groupUnread[g.id]}</span>` : ''}</h3>
        <p>${escapeHtml(g.description || tr('noDescription'))}</p>
        <div class="badge">${tr('memberCount', { count:g.member_count })}</div><br>
        ${action}
      </article>`;
    }).join('') : `<div class="panel muted">${tr('noGroups')}</div>`;

    $$('[data-join-group]').forEach(btn => btn.onclick = async () => {
      try { await api(`/api/groups/${btn.dataset.joinGroup}/join`, { method:'POST' }); toast(tr('joinSubmitted')); loadGroups(); }
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
  $('#groupList').classList.add('hidden');
  $('#groupChat').classList.remove('hidden');
  $('#groupHeader').textContent = state.activeGroup.name;
  clearGroupUnread(groupId);
  state.socket?.emit('group:join', groupId);
  await loadGroupMessages(groupId);
  updatePresence();
  window.scrollTo({ top:0, behavior:'smooth' });
}

function closeGroupChat(reload = true) {
  state.activeGroup = null;
  $('#groupChat').classList.add('hidden');
  $('#groupList').classList.remove('hidden');
  $('#groupHeader').textContent = '';
  $('#groupMessages').innerHTML = '';
  $('#pinnedMessage').classList.add('hidden');
  updatePresence();
  if (reload && state.currentPage === 'groups') loadGroups();
}

$('#closeGroupChat').onclick = () => closeGroupChat();

async function loadGroupMessages(groupId) {
  try {
    const { messages } = await api(`/api/groups/${groupId}/messages`);
    const pinned = messages.find(m => m.is_pinned);
    $('#pinnedMessage').classList.toggle('hidden', !pinned);
    $('#pinnedMessage').innerHTML = pinned ? `📌 <strong>${tr('pinnedLabel')}：</strong>${escapeHtml(messageSummary(pinned))}` : '';
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
  if (message.is_recalled) return tr('recalled');
  return ({ image:tr('image'), video:tr('video'), audio:tr('audio'), location:tr('location') }[message.message_type]) || message.content || '';
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
        ${isGroup && state.me.isAdmin && !message.is_recalled ? `<div class="message-tools"><button type="button" class="small-btn" data-pin-message="${message.id}">${message.is_pinned ? `📍 ${tr('unpin')}` : `📌 ${tr('pinned')}`}</button></div>` : ''}
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
    button.textContent = `🎤 ${tr('voice')}`;
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
  button.textContent = `⏹️ ${tr('stopRecording')}`;
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
    e.target.reset(); toast(tr('groupCreated')); loadAdminGroups();
  } catch (err) { toast(err.message); }
};

async function loadAdminGroups() {
  try {
    const { groups } = await api('/api/groups');
    state.groups = groups;
    $('#adminGroupList').innerHTML = groups.length ? groups.map(g => `
      <div class="admin-group-row">
        <div><strong>${escapeHtml(g.name)}</strong><div class="muted">${tr('memberCount', { count:g.member_count })}</div></div>
        <button class="small-btn" data-manage-group="${g.id}">${tr('manage')}</button>
      </div>`).join('') : `<div class="muted">${tr('noAdminGroups')}</div>`;
    $$('[data-manage-group]').forEach(btn => btn.onclick = () => loadGroupManage(Number(btn.dataset.manageGroup)));
  } catch (err) { toast(err.message); }
}

async function loadGroupManage(groupId) {
  state.manageGroup = state.groups.find(g => g.id === groupId);
  if (!state.manageGroup) return;
  $('#groupManagePanel').classList.remove('hidden');
  $('#manageGroupTitle').textContent = tr('manageNamed', { name:state.manageGroup.name });
  $('#editGroupName').value = state.manageGroup.name || '';
  $('#editGroupDescription').value = state.manageGroup.description || '';
  try {
    const [r1, r2] = await Promise.all([
      api(`/api/groups/${groupId}/requests`),
      api(`/api/groups/${groupId}/members`)
    ]);
    $('#joinRequests').innerHTML = r1.requests.length ? r1.requests.map(u => `
      <div class="request-row">
        <div><strong>${escapeHtml(u.nickname)}</strong><div class="muted">${escapeHtml(u.email)}</div></div>
        <div class="row-actions">
          <button class="small-btn" data-approve="${u.id}">${tr('approve')}</button>
          <button class="danger" data-reject="${u.id}">${tr('reject')}</button>
        </div>
      </div>`).join('') : `<div class="muted">${tr('noRequests')}</div>`;

    $('#groupMembers').innerHTML = r2.members.map(u => `
      <div class="member-row">
        <div><strong>${escapeHtml(u.nickname)} ${u.is_admin ? '🛡️' : ''}</strong>
          <div class="muted">${u.mute_until ? tr('mutedUntil', { time:fmtTime(u.mute_until) }) : tr('normal')}</div></div>
        ${u.is_admin ? '' : `<div class="row-actions">
          <button class="small-btn" data-mute="${u.id}" data-minutes="60">${tr('muteHour')}</button>
          <button class="small-btn" data-mute="${u.id}" data-minutes="0">${tr('unmute')}</button>
          <button class="danger" data-kick="${u.id}">${tr('remove')}</button>
        </div>`}
      </div>`).join('');

    $$('[data-approve]').forEach(btn => btn.onclick = () => adminAction(`/api/groups/${groupId}/requests/${btn.dataset.approve}/approve`, 'POST', groupId));
    $$('[data-reject]').forEach(btn => btn.onclick = () => adminAction(`/api/groups/${groupId}/requests/${btn.dataset.reject}/reject`, 'POST', groupId));
    $$('[data-mute]').forEach(btn => btn.onclick = () => adminAction(`/api/groups/${groupId}/members/${btn.dataset.mute}/mute`, 'POST', groupId, { minutes:Number(btn.dataset.minutes) }));
    $$('[data-kick]').forEach(btn => btn.onclick = async () => {
      if (!confirm(tr('confirmKick'))) return;
      await adminAction(`/api/groups/${groupId}/members/${btn.dataset.kick}`, 'DELETE', groupId);
    });
  } catch (err) { toast(err.message); }
}

$('#editGroupForm').onsubmit = async (event) => {
  event.preventDefault();
  if (!state.manageGroup) return;
  const body = Object.fromEntries(new FormData(event.target));
  try {
    const { group } = await api(`/api/groups/${state.manageGroup.id}`, {
      method:'PATCH', body:JSON.stringify(body)
    });
    state.manageGroup = { ...state.manageGroup, ...group };
    toast(tr('groupSaved'));
    await loadAdminGroups();
    await loadGroupManage(group.id);
  } catch (err) { toast(err.message); }
};

$('#deleteGroupBtn').onclick = async () => {
  if (!state.manageGroup) return;
  const group = state.manageGroup;
  if (!confirm(tr('confirmDissolve', { name:group.name }))) return;
  try {
    await api(`/api/groups/${group.id}`, { method:'DELETE' });
    state.manageGroup = null;
    $('#groupManagePanel').classList.add('hidden');
    toast(tr('groupDissolved'));
    await loadAdminGroups();
  } catch (err) { toast(err.message); }
};

async function adminAction(url, method, groupId, body) {
  try {
    await api(url, { method, body: body ? JSON.stringify(body) : undefined });
    toast(tr('operationSuccess')); loadGroupManage(groupId); loadAdminGroups();
  } catch (err) { toast(err.message); }
}

function scrollBottom(el) { requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; }); }

(async function init() {
  applyLanguage(state.languagePreference, false);
  applyTheme(state.theme);
  void registerAppServiceWorker();
  try {
    const { user } = await api('/api/me');
    state.me = user;
    user ? showApp() : showAuth();
  } catch { showAuth(); }
})();
