/* 归档页：按年分组 + 标签列表 */
(function () {
  'use strict';
  var box = document.getElementById('archive-box');
  var navLogin = document.getElementById('nav-login');
  var navLogout = document.getElementById('nav-logout');
  var navPublish = document.getElementById('nav-publish');
  var navProfile = document.getElementById('nav-profile');
  var navPrivate = document.getElementById('nav-private');
  var themeToggle = document.getElementById('theme-toggle');

  function applyTheme(t) {
    document.body.classList.toggle('dark', t === 'dark');
    if (themeToggle) themeToggle.textContent = t === 'dark' ? '☀️' : '🌙';
  }
  if (themeToggle) {
    applyTheme(localStorage.getItem('blog-theme') || 'light');
    themeToggle.addEventListener('click', function () {
      var next = document.body.classList.contains('dark') ? 'light' : 'dark';
      localStorage.setItem('blog-theme', next);
      applyTheme(next);
    });
  }

  fetch('/api/me').then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.user) {
        navLogin.classList.add('hidden');
        navLogout.classList.remove('hidden');
        navProfile.classList.remove('hidden');
        navPublish.classList.remove('hidden');
      }
      if (navPrivate) navPrivate.classList.remove('hidden');
    })
    .catch(function () {});

  navLogout.addEventListener('click', function (e) {
    e.preventDefault();
    fetch('/api/logout', { method: 'POST' }).then(function () { window.location.href = '/'; });
  });
  if (navPublish) navPublish.addEventListener('click', function (e) { e.preventDefault(); window.location.href = '/publish.html'; });
  if (navProfile) navProfile.addEventListener('click', function (e) { e.preventDefault(); window.location.href = '/profile.html'; });
  if (navPrivate) navPrivate.addEventListener('click', function (e) { e.preventDefault(); window.location.href = '/private.html'; });

  fetch('/api/posts')
    .then(function (res) { return res.json(); })
    .then(function (d) {
      var posts = Array.isArray(d) ? d : (d.posts || []);
      var tags = Array.isArray(d) ? [] : (d.tags || []);
      box.innerHTML = '';

      // 标签云
      if (tags.length) {
        var tagDiv = document.createElement('div');
        tagDiv.className = 'tag-cloud';
        tagDiv.innerHTML = '<span class="tag-title">🏷 全部标签：</span>' +
          tags.map(function (t) { return '<a class="tag-chip" href="/?tag=' + encodeURIComponent(t) + '">' + escapeHtml(t) + '</a>'; }).join('');
        box.appendChild(tagDiv);
      }

      // 按年分组
      var years = {};
      posts.forEach(function (p) {
        var y = (p.date || '?').slice(0, 4);
        (years[y] = years[y] || []).push(p);
      });
      Object.keys(years).sort().reverse().forEach(function (y) {
        var h = document.createElement('h2');
        h.className = 'archive-year';
        h.textContent = y + ' 年（' + years[y].length + ' 篇）';
        box.appendChild(h);
        years[y].forEach(function (p) {
          var item = document.createElement('div');
          item.className = 'archive-item';
          var d = document.createElement('span');
          d.className = 'a-date';
          d.textContent = (p.date || '').slice(5);
          var a = document.createElement('a');
          a.href = '/post.html?slug=' + encodeURIComponent(p.slug);
          a.textContent = p.title;
          item.appendChild(d);
          item.appendChild(a);
          if (p.tags && p.tags.length) {
            var tg = document.createElement('span');
            tg.className = 'a-tags';
            tg.textContent = p.tags.map(function (t) { return '#' + t; }).join(' ');
            item.appendChild(tg);
          }
          box.appendChild(item);
        });
      });
      if (!posts.length) box.innerHTML = '<p class="status-msg">还没有文章</p>';
    })
    .catch(function () { box.innerHTML = '<p class="status-msg">加载失败</p>'; });
})();

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}