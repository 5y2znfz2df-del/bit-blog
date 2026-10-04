/* 发布文章逻辑 */
(function () {
  'use strict';
  var form = document.getElementById('publish-form');
  var title = document.getElementById('pub-title');
  var excerpt = document.getElementById('pub-excerpt');
  var content = document.getElementById('pub-content');
  var zone = document.getElementById('pub-zone');
  var msg = document.getElementById('pub-msg');
  var submit = document.getElementById('pub-submit');

  // ---- 标签联想：拉所有已有标签填进 datalist，提示用规范词 ----
  (function () {
    fetch('/api/posts?size=100')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var ps = Array.isArray(d) ? d : (d.posts || []);
        var set = {};
        ps.forEach(function (p) {
          (p.tags || []).forEach(function (t) { if (t) set[t] = 1; });
        });
        var list = document.getElementById('tag-suggestions');
        if (list) {
          list.innerHTML = Object.keys(set).map(function (t) {
            return '<option value="' + t.replace(/"/g, '&quot;') + '">';
          }).join('');
        }
      })
      .catch(function () {});
  })();

  // 先确认登录，否则打回；私密区选项仅管理员可见
  fetch('/api/me').then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d.user) { msg.textContent = '请先登录'; window.location.href = '/login.html'; return; }
      if (!d.user.is_admin) {
        // 普通用户：隐藏私密区选项，默认知识区
        var zoneWrap = document.getElementById('pub-zone-wrap');
        if (zoneWrap) zoneWrap.classList.add('hidden');
        zone.value = 'public';
      }
    })
    .catch(function () {});

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var t = title.value.trim();
    var c = content.value.trim();
    if (!t || !c) { msg.textContent = '标题和内容不能为空'; return; }
    submit.disabled = true;
    submit.textContent = '发布中…';
    fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: t,
        excerpt: excerpt.value.trim(),
        content: c,
        zone: zone.value,
        tags: (document.getElementById('pub-tags') ? document.getElementById('pub-tags').value : '')
      })
    })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) { msg.textContent = r.d.error || '发布失败'; submit.disabled = false; submit.textContent = '发布'; return; }
        window.location.href = '/post.html?slug=' + encodeURIComponent(r.d.slug);
      })
      .catch(function () { msg.textContent = '网络错误'; submit.disabled = false; submit.textContent = '发布'; });
  });
})();