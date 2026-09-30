const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = 4000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DB_FILE = path.join(__dirname, 'data', 'blog.db');
const POSTS_SEED = path.join(__dirname, 'data', 'posts.json');

const db = new DatabaseSync(DB_FILE);

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
  zone TEXT NOT NULL DEFAULT 'public'
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
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
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
    content: row.content
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
    const salt = makeSalt();
    db.prepare('INSERT INTO users (username, password_hash, salt, is_admin, signature) VALUES (?, ?, ?, 1, ?)')
      .run('admin', hashPassword('fx123456', salt), salt, '管理员就是我自己 😎');
    console.log('已创建管理员账号 admin');
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
    return readBody(req, (body) => {
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      if (!user || user.password_hash !== hashPassword(password, user.salt)) {
        return sendJson(res, 401, { error: '用户名或密码错误' });
      }
      const t = createSession(username);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': `session=${t}; Path=/; HttpOnly` });
      res.end(JSON.stringify({ ok: true, user: publicUser(user) }));
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

  // ---- 文章 ----
  if (req.method === 'GET' && pathname === '/api/posts') {
    // zone=private 仅管理员可取私密区；默认知识区（public）所有人可见
    if (url.searchParams.get('zone') === 'private') {
      if (!session || !session.is_admin) return sendJson(res, 403, { error: '私密区仅管理员可访问' });
      const rows = db.prepare('SELECT * FROM posts WHERE zone = ? ORDER BY date DESC').all('private');
      return sendJson(res, 200, rows.map(r => ({ ...publicPost(r), likes: getLikes(r.id), comment_count: getComments(r.id).length })));
    }
    const rows = db.prepare('SELECT * FROM posts WHERE zone = ? ORDER BY date DESC').all('public');
    return sendJson(res, 200, rows.map(r => ({ ...publicPost(r), likes: getLikes(r.id), comment_count: getComments(r.id).length })));
  }

  if (req.method === 'GET' && pathname.startsWith('/api/posts/')) {
    const slug = pathname.slice('/api/posts/'.length);
    const row = db.prepare('SELECT * FROM posts WHERE slug = ?').get(slug);
    if (!row) return sendJson(res, 404, { error: 'not found' });
    if (row.zone === 'private' && !(session && session.is_admin)) {
      return sendJson(res, 403, { error: '私密文章，仅管理员可见' });
    }
    return sendJson(res, 200, { ...publicPost(row), likes: getLikes(row.id), comments: getComments(row.id) });
  }

  if (req.method === 'POST' && pathname === '/api/posts') {
    if (!session) return sendJson(res, 401, { error: '请先登录' });
    if (!session.is_admin) return sendJson(res, 403, { error: '只有管理员能发布文章' });
    return readBody(req, (body) => {
      const title = String(body.title || '').trim();
      const content = String(body.content || '').trim();
      const zone = body.zone === 'private' ? 'private' : 'public';
      if (!title || !content) return sendJson(res, 400, { error: '标题和内容不能为空' });
      const slug = body.slug || title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '') + '-' + Date.now().toString(36);
      const excerpt = String(body.excerpt || '').trim() || content.slice(0, 60);
      const date = new Date().toISOString().slice(0, 10);
      try {
        db.prepare('INSERT INTO posts (slug, title, excerpt, content, date, author, zone) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(slug, title, excerpt, content, date, session.username, zone);
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

  // ---- 静态文件 ----
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' });

  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.ico': 'image/x-icon'
  };
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(PUBLIC_DIR, relativePath);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) || !contentTypes[path.extname(filePath).toLowerCase()]) {
    return sendJson(res, 404, { error: 'not found' });
  }
  fs.readFile(filePath, (error, content) => {
    if (error) return sendJson(res, error.code === 'ENOENT' ? 404 : 500, { error: error.code === 'ENOENT' ? 'not found' : 'server error' });
    res.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log('博客运行在 http://localhost:4000');
});