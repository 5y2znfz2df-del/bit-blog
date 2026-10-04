/* 登录/注册逻辑 */
(function () {
  'use strict';
  var title = document.getElementById('auth-title');
  var form = document.getElementById('auth-form');
  var username = document.getElementById('auth-username');
  var password = document.getElementById('auth-password');
  var real = document.getElementById('auth-real');
  var realLabel = document.getElementById('auth-real-label');
  var submit = document.getElementById('auth-submit');
  var msg = document.getElementById('auth-msg');
  var toggle = document.getElementById('auth-toggle');

  var mode = localStorage.getItem('blogAuthMode') || 'login';

  function setMode(m) {
    mode = m;
    localStorage.setItem('blogAuthMode', m);
    title.textContent = m === 'login' ? '登录' : '注册';
    submit.textContent = m === 'login' ? '登录' : '注册';
    toggle.textContent = m === 'login' ? '没有账号？去注册' : '已有账号？去登录';
    // 真实姓名：注册必填，登录按需（老用户可留空，登录后补）
    real.required = (m === 'register');
    real.placeholder = m === 'register' ? '填写真实姓名（注册后用于登录）' : '填注册时的姓名（可选）';
    realLabel.textContent = m === 'register' ? '真实姓名（必填）' : '真实姓名';
  }
  setMode(mode);

  toggle.addEventListener('click', function (e) {
    e.preventDefault();
    setMode(mode === 'login' ? 'register' : 'login');
    msg.textContent = '';
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var u = username.value.trim();
    var p = password.value;
    var r = (real ? real.value : '').trim();
    if (!u || !p) { msg.textContent = '用户名和密码都要填'; return; }
    if (mode === 'register' && !r) { msg.textContent = '注册需要填真实姓名'; return; }
    msg.textContent = '处理中…';
    var url = mode === 'login' ? '/api/login' : '/api/register';
    var payload = { username: u, password: p };
    if (r) payload.real_name = r;
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) { msg.textContent = r.d.error || '出错了'; return; }
        window.location.href = '/';
      })
      .catch(function () { msg.textContent = '网络错误，稍后再试'; });
  });
})();