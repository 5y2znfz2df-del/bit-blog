/* 比特的小博客 - 文章详情页 v4（Markdown 渲染/目录/复制/高亮/主题） */
(function () {
  'use strict';

  var detail = document.getElementById('post-detail');
  var statusMsg = document.getElementById('status-msg');
  var crumbTitle = document.getElementById('crumb-title');
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
  var themeToggle = document.getElementById('theme-toggle');

  var params = new URLSearchParams(window.location.search);
  var slug = params.get('slug');
  var zoneHint = (params.get('zone') === 'private' || document.referrer.indexOf('private.html') > -1) ? 'private' : '';
  var me = null;
  var post = null;

  // ---- 主题 ----
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

  // ---- 登录态 ----
  function applyAuth(user) {
    me = user || null;
    var loggedIn = !!me;
    navLogin.classList.toggle('hidden', loggedIn);
    navLogout.classList.toggle('hidden', !loggedIn);
    navProfile.classList.toggle('hidden', !loggedIn);
    navPublish.classList.toggle('hidden', !loggedIn);
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

  // ================= 轻量 Markdown 渲染 =================
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 极简语法高亮（C++/JS/Python 关键词），不依赖 CDN
  var KW = {
    'cpp': /\b(int|char|bool|double|float|long|short|unsigned|signed|void|if|else|for|while|do|return|break|continue|switch|case|default|struct|class|public|private|protected|namespace|using|include|define|const|static|new|delete|try|catch|throw|true|false|nullptr|string|vector|auto|template|typename|this|sizeof|printf|scanf|cin|cout|endl)\b/g,
    'js': /\b(var|let|const|function|return|if|else|for|while|do|switch|case|break|continue|new|typeof|instanceof|true|false|null|undefined|try|catch|throw|async|await|class|extends|this|import|export|default)\b/g,
    'python': /\b(def|return|if|elif|else|for|while|import|from|as|class|try|except|finally|raise|with|lambda|pass|break|continue|True|False|None|and|or|not|in|is|print|len|range)\b/g
  };
  function highlight(code, lang) {
    var pattern = KW[lang] || null;
    if (!pattern) return esc(code);
    return esc(code).replace(pattern, '<b style="color:#c792ea">$1</b>')
      .replace(/(&lt;\/?[a-zA-Z][^&]*&gt;)/g, '<i style="color:#ffcb6b">$1</i>')
      .replace(/(\b\d+\.?\d*\b)/g, '<span style="color:#f78c6c">$1</span>');
  }

  function inlineMd(s) {
    var t = esc(s);
    t = t.replace(/`([^`]+)`/g, '<code style="background:#f0f1f4;padding:2px 6px;border-radius:4px;font-size:13px;color:#e83e8c">$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    t = t.replace(/\*([^*]+)\*/g, '<i>$1</i>');
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    t = t.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy">');
    return t;
  }

  function renderMarkdown(md) {
    var lines = String(md || '').split('\n');
    var html = '';
    var inCode = false, codeBuf = [], codeLang = '';
    var toc = [];
    var inTable = false, tableBuf = [];
    var listStack = []; // 'ul' | 'ol'

    function flushList() {
      while (listStack.length) {
        var t = listStack.pop();
        html += '</' + t + '>';
      }
    }
    function flushTable() {
      if (tableBuf.length) {
        var head = tableBuf[0], rows = tableBuf.slice(1);
        html += '<table><thead><tr>' + head.split('|').filter(function (c) { return c.trim() !== ''; }).map(function (c) { return '<th>' + inlineMd(c.trim()) + '</th>'; }).join('') + '</tr></thead><tbody>';
        rows.forEach(function (r) {
          if (r.trim().replace(/-/g, '').replace(/[\s|:]/g, '') === '') return; // 分隔行
          html += '<tr>' + r.split('|').filter(function (c) { return c.trim() !== ''; }).map(function (c) { return '<td>' + inlineMd(c.trim()) + '</td>'; }).join('') + '</tr>';
        });
        html += '</tbody></table>';
        tableBuf = [];
        inTable = false;
      }
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      // 代码块
      if (/^```/.test(line.trim())) {
        if (inCode) {
          var lang = codeLang;
          var codeHtml = highlight(codeBuf.join('\n'), lang);
          html += '<div class="code-block"><pre><code>' + codeHtml + '</code></pre><button class="copy-btn" data-code="' + encodeURIComponent(codeBuf.join('\n')) + '">复制</button></div>';
          codeBuf = []; inCode = false; codeLang = '';
        } else {
          flushList(); flushTable();
          inCode = true; codeLang = line.trim().slice(3).trim();
        }
        continue;
      }
      if (inCode) { codeBuf.push(line); continue; }

      var trimmed = line.trim();

      // 空行
      if (!trimmed) { flushList(); flushTable(); html += '\n'; continue; }

      // 标题 + 目录
      var h = /^(#{1,3})\s+(.*)$/.exec(trimmed);
      if (h) {
        flushList(); flushTable();
        var level = h[1].length, text = h[2];
        var id = 'sec-' + toc.length;
        toc.push({ level: level, text: text, id: id });
        html += '<h' + level + ' id="' + id + '">' + inlineMd(text) + '</h' + level + '>';
        continue;
      }

      // 表格
      if (trimmed.indexOf('|') > -1) {
        inTable = true;
        tableBuf.push(trimmed);
        continue;
      }
      if (inTable) flushTable();

      // 引用
      if (/^&gt;/.test(esc(trimmed)) || /^>/.test(trimmed)) {
        flushList();
        html += '<blockquote>' + inlineMd(trimmed.replace(/^>\s?/, '')) + '</blockquote>';
        continue;
      }

      // 列表
      var ul = /^[-*]\s+(.*)$/.exec(trimmed);
      var ol = /^\d+[.)]\s+(.*)$/.exec(trimmed);
      if (ul || ol) {
        var type = ul ? 'ul' : 'ol';
        if (listStack[listStack.length - 1] !== type) {
          flushList();
          html += '<' + type + '>';
          listStack.push(type);
        }
        html += '<li>' + inlineMd((ul || ol)[1]) + '</li>';
        continue;
      }

      // 图片独立行 / 普通段落
      flushList();
      html += '<p>' + inlineMd(trimmed) + '</p>';
    }
    if (inCode) {
      html += '<div class="code-block"><pre><code>' + highlight(codeBuf.join('\n'), codeLang) + '</code></pre><button class="copy-btn" data-code="' + encodeURIComponent(codeBuf.join('\n')) + '">复制</button></div>';
    }
    flushList(); flushTable();

    return { html: html, toc: toc };
  }

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
    date.textContent = (p.date || '') + ' · 作者 ' + (p.author || '匿名') +
      (p.updated_at && p.updated_at !== p.date ? ' · 🔄 更新于 ' + p.updated_at : '') +
      (p.tags && p.tags.length ? ' · 🏷 ' + p.tags.map(function (t) { return '#' + t; }).join(' ') : '');
    var body = document.createElement('div');
    body.className = 'post-content';

    var md = renderMarkdown(p.content);
    // 目录（h2/h3 ≥ 2 个才显示）
    if (md.toc.length >= 2) {
      var toc = document.createElement('details');
      toc.className = 'post-toc';
      toc.open = false;
      var sum = document.createElement('summary');
      sum.textContent = '📑 文章目录';
      toc.appendChild(sum);
      md.toc.forEach(function (t) {
        var a = document.createElement('a');
        a.href = '#' + t.id;
        a.textContent = (t.level === 3 ? '· ' : '') + t.text;
        if (t.level === 3) a.className = 'toc-h3';
        toc.appendChild(a);
      });
      body.appendChild(toc);
    }
    // 正文
    var wrap = document.createElement('div');
    wrap.innerHTML = md.html;
    body.appendChild(wrap);

    // 代码复制按钮
    body.querySelectorAll('.copy-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var code = decodeURIComponent(btn.dataset.code);
        function done() {
          btn.textContent = '✅ 已复制';
          btn.classList.add('copied');
          setTimeout(function () { btn.textContent = '复制'; btn.classList.remove('copied'); }, 1800);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(done).catch(function () { fallbackCopy(code); done(); });
        } else { fallbackCopy(code); done(); }
      });
    });
    function fallbackCopy(text) {
      var ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
    }

    detail.appendChild(head);
    detail.appendChild(date);
    detail.appendChild(body);

    if (crumbTitle) crumbTitle.textContent = p.title;

    likeBar.classList.remove('hidden');
    likeCount.textContent = p.likes || 0;
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

  // ---- 上一篇 / 下一篇（按列表顺序找邻居）----
  var postNav = document.getElementById('post-nav');
  function renderNav(posts) {
    if (!postNav || !posts.length) return;
    var idx = -1;
    for (var i = 0; i < posts.length; i++) {
      if (posts[i].slug === slug) { idx = i; break; }
    }
    if (idx < 0) return;
    var prev = posts[idx + 1]; // 列表是新的在前，所以「上一篇」（更早）在更大下标
    var next = posts[idx - 1]; // 「下一篇」（更新）在更小下标
    var html = '';
    if (prev) html += '<a class="post-nav-link" href="/post.html?slug=' + encodeURIComponent(prev.slug) + '">← 上一篇：' + escapeHtml(prev.title) + '</a>';
    if (next) html += '<a class="post-nav-link right" href="/post.html?slug=' + encodeURIComponent(next.slug) + '">下一篇：' + escapeHtml(next.title) + ' →</a>';
    if (html) {
      postNav.innerHTML = html;
      postNav.classList.remove('hidden');
    }
  }
  // 拉同区文章列表找邻居
  fetch('/api/posts' + (zoneHint ? '?zone=' + zoneHint : ''))
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var ps = Array.isArray(d) ? d : (d.posts || []);
      renderNav(ps);
    })
    .catch(function () {});

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