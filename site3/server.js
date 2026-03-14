const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const session = require('express-session');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'museum-svki-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Static files
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads dir exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = Date.now() + '-' + Math.random().toString(36).substr(2, 9) + ext;
    cb(null, name);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Auth middleware
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ============ PUBLIC API ============

// Get all top-level sections (no parent)
app.get('/api/sections', (req, res) => {
  const sections = db.prepare(
    'SELECT * FROM sections WHERE parent_id IS NULL ORDER BY sort_order'
  ).all();
  res.json(sections);
});

// Get section by slug with children and pages
app.get('/api/sections/:slug', (req, res) => {
  const section = db.prepare('SELECT * FROM sections WHERE slug = ?').get(req.params.slug);
  if (!section) return res.status(404).json({ error: 'Not found' });

  const children = db.prepare(
    'SELECT * FROM sections WHERE parent_id = ? ORDER BY sort_order'
  ).all(section.id);

  const pages = db.prepare(
    'SELECT * FROM pages WHERE section_id = ? ORDER BY sort_order'
  ).all(section.id);

  res.json({ ...section, children, pages });
});

// Get pages for a section
app.get('/api/sections/:slug/pages', (req, res) => {
  const section = db.prepare('SELECT id FROM sections WHERE slug = ?').get(req.params.slug);
  if (!section) return res.status(404).json({ error: 'Not found' });

  const pages = db.prepare(
    'SELECT * FROM pages WHERE section_id = ? ORDER BY sort_order'
  ).all(section.id);
  res.json(pages);
});

// ============ ADMIN API ============

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const stored = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_password');
  if (stored && password === stored.value) {
    req.session.isAdmin = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Неверный пароль' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/admin/check', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// Change password
app.post('/api/admin/password', requireAdmin, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: 'Пароль слишком короткий' });
  db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(newPassword, 'admin_password');
  res.json({ success: true });
});

// ---- Sections CRUD ----
app.get('/api/admin/sections', requireAdmin, (req, res) => {
  const sections = db.prepare('SELECT * FROM sections ORDER BY sort_order').all();
  res.json(sections);
});

app.post('/api/admin/sections', requireAdmin, (req, res) => {
  const { slug, title, type, parent_id, icon, sort_order } = req.body;
  if (!slug || !title) return res.status(400).json({ error: 'Необходимо указать идентификатор и название' });
  try {
    const result = db.prepare(
      'INSERT INTO sections (slug, title, type, parent_id, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(slug, title, type || 'book', parent_id || null, icon || '', sort_order || 0);
    res.json({ id: result.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/admin/sections/:id', requireAdmin, (req, res) => {
  const { title, type, icon, sort_order, slug } = req.body;
  const updates = [];
  const params = [];
  if (title !== undefined) { updates.push('title = ?'); params.push(title); }
  if (type !== undefined) { updates.push('type = ?'); params.push(type); }
  if (icon !== undefined) { updates.push('icon = ?'); params.push(icon); }
  if (sort_order !== undefined) { updates.push('sort_order = ?'); params.push(sort_order); }
  if (slug !== undefined) { updates.push('slug = ?'); params.push(slug); }
  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });
  params.push(req.params.id);
  db.prepare(`UPDATE sections SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true });
});

app.delete('/api/admin/sections/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM sections WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ---- Pages CRUD ----
app.get('/api/admin/pages', requireAdmin, (req, res) => {
  const sectionId = req.query.section_id;
  if (sectionId) {
    res.json(db.prepare('SELECT * FROM pages WHERE section_id = ? ORDER BY sort_order').all(sectionId));
  } else {
    res.json(db.prepare('SELECT * FROM pages ORDER BY section_id, sort_order').all());
  }
});

app.post('/api/admin/pages', requireAdmin, (req, res) => {
  const { section_id, title, name, rank, bio, photo, photo2, template, sort_order } = req.body;
  if (!section_id) return res.status(400).json({ error: 'section_id required' });
  const result = db.prepare(
    'INSERT INTO pages (section_id, title, name, rank, bio, photo, photo2, template, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(section_id, title || '', name || '', rank || '', bio || '', photo || '', photo2 || '', template || 'default', sort_order || 0);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/admin/pages/:id', requireAdmin, (req, res) => {
  const fields = ['title', 'name', 'rank', 'bio', 'photo', 'photo2', 'template', 'sort_order', 'section_id'];
  const updates = [];
  const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      params.push(req.body[f]);
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });
  params.push(req.params.id);
  db.prepare(`UPDATE pages SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true });
});

app.delete('/api/admin/pages/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM pages WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Reorder pages
app.post('/api/admin/pages/reorder', requireAdmin, (req, res) => {
  const { orders } = req.body; // [{id, sort_order}, ...]
  const stmt = db.prepare('UPDATE pages SET sort_order = ? WHERE id = ?');
  const tx = db.transaction((items) => {
    for (const item of items) stmt.run(item.sort_order, item.id);
  });
  tx(orders);
  res.json({ success: true });
});

// Reorder sections
app.post('/api/admin/sections/reorder', requireAdmin, (req, res) => {
  const { orders } = req.body;
  const stmt = db.prepare('UPDATE sections SET sort_order = ? WHERE id = ?');
  const tx = db.transaction((items) => {
    for (const item of items) stmt.run(item.sort_order, item.id);
  });
  tx(orders);
  res.json({ success: true });
});

// File upload
app.post('/api/admin/upload', requireAdmin, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ url: '/uploads/' + req.file.filename });
});

// Serve admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`Музей СВКИ запущен на http://localhost:${PORT}`);
  console.log(`Админ-панель: http://localhost:${PORT}/admin`);
});
