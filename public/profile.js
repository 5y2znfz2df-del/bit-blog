/* 个人主页：个性签名 */
(function () {
  'use strict';
  var msg = document.getElementById('profile-msg');
  var body = document.getElementById('profile-body');
  var username = document.getElementById('profile-username');
  var adminBadge = document.getElementById('profile-admin-badge');
  var nickname = document.getElementById('profile-nickname');
  var realname = document.getElementById('profile-realname');
  var signature = document.getElementById('profile-signature');
  var sigInput = document.getElementById('sig-input');
  var sigSave = document.getElementById('sig-save');
  var sigMsg = document.getElementById('sig-msg');
  var nickInput = document.getElementById('nick-input');
  var nickSave = document.getElementById('nick-save');
  var nickMsg = document.getElementById('nick-msg');

  var navLogin = document.getElementById('nav-login');
  var navLogout = document.getElementById('nav-logout');
  var navPublish = document.getElementById('nav-publish');

  fetch('/api/me').then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d.user) { msg.textContent = '请先登录'; window.location.href = '/login.html'; return; }
      var u = d.user;
      username.textContent = u.display_name || u.username;
      adminBadge.classList.toggle('hidden', !u.is_admin);
      if (nickname) {
        nickname.textContent = (u.nickname ? '昵称：' + u.nickname : '还没设置昵称') ;
      }
      if (realname) realname.textContent = u.real_name ? '真实姓名：' + u.real_name : (u.username === 'admin' ? '真实姓名：admin' : '');
      signature.textContent = u.signature || '这个人很懒，什么都没写～';
      sigInput.value = u.signature || '';
      if (nickInput) nickInput.value = u.nickname || '';
      body.classList.remove('hidden');
      navLogin.classList.add('hidden');
      navLogout.classList.remove('hidden');
      navPublish.classList.toggle('hidden', !u.is_admin);
    })
    .catch(function () {});

  navLogout.addEventListener('click', function (e) {
    e.preventDefault();
    fetch('/api/logout', { method: 'POST' }).then(function () { window.location.href = '/'; });
  });
  if (navPublish) navPublish.addEventListener('click', function (e) { e.preventDefault(); window.location.href = '/publish.html'; });

  sigSave.addEventListener('click', function () {
    var s = sigInput.value.trim();
    fetch('/api/signature', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signature: s })
    })
      .then(function (res) { return res.json(); })
      .then(function (d) {
        if (d.ok) { sigMsg.textContent = '✅ 签名已保存'; signature.textContent = s || '这个人很懒，什么都没写～'; }
        else sigMsg.textContent = d.error || '保存失败';
      })
      .catch(function () { sigMsg.textContent = '网络错误'; });
  });

  // ---- 改昵称（7 天冷却）----
  if (nickSave) nickSave.addEventListener('click', function () {
    var n = nickInput.value.trim();
    if (!n) { nickMsg.textContent = '昵称不能为空'; return; }
    nickSave.disabled = true;
    fetch('/api/nickname', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: n })
    })
      .then(function (res) { return res.json(); })
      .then(function (d) {
        if (d.ok) {
          nickMsg.textContent = '✅ 昵称已更新为「' + d.display_name + '」，7 天内不能改';
          nickname.textContent = '昵称：' + d.nickname;
          username.textContent = d.display_name;
        } else {
          nickMsg.textContent = d.error || '保存失败';
        }
        nickSave.disabled = false;
      })
      .catch(function () { nickMsg.textContent = '网络错误'; nickSave.disabled = false; });
  });
})();