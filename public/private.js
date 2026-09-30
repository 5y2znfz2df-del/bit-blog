/* 私密区：仅管理员可见 */
(function () {
  'use strict';
  var list = document.getElementById('post-list');
  var statusMsg = document.getElementById('status-msg');
  var navLogin = document.getElementById('nav-login');
  var navLogout = document.getElementById('nav-logout');
  var navPublish = document.getElementById('nav-publish');
  var navProfile = document.getElementById('nav-profile');

  function render(posts) {
    list.innerHTML = '';
    if (!posts || posts.length === 0) {
      statusMsg.textContent = '私密区还没有文章';
      return;
    }
    statusMsg.textContent = '';
    posts.forEach(function (post) {
      var li = document.createElement('li');
      li.className = 'post-card';
      var head = document.createElement('div');
      head.className = 'post-head';
      var h2 = document.createElement('h2');
      h2.textContent = post.title || '无标题';
      head.appendChild(h2);
      if (post.author === 'admin') {
        var badge = document.createElement('span');
        badge.className = 'admin-badge';
        badge.textContent = '管理员';
        head.appendChild(badge);
      }
      var date = document.createElement('div');
      date.className = 'post-date';
      date.textContent = (post.date || '') + ' · ' + (post.author || '匿名') + ' · 🔒 私密';
      var p = document.createElement('p');
      p.textContent = post.excerpt || '';
      var meta = document.createElement('div');
      meta.className = 'post-meta';
      meta.textContent = '❤ ' + (post.likes || 0) + '  ·  💬 ' + (post.comment_count || 0);
      li.appendChild(head);
      li.appendChild(date);
      li.appendChild(p);
      li.appendChild(meta);
      li.addEventListener('click', function () {
        window.location.href = 'post.html?slug=' + encodeURIComponent(post.slug);
      });
      list.appendChild(li);
    });
  }

  // 管理员校验 + 加载私密文章
  fetch('/api/me').then(function (r) { return r.json(); })
    .then(function (d) {
      var user = d.user;
      if (!user) { statusMsg.textContent = '请先登录'; window.location.href = '/login.html'; return; }
      if (!user.is_admin) { statusMsg.textContent = '私密区仅管理员可访问'; window.location.href = '/'; return; }
      navLogin.classList.add('hidden');
      navLogout.classList.remove('hidden');
      navProfile.classList.remove('hidden');
      navPublish.classList.remove('hidden');
      return fetch('/api/posts?zone=private');
    })
    .then(function (res) { return res ? res.json() : null; })
    .then(function (posts) { if (posts) render(posts); })
    .catch(function () { statusMsg.textContent = '加载失败'; });

  navLogout.addEventListener('click', function (e) {
    e.preventDefault();
    fetch('/api/logout', { method: 'POST' }).then(function () { window.location.href = '/'; });
  });
  if (navPublish) navPublish.addEventListener('click', function (e) { e.preventDefault(); window.location.href = '/publish.html'; });
  if (navProfile) navProfile.addEventListener('click', function (e) { e.preventDefault(); window.location.href = '/profile.html'; });
})();