const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { DatabaseSync } = require('node:sqlite');

const PORT = 4000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DB_FILE = path.join(__dirname, 'data', 'blog.db');
const POSTS_SEED = path.join(__dirname, 'data', 'posts.json');

const db = new DatabaseSync(DB_FILE);

// ---------- session 过期清理（30 天） ----------
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
function getSession(token) {
  if (!token) return null;
  const row = db.prepare('SELECT s.username, u.is_admin, u.signature, s.created_at FROM sessions s JOIN users u ON u.username = s.username WHERE s.token = ?')
    .get(token);
  if (!row) return null;
  const created = row.created_at ? new Date(row.created_at).getTime() : 0;
  if (created && Date.now() - created > SESSION_TTL_MS) {
    destroySession(token);
    return null;
  }
  return row;
}
// 启动时 + 每 6 小时清理过期 session，防表无限膨胀
function purgeSessions() {
  const cutoff = new Date(Date.now() - SESSION_TTL_MS).toISOString();
  try { db.prepare('DELETE FROM sessions WHERE created_at < ?').run(cutoff); } catch (e) {}
}
purgeSessions();
setInterval(purgeSessions, 6 * 60 * 60 * 1000).unref();

// ---------- 登录限流（防暴力破解，内存滑动窗口） ----------
const loginAttempts = new Map(); // username -> {count, resetAt}
function loginThrottled(username) {
  const now = Date.now();
  const rec = loginAttempts.get(username);
  if (!rec || now > rec.resetAt) {
    loginAttempts.set(username, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return false;
  }
  rec.count++;
  return rec.count > 10; // 10 分钟 10 次失败后限流
}
function loginReset(username) { loginAttempts.delete(username); }
// 定期清理限流表防内存泄漏
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of loginAttempts) if (now > v.resetAt) loginAttempts.delete(k);
}, 5 * 60 * 1000).unref();

// ---------- gzip 压缩（文本资源，减轻穿透流量） ----------
function gzipIfPossible(buf) {
  try { return zlib.gzipSync(buf, { level: 6 }); } catch (e) { return null; }
}

// ---------- 建表 ----------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  is_admin INTEGER DEFAULT 0,
  signature TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT DEFAULT '',
  content TEXT NOT NULL,
  date TEXT NOT NULL,
  author TEXT NOT NULL,
  zone TEXT NOT NULL DEFAULT 'public',
  tags TEXT DEFAULT '',
  updated_at TEXT DEFAULT '',
  pinned INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS likes (
  post_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  PRIMARY KEY (post_id, username)
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);

// ---------- 密码哈希 ----------
// 老库补列（无 tags/updated_at/pinned 时加，避免重建丢数据）
try { db.exec("ALTER TABLE posts ADD COLUMN tags TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE posts ADD COLUMN updated_at TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE posts ADD COLUMN pinned INTEGER DEFAULT 0"); } catch (e) {}
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
}
function makeSalt() {
  return crypto.randomBytes(16).toString('hex');
}

// ---------- 会话 ----------
function createSession(username) {
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions (token, username, created_at) VALUES (?, ?, ?)')
    .run(token, username, new Date().toISOString());
  return token;
}
function getSession(token) {
  if (!token) return null;
  const row = db.prepare('SELECT s.username, u.is_admin, u.signature FROM sessions s JOIN users u ON u.username = s.username WHERE s.token = ?')
    .get(token);
  return row || null;
}
function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

// ---------- 工具 ----------
function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'same-origin'
  };
  const gz = gzipIfPossible(body);
  if (gz) {
    headers['Content-Encoding'] = 'gzip';
    headers['Content-Length'] = Buffer.byteLength(gz);
    res.writeHead(statusCode, headers);
    return res.end(gz);
  }
  headers['Content-Length'] = Buffer.byteLength(body);
  res.writeHead(statusCode, headers);
  res.end(body);
}
function readBody(req, cb) {
  let body = '';
  req.on('data', (chunk) => { body += chunk; if (body.length > 1e6) req.destroy(); });
  req.on('end', () => {
    try { cb(JSON.parse(body || '{}')); } catch (e) { cb({}); }
  });
}
function publicUser(row) {
  return { username: row.username, is_admin: !!row.is_admin, signature: row.signature || '' };
}
function publicPost(row) {
  return {
    slug: row.slug, title: row.title, excerpt: row.excerpt,
    date: row.date, author: row.author, zone: row.zone,
    content: row.content,
    tags: (row.tags || '').split(',').map(s => s.trim()).filter(Boolean),
    updated_at: row.updated_at || row.date,
    pinned: !!row.pinned
  };
}
function getLikes(postId) {
  return db.prepare('SELECT COUNT(*) AS n FROM likes WHERE post_id = ?').get(postId).n;
}
function getComments(postId) {
  return db.prepare('SELECT username, content, created_at FROM comments WHERE post_id = ? ORDER BY created_at ASC').all(postId);
}

// ---------- 预置管理员 + 迁移旧文章 ----------
(function seed() {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!existing) {
    // 密码从私有文件 .admin_pw.txt 读取（首次启动生成随机密码，防明文入库/GitHub 泄露）
    let adminPw = '';
    try {
      adminPw = fs.readFileSync(path.join(__dirname, '.admin_pw.txt'), 'utf8').trim();
    } catch (e) {}
    if (!adminPw) {
      adminPw = crypto.randomBytes(9).toString('hex');
      fs.writeFileSync(path.join(__dirname, '.admin_pw.txt'), adminPw, { mode: 0o600 });
    }
    const salt = makeSalt();
    db.prepare('INSERT INTO users (username, password_hash, salt, is_admin, signature) VALUES (?, ?, ?, 1, ?)')
      .run('admin', hashPassword(adminPw, salt), salt, '管理员就是我自己 😎');
    console.log('已创建管理员账号 admin（密码见 .admin_pw.txt）');
  }
  // 从旧 posts.json 迁移（无则跳过）
  if (fs.existsSync(POSTS_SEED)) {
    try {
      const posts = JSON.parse(fs.readFileSync(POSTS_SEED, 'utf8'));
      const count = db.prepare('SELECT COUNT(*) AS n FROM posts').get().n;
      if (Array.isArray(posts) && count === 0) {
        const ins = db.prepare('INSERT INTO posts (slug, title, excerpt, content, date, author, zone) VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (const p of posts) {
          ins.run(p.slug, p.title, p.excerpt || '', p.content || '', p.date || '', 'admin', 'public');
        }
        console.log(`已迁移 ${posts.length} 篇旧文章`);
      }
    } catch (e) { console.log('旧文章迁移跳过:', e.message); }
  }
})();

// ---------- 路由 ----------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch (e) { sendJson(res, 400, { error: 'bad request' }); return; }

  const cookies = (req.headers.cookie || '').split(';').map(c => c.trim()).filter(Boolean);
  const token = (cookies.find(c => c.startsWith('session=')) || '').slice(8) || null;
  const session = getSession(token);

  // ---- 认证 ----
  if (req.method === 'POST' && pathname === '/api/register') {
    return readBody(req, (body) => {
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return sendJson(res, 400, { error: '用户名需 3-20 位字母数字下划线' });
      if (password.length < 4) return sendJson(res, 400, { error: '密码至少 4 位' });
      const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (exists) return sendJson(res, 409, { error: '用户名已被注册' });
      const salt = makeSalt();
      db.prepare('INSERT INTO users (username, password_hash, salt, is_admin, signature) VALUES (?, ?, ?, 0, ?)')
        .run(username, hashPassword(password, salt), salt, '这个人很懒，什么都没写～');
      const t = createSession(username);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': `session=${t}; Path=/; HttpOnly` });
      res.end(JSON.stringify({ ok: true, user: { username, is_admin: false, signature: '这个人很懒，什么都没写～' } }));
    });
  }

  if (req.method === 'POST' && pathname === '/api/login') {
    return readBody(req, async (body) => {
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      // 登录限流：10 分钟内失败超 10 次则拦截
      if (loginThrottled(username)) return sendJson(res, 429, { error: '尝试次数过多，请 10 分钟后再试' });
      let user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      // 本地账号密码验证
      if (user && user.password_hash === hashPassword(password, user.salt)) {
        loginReset(username);
        const t = createSession(username);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': `session=${t}; Path=/; HttpOnly` });
        return res.end(JSON.stringify({ ok: true, user: publicUser(user) }));
      }
      // OJ 账号互通登录（像微信扫码那样：OJ 注册过的用户直接登博客）
      // 本地查不到或密码不对时，转发给 OJ 验证；OJ 认账就在博客建号/同步并发会话
      try {
        const ojRes = await fetch('http://127.0.0.1:8080/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
          signal: AbortSignal.timeout(5000)
        });
        const ojData = await ojRes.json();
        if (ojData.ok) {
          loginReset(username);
          const isAdmin = ojData.role === 'admin' ? 1 : 0;
          if (!user) {
            const salt = makeSalt();
            db.prepare('INSERT INTO users (username, password_hash, salt, is_admin, signature) VALUES (?, ?, ?, ?, ?)')
              .run(username, hashPassword(password, salt), salt, isAdmin, '来自 OJ 的 ' + username);
          } else {
            // 同步最新密码与角色（用户可能在 OJ 改过密码）
            const salt = makeSalt();
            db.prepare('UPDATE users SET password_hash = ?, salt = ?, is_admin = ? WHERE username = ?')
              .run(hashPassword(password, salt), salt, isAdmin, username);
          }
          user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
          const t = createSession(username);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': `session=${t}; Path=/; HttpOnly` });
          return res.end(JSON.stringify({ ok: true, user: publicUser(user), via_oj: true }));
        }
      } catch (e) { /* OJ 不可达则退回本地验证结果 */ }
      return sendJson(res, 401, { error: '用户名或密码错误' });
    });
  }

  if (req.method === 'POST' && pathname === '/api/logout') {
    destroySession(token);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/api/me') {
    return session ? sendJson(res, 200, { user: publicUser(session) }) : sendJson(res, 401, { error: 'not logged in' });
  }

  // ---- 个人主页：更新签名 ----
  if (req.method === 'POST' && pathname === '/api/signature') {
    if (!session) return sendJson(res, 401, { error: 'not logged in' });
    return readBody(req, (body) => {
      const sig = String(body.signature || '').trim().slice(0, 100);
      db.prepare('UPDATE users SET signature = ? WHERE username = ?').run(sig, session.username);
      sendJson(res, 200, { ok: true, signature: sig });
    });
  }

  if (req.method === 'GET' && pathname === '/api/user/' + encodeURIComponent(session ? session.username : '__none__').replace(/%/g, '%')) {
    // fallthrough
  }

  // ---- 文章列表（支持 ?tag= 过滤、?q= 搜索、分页 ?page=&size=）----
  if (req.method === 'GET' && pathname === '/api/posts') {
    const zone = url.searchParams.get('zone') === 'private' ? 'private' : 'public';
    const tag = (url.searchParams.get('tag') || '').trim();
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    let rows = db.prepare('SELECT * FROM posts WHERE zone = ? ORDER BY pinned DESC, date DESC, id DESC').all(zone);
    if (tag) rows = rows.filter(r => (r.tags || '').split(',').map(s => s.trim()).includes(tag));
    if (q) rows = rows.filter(r => (r.title || '').toLowerCase().includes(q) || (r.content || '').toLowerCase().includes(q) || (r.excerpt || '').toLowerCase().includes(q));
    const size = Math.min(Math.max(parseInt(url.searchParams.get('size') || '0', 10) || 0, 0), 100);
    const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10) || 1, 1);
    const paged = size > 0 ? rows.slice((page - 1) * size, page * size) : rows;
    return sendJson(res, 200, {
      posts: paged.map(r => ({ ...publicPost(r), likes: getLikes(r.id), comment_count: getComments(r.id).length })),
      total: rows.length,
      page, size,
      tags: [...new Set(rows.flatMap(r => (r.tags || '').split(',').map(s => s.trim()).filter(Boolean)))].sort()
    });
  }

  // ---- OJ 网盘文件列表代理（博客“文件页”数据源，只读转发）----
  if (req.method === 'GET' && pathname === '/api/ojfiles') {
    fetch('http://127.0.0.1:8080/api/files', { signal: AbortSignal.timeout(6000) })
      .then(r => r.json())
      .then(d => sendJson(res, 200, d))
      .catch(() => sendJson(res, 502, { error: 'OJ 网盘暂不可达' }));
    return;
  }

  // ---- OJ 网盘文件下载代理（博客文件页走这里，避免直连 8080）----
  if (req.method === 'GET' && pathname.startsWith('/api/ojfile/') && pathname.endsWith('/download')) {
    const fid = pathname.slice('/api/ojfile/'.length, -'/download'.length);
    fetch('http://127.0.0.1:8080/api/files/' + fid + '/download', { signal: AbortSignal.timeout(15000) })
      .then(r => {
        if (!r.ok) return sendJson(res, 502, { error: '文件暂不可达' });
        const disp = r.headers.get('content-disposition') || '';
        res.writeHead(200, {
          'Content-Type': r.headers.get('content-type') || 'application/octet-stream',
          'Content-Length': r.headers.get('content-length') || '',
          'Content-Disposition': disp
        });
        return r.body.pipe(res);
      })
      .catch(() => sendJson(res, 502, { error: '文件暂不可达' }));
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/api/posts/')) {
    const slug = pathname.slice('/api/posts/'.length);
    const row = db.prepare('SELECT * FROM posts WHERE slug = ?').get(slug);
    if (!row) return sendJson(res, 404, { error: 'not found' });
    return sendJson(res, 200, { ...publicPost(row), likes: getLikes(row.id), comments: getComments(row.id) });
  }

  if (req.method === 'POST' && pathname === '/api/posts') {
    if (!session) return sendJson(res, 401, { error: '请先登录' });
    return readBody(req, (body) => {
      const title = String(body.title || '').trim();
      const content = String(body.content || '').trim();
      const zone = body.zone === 'private' ? 'private' : 'public';
      // 私密区仅管理员可发布；知识区登录用户均可发布
      if (zone === 'private' && !session.is_admin) return sendJson(res, 403, { error: '只有管理员能在私密区发布' });
      if (!title || !content) return sendJson(res, 400, { error: '标题和内容不能为空' });
      const slug = body.slug || title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '') + '-' + Date.now().toString(36);
      const excerpt = String(body.excerpt || '').trim() || content.slice(0, 60);
      const date = new Date().toISOString().slice(0, 10);
      const tags = String(body.tags || '').split(/[,，]/).map(s => s.trim()).filter(Boolean).slice(0, 10).join(',');
      try {
        db.prepare('INSERT INTO posts (slug, title, excerpt, content, date, author, zone, tags, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(slug, title, excerpt, content, date, session.username, zone, tags, date);
      } catch (e) { if (String(e.message).includes('UNIQUE')) return sendJson(res, 409, { error: '文章标识重复，再试一次' }); throw e; }
      sendJson(res, 201, { ok: true, slug });
    });
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/posts/')) {
    if (!session || !session.is_admin) return sendJson(res, 403, { error: '只有管理员能删除' });
    const slug = pathname.slice('/api/posts/'.length);
    db.prepare('DELETE FROM posts WHERE slug = ?').run(slug);
    return sendJson(res, 200, { ok: true });
  }

  // ---- 点赞 ----
  if (req.method === 'POST' && pathname.startsWith('/api/posts/') && pathname.endsWith('/like')) {
    if (!session) return sendJson(res, 401, { error: '请先登录' });
    const slug = pathname.slice('/api/posts/'.length, -'/like'.length);
    const row = db.prepare('SELECT id FROM posts WHERE slug = ?').get(slug);
    if (!row) return sendJson(res, 404, { error: 'not found' });
    try {
      db.prepare('INSERT INTO likes (post_id, username) VALUES (?, ?)').run(row.id, session.username);
    } catch (e) {
      db.prepare('DELETE FROM likes WHERE post_id = ? AND username = ?').run(row.id, session.username); // 再点取消
    }
    return sendJson(res, 200, { ok: true, likes: getLikes(row.id) });
  }

  // ---- 评论 ----
  if (req.method === 'POST' && pathname.startsWith('/api/posts/') && pathname.endsWith('/comments')) {
    if (!session) return sendJson(res, 401, { error: '请先登录' });
    const slug = pathname.slice('/api/posts/'.length, -'/comments'.length);
    const row = db.prepare('SELECT id FROM posts WHERE slug = ?').get(slug);
    if (!row) return sendJson(res, 404, { error: 'not found' });
    return readBody(req, (body) => {
      const content = String(body.content || '').trim();
      if (!content) return sendJson(res, 400, { error: '评论不能为空' });
      if (content.length > 500) return sendJson(res, 400, { error: '评论最多 500 字' });
      db.prepare('INSERT INTO comments (post_id, username, content, created_at) VALUES (?, ?, ?, ?)')
        .run(row.id, session.username, content, new Date().toISOString());
      sendJson(res, 201, { ok: true, comment: { username: session.username, content, created_at: new Date().toISOString() } });
    });
  }

  // ---- sitemap.xml（自动从文章库生成，供搜索引擎收录）----
  if (req.method === 'GET' && pathname === '/sitemap.xml') {
    const rows = db.prepare("SELECT slug, date FROM posts WHERE zone='public' ORDER BY date DESC").all();
    const base = 'https://blog.bitoj.dpdns.org';
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
    xml += '<url><loc>' + base + '/</loc><priority>1.0</priority></url>';
    xml += '<url><loc>' + base + '/archives.html</loc></url>';
    rows.forEach(r => {
      xml += '<url><loc>' + base + '/post.html?slug=' + encodeURIComponent(r.slug) +
        '</loc><lastmod>' + (r.date || '') + '</lastmod><priority>0.8</priority></url>';
    });
    xml += '</urlset>';
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end(xml);
  }

  // ---- RSS 订阅源（RSS 2.0，供阅读器/订阅）----
  if (req.method === 'GET' && pathname === '/rss.xml') {
    const rows = db.prepare("SELECT * FROM posts WHERE zone='public' ORDER BY date DESC LIMIT 20").all();
    const base = 'https://blog.bitoj.dpdns.org';
    let rss = '<?xml version="1.0" encoding="UTF-8"?>\n';
    rss += '<rss version="2.0"><channel>';
    rss += '<title>比特的小博客</title><link>' + base + '/</link>';
    rss += '<description>比特的小博客 - C++ 学习与生活记录</description>';
    rss += '<language>zh-cn</language>';
    rows.forEach(r => {
      const esc = s => String(s || '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
      const desc = esc(r.excerpt);
      rss += '<item><title>' + esc(r.title) + '</title>';
      rss += '<link>' + base + '/post.html?slug=' + encodeURIComponent(r.slug) + '</link>';
      rss += '<guid>' + base + '/post.html?slug=' + encodeURIComponent(r.slug) + '</guid>';
      rss += '<pubDate>' + (r.date || '') + '</pubDate>';
      rss += '<description><![CDATA[' + (r.excerpt || '') + ']]></description>';
      rss += '</item>';
    });
    rss += '</channel></rss>';
    res.writeHead(200, { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end(rss);
  }

  // ---- 静态文件 ----
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' });

  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'text/xml; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml'
  };
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(PUBLIC_DIR, relativePath);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) || !contentTypes[path.extname(filePath).toLowerCase()]) {
    // 自定义 404 页
    const notFound = path.join(PUBLIC_DIR, '404.html');
    fs.readFile(notFound, (err, html) => {
      if (err) return sendJson(res, 404, { error: 'not found' });
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) return sendJson(res, error.code === 'ENOENT' ? 404 : 500, { error: error.code === 'ENOENT' ? 'not found' : 'server error' });
    // 静态资源缓存策略：css/js 带版本号可强缓存 7 天；html 不缓存（防旧页）
    const ext = path.extname(filePath).toLowerCase();
    const headers = { 'Content-Type': contentTypes[ext] };
    if (ext === '.css' || ext === '.js') headers['Cache-Control'] = 'public, max-age=604800';
    else headers['Cache-Control'] = 'no-cache';
    // 文本资源 gzip
    if (ext === '.html' || ext === '.css' || ext === '.js' || ext === '.txt' || ext === '.xml') {
      const gz = gzipIfPossible(content);
      if (gz) {
        headers['Content-Encoding'] = 'gzip';
        headers['Content-Length'] = Buffer.byteLength(gz);
        res.writeHead(200, headers);
        return res.end(gz);
      }
    }
    headers['Content-Length'] = content.length;
    res.writeHead(200, headers);
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log('博客运行在 http://localhost:4000');
});