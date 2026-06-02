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
  res.json({ url: 'uploads/' + req.file.filename });
});

// ============ WELCOME AUDIO ============

const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'welcome_audio_' + Date.now() + ext);
  }
});
const audioUpload = multer({
  storage: audioStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.mp3', '.ogg', '.wav', '.m4a'].includes(ext)) cb(null, true);
    else cb(new Error('Только MP3, OGG, WAV, M4A'));
  }
});

app.get('/api/welcome_audio', (req, res) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('welcome_audio');
  res.json({ url: row ? row.value : '' });
});

app.post('/api/admin/welcome_audio', requireAdmin, audioUpload.single('audio'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
  const url = 'uploads/' + req.file.filename;
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('welcome_audio', url);
  res.json({ url });
});

app.delete('/api/admin/welcome_audio', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('welcome_audio');
  if (row && row.value) {
    const filePath = path.join(__dirname, row.value);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  db.prepare('DELETE FROM settings WHERE key = ?').run('welcome_audio');
  res.json({ success: true });
});

// ============ CHAT GUIDE ============

let chatConfig = {};
try {
  chatConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'chat_config.json'), 'utf8'));
} catch(e) {}

function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function upsertSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

function buildMuseumContext() {
  const sections = db.prepare('SELECT * FROM sections ORDER BY sort_order').all();
  const pages = db.prepare('SELECT p.*, s.title as section_title, s.slug as section_slug FROM pages p JOIN sections s ON p.section_id = s.id ORDER BY s.sort_order, p.sort_order').all();

  let ctx = 'РАЗДЕЛЫ МУЗЕЯ:\n';
  sections.forEach(s => {
    ctx += '- ' + s.title + ' (' + s.type + ')\n';
  });
  ctx += '\nСОДЕРЖИМОЕ:\n';
  pages.forEach(p => {
    ctx += '\n[' + p.section_title + '] ';
    if (p.name) ctx += p.name;
    else if (p.title) ctx += p.title;
    if (p.rank) ctx += ' — ' + p.rank;
    if (p.photo) ctx += ' | фото: ' + p.photo;
    if (p.bio) {
      const shortBio = p.bio.length > 600 ? p.bio.substring(0, 600) + '...' : p.bio;
      ctx += '\n' + shortBio;
    }
    ctx += '\n';
  });
  return ctx;
}

app.get('/api/chat/settings', (req, res) => {
  const greeting = getSetting('chat_greeting', 'Здравствуйте! Я виртуальный гид музея СВКИ. Задайте мне вопрос о музее, героях или истории института.');
  const quickRaw = getSetting('chat_quick_buttons', '');
  const idleVideo = getSetting('chat_idle_video', 'images/guide_idle.mp4');
  const talkingVideo = getSetting('chat_talking_video', 'images/guide_talking.mp4');

  let quickButtons = [];
  try { quickButtons = JSON.parse(quickRaw); } catch(e) {}

  res.json({
    greeting,
    quick_buttons: quickButtons,
    idle_video: idleVideo,
    talking_video: talkingVideo
  });
});

app.post('/api/chat', async (req, res) => {
  const { message, history } = req.body;
  if (!message) return res.status(400).json({ error: 'Сообщение не указано' });

  const apiKey = chatConfig.yandex_api_key;
  const folderId = chatConfig.yandex_folder_id;
  const model = chatConfig.yandex_gpt_model || 'yandexgpt-lite';

  if (!apiKey || apiKey === 'ВСТАВЬТЕ_КЛЮЧ_YANDEX_API') {
    return res.json({ reply: 'Чат-гид временно недоступен. API-ключ не настроен.' });
  }

  const museumData = buildMuseumContext();
  const systemPrompt = getSetting('chat_system_prompt',
    'Ты — виртуальный гид интерактивного музея Саратовского военного ордена Жукова Краснознамённого института войск национальной гвардии РФ (СВКИ).\n' +
    'Отвечай на вопросы посетителей, используя ТОЛЬКО информацию из данных музея ниже.\n' +
    'Если информации нет — скажи, что не располагаешь такими данными.\n' +
    'Отвечай кратко (до 3-4 предложений), дружелюбно, на русском языке.\n' +
    'Если спрашивают о герое — укажи имя, звание и краткую биографию.\n' +
    'Если спрашивают фото — вставь путь в формате [ФОТО:путь_к_файлу].\n'
  );

  const messages = [
    { role: 'system', text: systemPrompt + '\n\n== ДАННЫЕ МУЗЕЯ ==\n' + museumData }
  ];

  if (history && history.length) {
    history.forEach(m => {
      if (m.sender === 'user') messages.push({ role: 'user', text: m.text });
      else if (m.sender === 'bot') messages.push({ role: 'assistant', text: m.text });
    });
  }
  messages.push({ role: 'user', text: message });

  try {
    const response = await fetch('https://llm.api.cloud.yandex.net/foundationModels/v1/completion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Api-Key ' + apiKey,
        'x-folder-id': folderId
      },
      body: JSON.stringify({
        modelUri: 'gpt://' + folderId + '/' + model,
        completionOptions: { stream: false, temperature: 0.4, maxTokens: '1000' },
        messages
      })
    });

    const data = await response.json();
    if (data.result && data.result.alternatives && data.result.alternatives[0]) {
      res.json({ reply: data.result.alternatives[0].message.text });
    } else {
      res.json({ reply: 'Не удалось получить ответ. Попробуйте переформулировать вопрос.' });
    }
  } catch(e) {
    console.error('YandexGPT error:', e.message);
    res.json({ reply: 'Ошибка связи с сервисом. Попробуйте позже.' });
  }
});

app.post('/api/chat/tts', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Текст не указан' });

  const apiKey = chatConfig.yandex_api_key;
  const folderId = chatConfig.yandex_folder_id;
  const voice = chatConfig.yandex_tts_voice || 'filipp';

  if (!apiKey || apiKey === 'ВСТАВЬТЕ_КЛЮЧ_YANDEX_API') {
    return res.status(503).json({ error: 'TTS не настроен' });
  }

  try {
    const params = new URLSearchParams();
    params.append('text', text.substring(0, 1000));
    params.append('lang', 'ru-RU');
    params.append('voice', voice);
    params.append('format', 'mp3');
    params.append('folderId', folderId);

    const response = await fetch('https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize', {
      method: 'POST',
      headers: { 'Authorization': 'Api-Key ' + apiKey },
      body: params
    });

    if (!response.ok) throw new Error('TTS API ' + response.status);

    res.set('Content-Type', 'audio/mpeg');
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch(e) {
    console.error('TTS error:', e.message);
    res.status(503).json({ error: 'TTS ошибка' });
  }
});

// Admin: chat video upload
const chatVideoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, 'guide_' + req.params.type + '_' + Date.now() + ext);
    }
  }),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.mp4', '.webm', '.gif'].includes(ext)) cb(null, true);
    else cb(new Error('Только MP4, WebM, GIF'));
  }
});

app.get('/api/admin/chat_settings', requireAdmin, (req, res) => {
  res.json({
    greeting: getSetting('chat_greeting', ''),
    system_prompt: getSetting('chat_system_prompt', ''),
    quick_buttons: getSetting('chat_quick_buttons', '[]'),
    idle_video: getSetting('chat_idle_video', 'images/guide_idle.mp4'),
    talking_video: getSetting('chat_talking_video', 'images/guide_talking.mp4')
  });
});

app.put('/api/admin/chat_settings', requireAdmin, (req, res) => {
  const { greeting, system_prompt, quick_buttons, idle_video, talking_video } = req.body;
  if (greeting !== undefined) upsertSetting('chat_greeting', greeting);
  if (system_prompt !== undefined) upsertSetting('chat_system_prompt', system_prompt);
  if (quick_buttons !== undefined) upsertSetting('chat_quick_buttons', typeof quick_buttons === 'string' ? quick_buttons : JSON.stringify(quick_buttons));
  if (idle_video !== undefined) upsertSetting('chat_idle_video', idle_video);
  if (talking_video !== undefined) upsertSetting('chat_talking_video', talking_video);
  res.json({ success: true });
});

app.post('/api/admin/chat_video/:type', requireAdmin, chatVideoUpload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
  const type = req.params.type; // 'idle' or 'talking'
  const key = type === 'talking' ? 'chat_talking_video' : 'chat_idle_video';
  const url = 'uploads/' + req.file.filename;
  upsertSetting(key, url);
  res.json({ url });
});

// Serve admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`Музей СВКИ запущен на http://localhost:${PORT}`);
  console.log(`Админ-панель: http://localhost:${PORT}/admin`);
});
