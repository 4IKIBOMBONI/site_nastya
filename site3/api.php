<?php
session_start();
header('Content-Type: application/json; charset=utf-8');

// Init DB
$dbPath = __DIR__ . '/data/museum.db';
if (!is_dir(__DIR__ . '/data')) mkdir(__DIR__ . '/data', 0755, true);
if (!is_dir(__DIR__ . '/uploads')) mkdir(__DIR__ . '/uploads', 0755, true);

$db = new PDO('sqlite:' . $dbPath);
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->exec("PRAGMA journal_mode = WAL");
$db->exec("PRAGMA foreign_keys = ON");

$db->exec("
  CREATE TABLE IF NOT EXISTS sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'book',
    parent_id INTEGER REFERENCES sections(id) ON DELETE CASCADE,
    icon TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    title TEXT DEFAULT '',
    name TEXT DEFAULT '',
    rank TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    photo TEXT DEFAULT '',
    photo2 TEXT DEFAULT '',
    photos TEXT DEFAULT '',
    template TEXT DEFAULT 'default',
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
");

// Migration: add photos column for existing databases
try {
    $db->query("SELECT photos FROM pages LIMIT 1");
} catch (Exception $e) {
    $db->exec("ALTER TABLE pages ADD COLUMN photos TEXT DEFAULT ''");
}

$stmt = $db->prepare('SELECT value FROM settings WHERE key = ?');
$stmt->execute(['admin_password']);
if (!$stmt->fetch()) {
    $db->prepare('INSERT INTO settings (key, value) VALUES (?, ?)')->execute(['admin_password', 'admin2024']);
}

// Parse route
$method = $_SERVER['REQUEST_METHOD'];
$uri = $_SERVER['REQUEST_URI'];
$uri = parse_url($uri, PHP_URL_PATH);
$uri = rtrim($uri, '/');

// Remove base path if needed
$basePath = '';
if (strpos($uri, '/api') === 0 || strpos($uri, '/api') !== false) {
    $pos = strpos($uri, '/api');
    $basePath = substr($uri, 0, $pos);
    $uri = substr($uri, $pos);
}

function jsonBody() {
    return json_decode(file_get_contents('php://input'), true) ?: [];
}

function requireAdmin() {
    if (empty($_SESSION['isAdmin'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }
}

function respond($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

// ============ PUBLIC API ============

if ($uri === '/api/sections' && $method === 'GET') {
    $stmt = $db->prepare('SELECT * FROM sections WHERE parent_id IS NULL ORDER BY sort_order');
    $stmt->execute();
    respond($stmt->fetchAll(PDO::FETCH_ASSOC));
}

if ($uri === '/api/welcome_audio' && $method === 'GET') {
    $stmt = $db->prepare('SELECT value FROM settings WHERE key = ?');
    $stmt->execute(['welcome_audio']);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    respond(['url' => $row ? $row['value'] : '']);
}

if (preg_match('#^/api/sections/([^/]+)/pages$#', $uri, $m) && $method === 'GET') {
    $slug = $m[1];
    $stmt = $db->prepare('SELECT id FROM sections WHERE slug = ?');
    $stmt->execute([$slug]);
    $section = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$section) respond(['error' => 'Not found'], 404);
    $stmt = $db->prepare('SELECT * FROM pages WHERE section_id = ? ORDER BY sort_order');
    $stmt->execute([$section['id']]);
    respond($stmt->fetchAll(PDO::FETCH_ASSOC));
}

if (preg_match('#^/api/sections/([^/]+)$#', $uri, $m) && $method === 'GET') {
    $slug = $m[1];
    $stmt = $db->prepare('SELECT * FROM sections WHERE slug = ?');
    $stmt->execute([$slug]);
    $section = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$section) respond(['error' => 'Not found'], 404);

    $stmt = $db->prepare('SELECT * FROM sections WHERE parent_id = ? ORDER BY sort_order');
    $stmt->execute([$section['id']]);
    $children = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $stmt = $db->prepare('SELECT * FROM pages WHERE section_id = ? ORDER BY sort_order');
    $stmt->execute([$section['id']]);
    $pages = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $section['children'] = $children;
    $section['pages'] = $pages;
    respond($section);
}

// ============ ADMIN API ============

if ($uri === '/api/admin/login' && $method === 'POST') {
    $body = jsonBody();
    $password = $body['password'] ?? '';
    $stmt = $db->prepare('SELECT value FROM settings WHERE key = ?');
    $stmt->execute(['admin_password']);
    $stored = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($stored && $password === $stored['value']) {
        $_SESSION['isAdmin'] = true;
        respond(['success' => true]);
    } else {
        respond(['error' => 'Неверный пароль'], 401);
    }
}

if ($uri === '/api/admin/logout' && $method === 'POST') {
    session_destroy();
    respond(['success' => true]);
}

if ($uri === '/api/admin/check' && $method === 'GET') {
    respond(['isAdmin' => !empty($_SESSION['isAdmin'])]);
}

if ($uri === '/api/admin/password' && $method === 'POST') {
    requireAdmin();
    $body = jsonBody();
    $newPassword = $body['newPassword'] ?? '';
    if (strlen($newPassword) < 4) respond(['error' => 'Пароль слишком короткий'], 400);
    $db->prepare('UPDATE settings SET value = ? WHERE key = ?')->execute([$newPassword, 'admin_password']);
    respond(['success' => true]);
}

// ---- Sections CRUD ----
if ($uri === '/api/admin/sections' && $method === 'GET') {
    requireAdmin();
    $stmt = $db->prepare('SELECT * FROM sections ORDER BY sort_order');
    $stmt->execute();
    respond($stmt->fetchAll(PDO::FETCH_ASSOC));
}

if ($uri === '/api/admin/sections' && $method === 'POST') {
    requireAdmin();
    $body = jsonBody();
    $slug = $body['slug'] ?? '';
    $title = $body['title'] ?? '';
    if (!$slug || !$title) respond(['error' => 'Необходимо указать идентификатор и название'], 400);
    try {
        $stmt = $db->prepare('INSERT INTO sections (slug, title, type, parent_id, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $slug, $title,
            $body['type'] ?? 'book',
            $body['parent_id'] ?? null,
            $body['icon'] ?? '',
            $body['sort_order'] ?? 0
        ]);
        respond(['id' => $db->lastInsertId()]);
    } catch (Exception $e) {
        respond(['error' => $e->getMessage()], 400);
    }
}

if (preg_match('#^/api/admin/sections/reorder$#', $uri) && $method === 'POST') {
    requireAdmin();
    $body = jsonBody();
    $orders = $body['orders'] ?? [];
    $stmt = $db->prepare('UPDATE sections SET sort_order = ? WHERE id = ?');
    foreach ($orders as $item) {
        $stmt->execute([$item['sort_order'], $item['id']]);
    }
    respond(['success' => true]);
}

if (preg_match('#^/api/admin/sections/(\d+)$#', $uri, $m) && $method === 'PUT') {
    requireAdmin();
    $id = $m[1];
    $body = jsonBody();
    $fields = ['title', 'type', 'icon', 'sort_order', 'slug'];
    $updates = [];
    $params = [];
    foreach ($fields as $f) {
        if (isset($body[$f])) {
            $updates[] = "$f = ?";
            $params[] = $body[$f];
        }
    }
    if (empty($updates)) respond(['error' => 'Nothing to update'], 400);
    $params[] = $id;
    $db->prepare('UPDATE sections SET ' . implode(', ', $updates) . ' WHERE id = ?')->execute($params);
    respond(['success' => true]);
}

if (preg_match('#^/api/admin/sections/(\d+)$#', $uri, $m) && $method === 'DELETE') {
    requireAdmin();
    $db->prepare('DELETE FROM sections WHERE id = ?')->execute([$m[1]]);
    respond(['success' => true]);
}

// ---- Pages CRUD ----
if ($uri === '/api/admin/pages' && $method === 'GET') {
    requireAdmin();
    $sectionId = $_GET['section_id'] ?? null;
    if ($sectionId) {
        $stmt = $db->prepare('SELECT * FROM pages WHERE section_id = ? ORDER BY sort_order');
        $stmt->execute([$sectionId]);
    } else {
        $stmt = $db->prepare('SELECT * FROM pages ORDER BY section_id, sort_order');
        $stmt->execute();
    }
    respond($stmt->fetchAll(PDO::FETCH_ASSOC));
}

if ($uri === '/api/admin/pages' && $method === 'POST') {
    requireAdmin();
    $body = jsonBody();
    $sectionId = $body['section_id'] ?? null;
    if (!$sectionId) respond(['error' => 'section_id required'], 400);
    $photosVal = $body['photos'] ?? '';
    if (is_array($photosVal)) $photosVal = json_encode($photosVal, JSON_UNESCAPED_UNICODE);
    $stmt = $db->prepare('INSERT INTO pages (section_id, title, name, rank, bio, photo, photo2, photos, template, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([
        $sectionId,
        $body['title'] ?? '',
        $body['name'] ?? '',
        $body['rank'] ?? '',
        $body['bio'] ?? '',
        $body['photo'] ?? '',
        $body['photo2'] ?? '',
        $photosVal,
        $body['template'] ?? 'default',
        $body['sort_order'] ?? 0
    ]);
    respond(['id' => $db->lastInsertId()]);
}

if (preg_match('#^/api/admin/pages/reorder$#', $uri) && $method === 'POST') {
    requireAdmin();
    $body = jsonBody();
    $orders = $body['orders'] ?? [];
    $stmt = $db->prepare('UPDATE pages SET sort_order = ? WHERE id = ?');
    foreach ($orders as $item) {
        $stmt->execute([$item['sort_order'], $item['id']]);
    }
    respond(['success' => true]);
}

if (preg_match('#^/api/admin/pages/(\d+)$#', $uri, $m) && $method === 'PUT') {
    requireAdmin();
    $id = $m[1];
    $body = jsonBody();
    $fields = ['title', 'name', 'rank', 'bio', 'photo', 'photo2', 'photos', 'template', 'sort_order', 'section_id'];
    $updates = [];
    $params = [];
    foreach ($fields as $f) {
        if (isset($body[$f])) {
            $updates[] = "$f = ?";
            $val = $body[$f];
            if ($f === 'photos' && is_array($val)) $val = json_encode($val, JSON_UNESCAPED_UNICODE);
            $params[] = $val;
        }
    }
    if (empty($updates)) respond(['error' => 'Nothing to update'], 400);
    $params[] = $id;
    $db->prepare('UPDATE pages SET ' . implode(', ', $updates) . ' WHERE id = ?')->execute($params);
    respond(['success' => true]);
}

if (preg_match('#^/api/admin/pages/(\d+)$#', $uri, $m) && $method === 'DELETE') {
    requireAdmin();
    $db->prepare('DELETE FROM pages WHERE id = ?')->execute([$m[1]]);
    respond(['success' => true]);
}

// ---- File upload ----
if ($uri === '/api/admin/upload' && $method === 'POST') {
    requireAdmin();
    if (empty($_FILES['photo'])) respond(['error' => 'No file'], 400);
    $file = $_FILES['photo'];
    $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
    $newName = time() . '-' . bin2hex(random_bytes(5)) . '.' . $ext;
    $dest = __DIR__ . '/uploads/' . $newName;
    if (move_uploaded_file($file['tmp_name'], $dest)) {
        respond(['url' => 'uploads/' . $newName]);
    } else {
        respond(['error' => 'Upload failed'], 500);
    }
}

// ---- Welcome audio ----
if ($uri === '/api/admin/welcome_audio' && $method === 'GET') {
    requireAdmin();
    $stmt = $db->prepare('SELECT value FROM settings WHERE key = ?');
    $stmt->execute(['welcome_audio']);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    respond(['url' => $row ? $row['value'] : '']);
}

if ($uri === '/api/admin/welcome_audio' && $method === 'POST') {
    requireAdmin();
    if (empty($_FILES['audio'])) respond(['error' => 'Файл не загружен'], 400);
    $file = $_FILES['audio'];
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, ['mp3', 'ogg', 'wav', 'm4a'])) {
        respond(['error' => 'Только MP3, OGG, WAV, M4A'], 400);
    }
    $newName = 'welcome_audio_' . time() . '.' . $ext;
    $dest = __DIR__ . '/uploads/' . $newName;
    if (move_uploaded_file($file['tmp_name'], $dest)) {
        $url = 'uploads/' . $newName;
        $db->prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')->execute(['welcome_audio', $url]);
        respond(['url' => $url]);
    } else {
        respond(['error' => 'Ошибка загрузки'], 500);
    }
}

if ($uri === '/api/admin/welcome_audio' && $method === 'DELETE') {
    requireAdmin();
    $db->prepare('DELETE FROM settings WHERE key = ?')->execute(['welcome_audio']);
    respond(['success' => true]);
}

// ---- Emblem video ----
if ($uri === '/api/emblem_video' && $method === 'GET') {
    $stmt = $db->prepare('SELECT value FROM settings WHERE key = ?');
    $stmt->execute(['emblem_video']);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    respond(['url' => $row ? $row['value'] : '']);
}

if ($uri === '/api/admin/emblem_video' && $method === 'POST') {
    requireAdmin();
    if (empty($_FILES['video'])) respond(['error' => 'Файл не загружен'], 400);
    $file = $_FILES['video'];
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, ['mp4', 'webm', 'mov', 'm4v', 'ogg'])) {
        respond(['error' => 'Только MP4, WebM, MOV, M4V, OGG'], 400);
    }
    $newName = 'emblem_video_' . time() . '.' . $ext;
    $dest = __DIR__ . '/uploads/' . $newName;
    if (move_uploaded_file($file['tmp_name'], $dest)) {
        $url = 'uploads/' . $newName;
        $db->prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')->execute(['emblem_video', $url]);
        respond(['url' => $url]);
    } else {
        respond(['error' => 'Ошибка загрузки'], 500);
    }
}

if ($uri === '/api/admin/emblem_video' && $method === 'DELETE') {
    requireAdmin();
    $stmt = $db->prepare('SELECT value FROM settings WHERE key = ?');
    $stmt->execute(['emblem_video']);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row && $row['value']) {
        $filePath = __DIR__ . '/' . $row['value'];
        if (file_exists($filePath)) @unlink($filePath);
    }
    $db->prepare('DELETE FROM settings WHERE key = ?')->execute(['emblem_video']);
    respond(['success' => true]);
}

// Not found
http_response_code(404);
echo json_encode(['error' => 'Not found']);
