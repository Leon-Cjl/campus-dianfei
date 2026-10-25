/* 原生端只向学校 HTTPS 登录页注入一次。全局控制器只保存状态，不保存凭据。 */
(function (credentials) {
  'use strict';
  const token = credentials.token;
  const trusted = () => location.protocol === 'https:' && location.hostname === 'qlgydx.mp.sinojy.cn' &&
    location.port === '' && /^\/SL200000\/?$/.test(location.pathname);
  if (!trusted()) return 'untrusted';
  const previous = window.__DF_LOGIN__;
  if (previous && previous.token === token) return 'active';
  if (previous) previous.cancel();
  const visible = e => !!(e && e.isConnected !== false && e.getClientRects().length);
  const challenge = () => Array.from(document.querySelectorAll('input')).some(e => visible(e) &&
    /captcha|verify|verification|验证码|动态码|短信/i.test([e.id, e.name, e.placeholder].join(' ')));
  const errorKind = () => {
    const text = Array.from(document.querySelectorAll('.za-alert__body,.za-alert__content,.za-toast__text,.ant-message-notice-content,.ant-form-item-explain-error'))
      .filter(visible).map(e => e.textContent || '').join(' ');
    if (/密码.{0,12}(错误|不正确|不匹配)|账号.{0,12}(不存在|错误|锁定)|用户名或密码|用户不存在|登录次数|账户.{0,8}锁定/.test(text)) return 'rejected';
    if (/网络.{0,8}(异常|错误|失败)|连接.{0,8}(超时|失败)|服务器.{0,8}(异常|繁忙)|请求超时/.test(text)) return 'network';
    return '';
  };
  let timer = 0, stopped = false, submitted = false, filledAt = 0, lastUser = null, lastPass = null;
  const begun = Date.now();
  let sentAt = 0;
  const controller = window.__DF_LOGIN__ = { token, state: 'waiting', cancel: () => finish('cancelled') };
  function report(state) {
    if (controller.state === state && state !== 'waiting') return;
    controller.state = state;
    try { window.DF.login(token, state); } catch (ignore) {}
  }
  function finish(state) {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener('input', manualEdit, true);
    document.removeEventListener('click', manualClick, true);
    credentials = null;
    report(state);
  }
  function manualEdit(event) {
    if (!event.isTrusted) return;
    if (event.target === lastUser && (!credentials || event.target.value !== credentials.username)) finish('cancelled');
    else if (event.target === lastPass && (!credentials || event.target.value !== credentials.password)) finish('cancelled');
  }
  function manualClick(event) {
    const button = event.target && event.target.closest && event.target.closest('button');
    if (event.isTrusted && button && (button.textContent || '').replace(/\s/g, '') === '登录') finish('cancelled');
  }
  const setValue = (e, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, value);
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
  };
  function tick() {
    if (stopped) return;
    try {
      if (!trusted()) { finish(location.hostname === 'qlgydx.mp.sinojy.cn' && /^\/SL3/.test(location.pathname) ? 'success' : 'cancelled'); return; }
      if (challenge()) { finish('challenge'); return; }
      if (submitted) {
        const error = errorKind();
        if (error) { finish(error); return; }
        if (Date.now() - sentAt >= 25000) { finish('timeout'); return; }
      } else {
        if (Date.now() - begun >= 15000) { finish('form-timeout'); return; }
        const user = document.getElementById('userName'), pass = document.getElementById('pwd');
        const button = Array.from(document.querySelectorAll('button')).find(e =>
          visible(e) && (e.textContent || '').replace(/\s/g, '') === '登录');
        if (visible(user) && visible(pass) && pass.type === 'password' && button) {
          if (user !== lastUser || pass !== lastPass) {
            lastUser = user; lastPass = pass;
            setValue(user, credentials.username); setValue(pass, credentials.password);
            filledAt = Date.now();
          } else if (user.value !== credentials.username || pass.value !== credentials.password) {
            finish('cancelled'); return;
          } else if (!button.disabled && button.getAttribute('aria-disabled') !== 'true' && Date.now() - filledAt >= 200) {
            submitted = true;
            sentAt = Date.now();
            credentials = null;
            report('submitted');
            button.click();
          }
        }
      }
    } catch (error) { finish('script-error'); return; }
    if (!stopped) timer = setTimeout(tick, 200);
  }
  document.addEventListener('input', manualEdit, true);
  document.addEventListener('click', manualClick, true);
  report('waiting');
  tick();
  return 'active';
})(__DF_CREDENTIALS__);
