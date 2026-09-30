/* 登录/注册逻辑 */
(function () {
  'use strict';
  var title = document.getElementById('auth-title');
  var form = document.getElementById('auth-form');
  var username = document.getElementById('auth-username');
  var password = document.getElementById('auth-password');
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
    if (!u || !p) { msg.textContent = '用户名和密码都要填'; return; }
    msg.textContent = '处理中…';
    var url = mode === 'login' ? '/api/login' : '/api/register';
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) { msg.textContent = r.d.error || '出错了'; return; }
        window.location.href = '/';
      })
      .catch(function () { msg.textContent = '网络错误，稍后再试'; });
  });
})();