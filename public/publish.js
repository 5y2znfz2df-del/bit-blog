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

  // 先确认登录且是管理员，否则打回
  fetch('/api/me').then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d.user) { msg.textContent = '请先登录'; window.location.href = '/login.html'; return; }
      if (!d.user.is_admin) { msg.textContent = '只有管理员能发布文章'; window.location.href = '/'; return; }
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
        zone: zone.value
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