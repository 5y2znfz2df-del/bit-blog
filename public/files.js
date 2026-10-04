/* 文件资源页：列表/分页/图标/搜索/大文件只下载 */
(function () {
  'use strict';
  var list = document.getElementById('file-list');
  var pager = document.getElementById('file-pager');
  var search = document.getElementById('file-search');
  var statusMsg = document.getElementById('file-status');

  var navLogin = document.getElementById('nav-login');
  var navLogout = document.getElementById('nav-logout');
  var navPublish = document.getElementById('nav-publish');
  var navProfile = document.getElementById('nav-profile');
  var navPrivate = document.getElementById('nav-private');
  var themeToggle = document.getElementById('theme-toggle');

  var allFiles = [];
  var pageSize = 12, page = 1;

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

  // 文件类型 → 图标 + 是否可预览
  function fileMeta(name) {
    var ext = (name.split('.').pop() || '').toLowerCase();
    if (name.endsWith('.dmg') || name.endsWith('.exe') || name.endsWith('.app')) return { icon: '📦', preview: false };
    if (['zip', 'rar', '7z', 'tar', 'gz'].indexOf(ext) > -1) return { icon: '🗜️', preview: false };
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'].indexOf(ext) > -1) return { icon: '🖼️', preview: true };
    if (['md', 'markdown', 'txt', 'log'].indexOf(ext) > -1) return { icon: '📄', preview: true };
    if (['c', 'cpp', 'cc', 'h', 'hpp', 'js', 'ts', 'py', 'java', 'go', 'rs', 'html', 'css', 'json', 'sh', 'sql'].indexOf(ext) > -1) return { icon: '💻', preview: true };
    if (['doc', 'docx', 'pdf', 'ppt', 'pptx', 'xls', 'xlsx'].indexOf(ext) > -1) return { icon: '📚', preview: false };
    return { icon: '📎', preview: false };
  }
  function fmtSize(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1024 / 1024).toFixed(1) + ' MB';
  }

  function render() {
    var k = (search.value || '').trim().toLowerCase();
    var files = allFiles.filter(function (f) {
      return !k || (f.filename || '').toLowerCase().indexOf(k) > -1;
    });
    list.innerHTML = '';
    if (!files.length) {
      list.innerHTML = '<li class="status-msg">还没有文件，或没有匹配的</li>';
      pager.innerHTML = '';
      return;
    }
    var totalPages = Math.max(1, Math.ceil(files.length / pageSize));
    if (page > totalPages) page = totalPages;
    var slice = files.slice((page - 1) * pageSize, page * pageSize);
    slice.forEach(function (f) {
      var meta = fileMeta(f.filename || '');
      var li = document.createElement('li');
      li.className = 'file-item';
      var icon = document.createElement('span');
      icon.className = 'file-icon';
      icon.textContent = meta.icon;
      var info = document.createElement('div');
      info.className = 'file-info';
      var name = document.createElement('div');
      name.className = 'file-name';
      name.textContent = f.filename || '未命名';
      var m = document.createElement('div');
      m.className = 'file-meta';
      m.textContent = fmtSize(f.size) + ' · ' + (f.uploaded_at || '') + ' · 上传者 ' + (f.uploaded_by || '?') + ' · ⬇ ' + (f.downloads || 0) +
        (meta.preview ? '' : ' · 🔒 大文件仅下载');
      info.appendChild(name);
      info.appendChild(m);
      var down = document.createElement('a');
      down.className = 'file-down';
      // 公网下载走博客代理（避免直连 8080，普通用户也能下）
      down.href = '/api/ojfile/' + f.id + '/download';
      down.setAttribute('download', '');
      down.textContent = '⬇️ 下载';
      li.appendChild(icon);
      li.appendChild(info);
      li.appendChild(down);
      list.appendChild(li);
    });
    // 分页
    pager.innerHTML = '';
    if (totalPages > 1) {
      var prev = document.createElement('button');
      prev.className = 'page-btn'; prev.textContent = '‹ 上一页';
      prev.disabled = page <= 1;
      prev.addEventListener('click', function () { if (page > 1) { page--; render(); } });
      pager.appendChild(prev);
      var info = document.createElement('span');
      info.className = 'page-info';
      info.textContent = page + ' / ' + totalPages + ' · ' + files.length + ' 个文件';
      pager.appendChild(info);
      var next = document.createElement('button');
      next.className = 'page-btn'; next.textContent = '下一页 ›';
      next.disabled = page >= totalPages;
      next.addEventListener('click', function () { if (page < totalPages) { page++; render(); } });
      pager.appendChild(next);
    } else if (files.length) {
      pager.innerHTML = '<span class="page-info">共 ' + files.length + ' 个文件</span>';
    }
  }

  fetch('/api/ojfiles')
    .then(function (r) { return r.json(); })
    .then(function (d) {
      allFiles = d.files || [];
      render();
    })
    .catch(function () { list.innerHTML = '<li class="status-msg">文件服务暂不可达，稍后再试</li>'; });

  if (search) search.addEventListener('input', function () { page = 1; render(); });
})();