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
    template TEXT DEFAULT 'default',
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
");

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
    $stmt = $db->prepare('INSERT INTO pages (section_id, title, name, rank, bio, photo, photo2, template, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([
        $sectionId,
        $body['title'] ?? '',
        $body['name'] ?? '',
        $body['rank'] ?? '',
        $body['bio'] ?? '',
        $body['photo'] ?? '',
        $body['photo2'] ?? '',
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
    $fields = ['title', 'name', 'rank', 'bio', 'photo', 'photo2', 'template', 'sort_order', 'section_id'];
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

// ============ CHAT GUIDE ============

function getSetting($db, $key, $fallback = '') {
    $stmt = $db->prepare('SELECT value FROM settings WHERE key = ?');
    $stmt->execute([$key]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ? $row['value'] : $fallback;
}

function upsertSetting($db, $key, $value) {
    $db->prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')->execute([$key, $value]);
}

function buildMuseumContext($db) {
    $sections = $db->query('SELECT * FROM sections ORDER BY sort_order')->fetchAll(PDO::FETCH_ASSOC);
    $pages = $db->query('SELECT p.*, s.title as section_title, s.slug as section_slug FROM pages p JOIN sections s ON p.section_id = s.id ORDER BY s.sort_order, p.sort_order')->fetchAll(PDO::FETCH_ASSOC);

    $ctx = "РАЗДЕЛЫ МУЗЕЯ:\n";
    foreach ($sections as $s) {
        $ctx .= '- ' . $s['title'] . ' (' . $s['type'] . ")\n";
    }
    $ctx .= "\nСОДЕРЖИМОЕ:\n";
    foreach ($pages as $p) {
        $ctx .= "\n[" . $p['section_title'] . '] ';
        if ($p['name']) $ctx .= $p['name'];
        elseif ($p['title']) $ctx .= $p['title'];
        if ($p['rank']) $ctx .= ' — ' . $p['rank'];
        if ($p['photo']) $ctx .= ' | фото: ' . $p['photo'];
        if ($p['bio']) {
            $shortBio = mb_strlen($p['bio']) > 600 ? mb_substr($p['bio'], 0, 600) . '...' : $p['bio'];
            $ctx .= "\n" . $shortBio;
        }
        $ctx .= "\n";
    }
    return $ctx;
}

if ($uri === '/api/chat/settings' && $method === 'GET') {
    $greeting = getSetting($db, 'chat_greeting', 'Здравствуйте! Я виртуальный гид музея СВКИ. Задайте мне вопрос о музее, героях или истории института.');
    $quickRaw = getSetting($db, 'chat_quick_buttons', '[]');
    $quickButtons = json_decode($quickRaw, true) ?: [];
    respond([
        'greeting' => $greeting,
        'quick_buttons' => $quickButtons,
        'idle_video' => getSetting($db, 'chat_idle_video', 'images/guide_idle.mp4'),
        'talking_video' => getSetting($db, 'chat_talking_video', 'images/guide_talking.mp4')
    ]);
}

if ($uri === '/api/chat' && $method === 'POST') {
    $body = jsonBody();
    $message = $body['message'] ?? '';
    if (!$message) respond(['error' => 'Сообщение не указано'], 400);

    $configPath = __DIR__ . '/chat_config.json';
    $config = [];
    if (file_exists($configPath)) {
        $config = json_decode(file_get_contents($configPath), true) ?: [];
    }

    $apiKey = $config['yandex_api_key'] ?? '';
    $folderId = $config['yandex_folder_id'] ?? '';
    $model = $config['yandex_gpt_model'] ?? 'yandexgpt-lite';

    if (!$apiKey || $apiKey === 'ВСТАВЬТЕ_КЛЮЧ_YANDEX_API') {
        respond(['reply' => 'Чат-гид временно недоступен. API-ключ не настроен.']);
    }

    $museumData = buildMuseumContext($db);
    $systemPrompt = getSetting($db, 'chat_system_prompt',
        "Ты — виртуальный гид интерактивного музея Саратовского военного ордена Жукова Краснознамённого института войск национальной гвардии РФ (СВКИ).\nОтвечай на вопросы посетителей, используя ТОЛЬКО информацию из данных музея ниже.\nЕсли информации нет — скажи, что не располагаешь такими данными.\nОтвечай кратко (до 3-4 предложений), дружелюбно, на русском языке.\nЕсли спрашивают о герое — укажи имя, звание и краткую биографию.\nЕсли спрашивают фото — вставь путь в формате [ФОТО:путь_к_файлу].\n"
    );

    $messages = [
        ['role' => 'system', 'text' => $systemPrompt . "\n\n== ДАННЫЕ МУЗЕЯ ==\n" . $museumData]
    ];

    $history = $body['history'] ?? [];
    foreach ($history as $m) {
        if (($m['sender'] ?? '') === 'user') $messages[] = ['role' => 'user', 'text' => $m['text']];
        elseif (($m['sender'] ?? '') === 'bot') $messages[] = ['role' => 'assistant', 'text' => $m['text']];
    }
    $messages[] = ['role' => 'user', 'text' => $message];

    $payload = json_encode([
        'modelUri' => 'gpt://' . $folderId . '/' . $model,
        'completionOptions' => ['stream' => false, 'temperature' => 0.4, 'maxTokens' => '1000'],
        'messages' => $messages
    ]);

    $ch = curl_init('https://llm.api.cloud.yandex.net/foundationModels/v1/completion');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Api-Key ' . $apiKey,
            'x-folder-id: ' . $folderId
        ],
        CURLOPT_TIMEOUT => 30
    ]);
    $result = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);

    if ($err) {
        respond(['reply' => 'Ошибка связи с сервисом. Попробуйте позже.']);
    }

    $data = json_decode($result, true);
    if (isset($data['result']['alternatives'][0]['message']['text'])) {
        respond(['reply' => $data['result']['alternatives'][0]['message']['text']]);
    } else {
        respond(['reply' => 'Не удалось получить ответ. Попробуйте переформулировать вопрос.']);
    }
}

if ($uri === '/api/chat/tts' && $method === 'POST') {
    $body = jsonBody();
    $text = $body['text'] ?? '';
    if (!$text) respond(['error' => 'Текст не указан'], 400);

    $configPath = __DIR__ . '/chat_config.json';
    $config = [];
    if (file_exists($configPath)) {
        $config = json_decode(file_get_contents($configPath), true) ?: [];
    }

    $apiKey = $config['yandex_api_key'] ?? '';
    $folderId = $config['yandex_folder_id'] ?? '';
    $voice = $config['yandex_tts_voice'] ?? 'filipp';

    if (!$apiKey || $apiKey === 'ВСТАВЬТЕ_КЛЮЧ_YANDEX_API') {
        respond(['error' => 'TTS не настроен'], 503);
    }

    $postData = http_build_query([
        'text' => mb_substr($text, 0, 1000),
        'lang' => 'ru-RU',
        'voice' => $voice,
        'format' => 'mp3',
        'folderId' => $folderId
    ]);

    $ch = curl_init('https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $postData,
        CURLOPT_HTTPHEADER => ['Authorization: Api-Key ' . $apiKey],
        CURLOPT_TIMEOUT => 15
    ]);
    $audioData = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200 || !$audioData) {
        respond(['error' => 'TTS ошибка'], 503);
    }

    header('Content-Type: audio/mpeg');
    header('Content-Length: ' . strlen($audioData));
    echo $audioData;
    exit;
}

// Admin chat settings
if ($uri === '/api/admin/chat_settings' && $method === 'GET') {
    requireAdmin();
    respond([
        'greeting' => getSetting($db, 'chat_greeting', ''),
        'system_prompt' => getSetting($db, 'chat_system_prompt', ''),
        'quick_buttons' => getSetting($db, 'chat_quick_buttons', '[]'),
        'idle_video' => getSetting($db, 'chat_idle_video', 'images/guide_idle.mp4'),
        'talking_video' => getSetting($db, 'chat_talking_video', 'images/guide_talking.mp4')
    ]);
}

if ($uri === '/api/admin/chat_settings' && $method === 'PUT') {
    requireAdmin();
    $body = jsonBody();
    if (isset($body['greeting'])) upsertSetting($db, 'chat_greeting', $body['greeting']);
    if (isset($body['system_prompt'])) upsertSetting($db, 'chat_system_prompt', $body['system_prompt']);
    if (isset($body['quick_buttons'])) {
        $val = is_string($body['quick_buttons']) ? $body['quick_buttons'] : json_encode($body['quick_buttons']);
        upsertSetting($db, 'chat_quick_buttons', $val);
    }
    if (isset($body['idle_video'])) upsertSetting($db, 'chat_idle_video', $body['idle_video']);
    if (isset($body['talking_video'])) upsertSetting($db, 'chat_talking_video', $body['talking_video']);
    respond(['success' => true]);
}

if (preg_match('#^/api/admin/chat_video/(idle|talking)$#', $uri, $m) && $method === 'POST') {
    requireAdmin();
    if (empty($_FILES['video'])) respond(['error' => 'Файл не загружен'], 400);
    $file = $_FILES['video'];
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, ['mp4', 'webm', 'gif'])) respond(['error' => 'Только MP4, WebM, GIF'], 400);
    $type = $m[1];
    $newName = 'guide_' . $type . '_' . time() . '.' . $ext;
    $dest = __DIR__ . '/uploads/' . $newName;
    if (move_uploaded_file($file['tmp_name'], $dest)) {
        $key = $type === 'talking' ? 'chat_talking_video' : 'chat_idle_video';
        $url = 'uploads/' . $newName;
        upsertSetting($db, $key, $url);
        respond(['url' => $url]);
    } else {
        respond(['error' => 'Ошибка загрузки'], 500);
    }
}

// Not found
http_response_code(404);
echo json_encode(['error' => 'Not found']);
