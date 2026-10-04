/* 比特的小博客 - 主页逻辑 v4（标签/分页/主题） */
(function () {
  'use strict';

  var list = document.getElementById('post-list');
  var statusMsg = document.getElementById('status-msg');
  var searchInput = document.getElementById('search-input');
  var tagCloud = document.getElementById('tag-cloud');

  var navLogin = document.getElementById('nav-login');
  var navLogout = document.getElementById('nav-logout');
  var navPublish = document.getElementById('nav-publish');
  var navProfile = document.getElementById('nav-profile');
  var navPrivate = document.getElementById('nav-private');
  var themeToggle = document.getElementById('theme-toggle');

  var allPosts = [];
  var allTags = [];
  var me = null;
  var activeTag = '';
  var currentPage = 1;
  var pageSize = 10;

  // ---- 主题切换 ----
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

  // ---- 登录态处理 ----
  function applyAuth(user) {
    me = user || null;
    var loggedIn = !!me;
    navLogin.classList.toggle('hidden', loggedIn);
    navLogout.classList.toggle('hidden', !loggedIn);
    navProfile.classList.toggle('hidden', !loggedIn);
    navPublish.classList.toggle('hidden', !loggedIn);
    if (navPrivate) navPrivate.classList.remove('hidden');
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

  // ---- 标签云 ----
  function renderTags() {
    if (!tagCloud) return;
    tagCloud.innerHTML = '<span class="tag-title">🏷 分类：</span>' +
      '<a href="#" class="tag-chip' + (activeTag === '' ? ' active' : '') + '" data-tag="">全部</a>' +
      allTags.map(function (t) {
        return '<a href="#" class="tag-chip' + (activeTag === t ? ' active' : '') + '" data-tag="' + escapeHtml(t) + '">' + escapeHtml(t) + '</a>';
      }).join('');
    tagCloud.querySelectorAll('.tag-chip').forEach(function (chip) {
      chip.addEventListener('click', function (e) {
        e.preventDefault();
        activeTag = chip.dataset.tag;
        currentPage = 1;
        renderTags();
        renderList();
      });
    });
  }

  // ---- 渲染列表（前端过滤 + 分页）----
  function visible() {
    var k = (searchInput ? searchInput.value.trim() : '').toLowerCase();
    return allPosts.filter(function (p) {
      if (activeTag && (p.tags || []).indexOf(activeTag) === -1) return false;
      if (!k) return true;
      return (p.title || '').toLowerCase().indexOf(k) > -1 ||
             (p.excerpt || '').toLowerCase().indexOf(k) > -1 ||
             (p.content || '').toLowerCase().indexOf(k) > -1 ||
             (p.tags || []).some(function (t) { return t.toLowerCase().indexOf(k) > -1; });
    });
  }

  function renderList() {
    var posts = visible();
    list.innerHTML = '';
    if (posts.length === 0) {
      statusMsg.textContent = allPosts.length === 0 ? '还没有文章，等 AI 来写～' : '没有匹配的文章，换个关键词试试';
      return;
    }
    statusMsg.textContent = '';
    var totalPages = Math.max(1, Math.ceil(posts.length / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;
    var slice = posts.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    slice.forEach(function (post) {
      var li = document.createElement('li');
      li.className = 'post-card';
      var head = document.createElement('div');
      head.className = 'post-head';
      var h2 = document.createElement('h2');
      h2.textContent = post.title || '无标题';
      head.appendChild(h2);
      if (post.pinned) {
        var pinBadge = document.createElement('span');
        pinBadge.className = 'pin-badge';
        pinBadge.textContent = '📌 置顶';
        head.appendChild(pinBadge);
      }
      if (post.author && post.author === 'admin') {
        var badge = document.createElement('span');
        badge.className = 'admin-badge';
        badge.textContent = '管理员';
        head.appendChild(badge);
      }
      var date = document.createElement('div');
      date.className = 'post-date';
      date.textContent = (post.date || '') + ' · ' + (post.author || '匿名') +
        (post.updated_at && post.updated_at !== post.date ? ' · 更新 ' + post.updated_at : '');
      var p = document.createElement('p');
      p.textContent = post.excerpt || '';
      var meta = document.createElement('div');
      meta.className = 'post-meta';
      meta.textContent = '❤ ' + (post.likes || 0) + '  ·  💬 ' + (post.comment_count || 0);
      if (post.tags && post.tags.length) {
        var tagLine = document.createElement('div');
        tagLine.className = 'post-tags';
        tagLine.textContent = post.tags.map(function (t) { return '#' + t; }).join(' ');
        meta.appendChild(tagLine);
      }
      li.appendChild(head);
      li.appendChild(date);
      li.appendChild(p);
      li.appendChild(meta);
      li.addEventListener('click', function () {
        window.location.href = 'post.html?slug=' + encodeURIComponent(post.slug);
      });
      list.appendChild(li);
    });

    // 分页
    var pager = document.getElementById('pager');
    if (pager) {
      pager.innerHTML = '';
      if (totalPages > 1) {
        var prev = document.createElement('button');
        prev.className = 'page-btn';
        prev.textContent = '‹ 上一页';
        prev.disabled = currentPage <= 1;
        prev.addEventListener('click', function () { if (currentPage > 1) { currentPage--; renderList(); window.scrollTo(0, 0); } });
        pager.appendChild(prev);
        var info = document.createElement('span');
        info.className = 'page-info';
        info.textContent = currentPage + ' / ' + totalPages + ' 页 · ' + posts.length + ' 篇';
        pager.appendChild(info);
        var next = document.createElement('button');
        next.className = 'page-btn';
        next.textContent = '下一页 ›';
        next.disabled = currentPage >= totalPages;
        next.addEventListener('click', function () { if (currentPage < totalPages) { currentPage++; renderList(); window.scrollTo(0, 0); } });
        pager.appendChild(next);
      } else {
        pager.innerHTML = '<span class="page-info">共 ' + posts.length + ' 篇</span>';
      }
    }
  }

  // ---- 加载 ----
  fetch('/api/posts')
    .then(function (res) { return res.json(); })
    .then(function (d) {
      allPosts = Array.isArray(d) ? d : (d.posts || []);
      allTags = Array.isArray(d) ? [] : (d.tags || []);
      renderTags();
      renderList();
    })
    .catch(function () { statusMsg.textContent = '加载失败，稍后再试'; });

  if (searchInput) searchInput.addEventListener('input', function () {
    currentPage = 1;
    renderList();
  });
})();

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}