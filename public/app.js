/* 比特的小博客 - 前端逻辑 */
(function () {
  'use strict';

  var list = document.getElementById('post-list');
  var statusMsg = document.getElementById('status-msg');
  var searchInput = document.getElementById('search-input');

  var navLogin = document.getElementById('nav-login');
  var navLogout = document.getElementById('nav-logout');
  var navPublish = document.getElementById('nav-publish');
  var navProfile = document.getElementById('nav-profile');
  var navPrivate = document.getElementById('nav-private');
  var aboutLink = document.getElementById('about-link');

  var allPosts = [];
  var me = null;

  // ---- 登录态处理 ----
  function applyAuth(user) {
    me = user || null;
    var loggedIn = !!me;
    navLogin.classList.toggle('hidden', loggedIn);
    navLogout.classList.toggle('hidden', !loggedIn);
    navProfile.classList.toggle('hidden', !loggedIn);
    navPublish.classList.toggle('hidden', !loggedIn); // 登录用户都能发布
    if (navPrivate) navPrivate.classList.remove('hidden'); // 私密区所有人可看
  }

  fetch('/api/me').then(function (r) { return r.json(); })
    .then(function (d) { if (d.user) applyAuth(d.user); })
    .catch(function () {});

  if (navLogout) navLogout.addEventListener('click', function (e) {
    e.preventDefault();
    fetch('/api/logout', { method: 'POST' }).then(function () { window.location.href = '/'; });
  });
  if (navPublish) navPublish.addEventListener('click', function (e) {
    e.preventDefault();
    window.location.href = '/publish.html';
  });
  if (navProfile) navProfile.addEventListener('click', function (e) {
    e.preventDefault();
    window.location.href = '/profile.html';
  });
  if (navPrivate) navPrivate.addEventListener('click', function (e) {
    e.preventDefault();
    window.location.href = '/private.html';
  });

  // ---- 渲染列表 ----
  function renderPosts(posts) {
    list.innerHTML = '';
    if (!posts || posts.length === 0) {
      statusMsg.textContent = allPosts.length === 0 ? '还没有文章，等 AI 来写～' : '没有匹配的文章，换个关键词试试';
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
      // 管理员标签
      if (post.author && post.author === 'admin') {
        var badge = document.createElement('span');
        badge.className = 'admin-badge';
        badge.textContent = '管理员';
        head.appendChild(badge);
      }
      var date = document.createElement('div');
      date.className = 'post-date';
      date.textContent = (post.date || '') + ' · ' + (post.author || '匿名');
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

  function filterPosts(keyword) {
    if (!keyword) return allPosts;
    var k = keyword.toLowerCase();
    return allPosts.filter(function (p) {
      return (p.title || '').toLowerCase().indexOf(k) > -1 ||
             (p.excerpt || '').toLowerCase().indexOf(k) > -1 ||
             (p.content || '').toLowerCase().indexOf(k) > -1;
    });
  }

  fetch('/api/posts')
    .then(function (res) { return res.json(); })
    .then(function (posts) { allPosts = posts; renderPosts(posts); })
    .catch(function () { statusMsg.textContent = '加载失败，稍后再试'; });

  if (searchInput) searchInput.addEventListener('input', function () {
    renderPosts(filterPosts(searchInput.value.trim()));
  });

  if (aboutLink) aboutLink.addEventListener('click', function (e) {
    e.preventDefault();
    alert('比特的小博客 🤖\n由比特调度 3 个 AI 子代理协作生成。');
  });
})();