/* 比特的小博客 - 文章详情页逻辑 + 评论点赞 */
(function () {
  'use strict';

  var detail = document.getElementById('post-detail');
  var statusMsg = document.getElementById('status-msg');
  var likeBar = document.getElementById('like-bar');
  var likeBtn = document.getElementById('like-btn');
  var likeCount = document.getElementById('like-count');
  var commentsSection = document.getElementById('comments-section');
  var commentCount = document.getElementById('comment-count');
  var commentFormBox = document.getElementById('comment-form-box');
  var commentLoginHint = document.getElementById('comment-login-hint');
  var commentInput = document.getElementById('comment-input');
  var commentSubmit = document.getElementById('comment-submit');
  var commentList = document.getElementById('comment-list');

  var navLogin = document.getElementById('nav-login');
  var navLogout = document.getElementById('nav-logout');
  var navPublish = document.getElementById('nav-publish');
  var navProfile = document.getElementById('nav-profile');

  var params = new URLSearchParams(window.location.search);
  var slug = params.get('slug');
  var me = null;
  var post = null;

  // ---- 登录态 ----
  function applyAuth(user) {
    me = user || null;
    var loggedIn = !!me;
    navLogin.classList.toggle('hidden', loggedIn);
    navLogout.classList.toggle('hidden', !loggedIn);
    navProfile.classList.toggle('hidden', !loggedIn);
    navPublish.classList.toggle('hidden', !(me && me.is_admin));
  }
  fetch('/api/me').then(function (r) { return r.json(); })
    .then(function (d) { if (d.user) applyAuth(d.user); })
    .catch(function () {});

  navLogout.addEventListener('click', function (e) {
    e.preventDefault();
    fetch('/api/logout', { method: 'POST' }).then(function () { window.location.href = '/'; });
  });
  if (navPublish) navPublish.addEventListener('click', function (e) { e.preventDefault(); window.location.href = '/publish.html'; });
  if (navProfile) navProfile.addEventListener('click', function (e) { e.preventDefault(); window.location.href = '/profile.html'; });

  if (!slug) { statusMsg.textContent = '缺少文章标识，返回主页重试'; return; }

  // ---- 渲染文章 ----
  function renderPost(p) {
    post = p;
    detail.innerHTML = '';
    var head = document.createElement('div');
    head.className = 'post-head';
    var h1 = document.createElement('h1');
    h1.className = 'post-title';
    h1.textContent = p.title || '无标题';
    head.appendChild(h1);
    if (p.author === 'admin') {
      var badge = document.createElement('span');
      badge.className = 'admin-badge';
      badge.textContent = '管理员';
      head.appendChild(badge);
    }
    var date = document.createElement('div');
    date.className = 'post-date';
    date.textContent = (p.date || '') + ' · 作者 ' + (p.author || '匿名');
    var body = document.createElement('div');
    body.className = 'post-content';
    var paras = String(p.content || '').split(/\n+/).filter(function (s) { return s.trim(); });
    paras.forEach(function (para) {
      var paraEl = document.createElement('p');
      paraEl.textContent = para.trim();
      body.appendChild(paraEl);
    });
    detail.appendChild(head);
    detail.appendChild(date);
    detail.appendChild(body);

    // 点赞区
    likeBar.classList.remove('hidden');
    likeCount.textContent = p.likes || 0;

    // 评论区
    commentsSection.classList.remove('hidden');
    commentCount.textContent = (p.comments || []).length;
    renderComments(p.comments || []);
    if (me) {
      commentFormBox.classList.remove('hidden');
      commentLoginHint.classList.add('hidden');
    } else {
      commentFormBox.classList.add('hidden');
      commentLoginHint.classList.remove('hidden');
    }
  }

  function renderComments(comments) {
    commentList.innerHTML = '';
    if (!comments.length) {
      var empty = document.createElement('li');
      empty.className = 'comment-empty';
      empty.textContent = '还没有评论，来抢沙发～';
      commentList.appendChild(empty);
      return;
    }
    comments.forEach(function (c) {
      var li = document.createElement('li');
      li.className = 'comment-item';
      var meta = document.createElement('div');
      meta.className = 'comment-meta';
      meta.textContent = c.username + (c.username === 'admin' ? ' (管理员)' : '') + ' · ' + (c.created_at || '').slice(0, 16).replace('T', ' ');
      var text = document.createElement('div');
      text.className = 'comment-text';
      text.textContent = c.content;
      li.appendChild(meta);
      li.appendChild(text);
      commentList.appendChild(li);
    });
  }

  // ---- 加载文章 ----
  fetch('/api/posts/' + encodeURIComponent(slug))
    .then(function (res) {
      if (res.status === 403) throw new Error('private');
      if (!res.ok) throw new Error('not found');
      return res.json();
    })
    .then(renderPost)
    .catch(function (err) {
      statusMsg.textContent = err.message === 'private' ? '这篇文章在私密区，仅管理员可见' : '文章不存在或加载失败';
    });

  // ---- 点赞 ----
  likeBtn.addEventListener('click', function () {
    if (!me) { alert('请先登录再点赞'); return; }
    fetch('/api/posts/' + encodeURIComponent(slug) + '/like', { method: 'POST' })
      .then(function (res) { return res.json(); })
      .then(function (d) { if (d.ok) likeCount.textContent = d.likes; })
      .catch(function () { alert('点赞失败'); });
  });

  // ---- 评论 ----
  commentSubmit.addEventListener('click', function () {
    var text = commentInput.value.trim();
    if (!text) { alert('评论不能为空'); return; }
    fetch('/api/posts/' + encodeURIComponent(slug) + '/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text })
    })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) { alert(r.d.error || '评论失败'); return; }
        commentInput.value = '';
        commentCount.textContent = parseInt(commentCount.textContent, 10) + 1;
        if (post) renderComments((post.comments || []).concat([r.d.comment]));
      })
      .catch(function () { alert('网络错误'); });
  });
})();