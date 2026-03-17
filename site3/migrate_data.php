<?php
/**
 * Migration script: reads data_heroes_ussr.js and populates SQLite museum.db
 * Safe to run from browser.
 */

header('Content-Type: text/html; charset=utf-8');
echo "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Migration</title></head><body><pre>\n";

$dbPath = __DIR__ . '/data/museum.db';
$jsPath = __DIR__ . '/data_heroes_ussr.js';

// --- Read JS file ---
$jsContent = file_get_contents($jsPath);
if ($jsContent === false) {
    die("ERROR: Cannot read $jsPath\n");
}
echo "Read JS file: " . strlen($jsContent) . " bytes\n";

// --- Parse JS arrays ---

/**
 * Extract a JS array by variable name from the JS source.
 * Returns an array of associative arrays with the parsed fields.
 */
function parseJsArray($jsContent, $varName) {
    // Match: const VARNAME = [ ... ];
    // We need to find the array bounds carefully because of nested content.
    $pattern = '/(?:const|let|var)\s+' . preg_quote($varName, '/') . '\s*=\s*\[/s';
    if (!preg_match($pattern, $jsContent, $m, PREG_OFFSET_CAPTURE)) {
        echo "  WARNING: Array $varName not found\n";
        return [];
    }

    $startPos = $m[0][1] + strlen($m[0][0]);

    // Find matching closing bracket, accounting for nested brackets
    $depth = 1;
    $len = strlen($jsContent);
    $pos = $startPos;
    while ($pos < $len && $depth > 0) {
        $ch = $jsContent[$pos];
        if ($ch === '[') $depth++;
        elseif ($ch === ']') $depth--;
        // Skip strings
        elseif ($ch === "'" || $ch === '"' || $ch === '`') {
            $quote = $ch;
            $pos++;
            while ($pos < $len) {
                if ($jsContent[$pos] === '\\') { $pos += 2; continue; }
                if ($jsContent[$pos] === $quote) break;
                $pos++;
            }
        }
        $pos++;
    }

    $arrayContent = substr($jsContent, $startPos, $pos - $startPos - 1);

    // Now split into individual objects { ... }
    $objects = [];
    $objPattern = '/\{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}/s';
    if (!preg_match_all($objPattern, $arrayContent, $objMatches)) {
        return [];
    }

    foreach ($objMatches[1] as $objBody) {
        $obj = parseJsObject($objBody);
        if (!empty($obj)) {
            $objects[] = $obj;
        }
    }

    return $objects;
}

/**
 * Parse fields from a JS object body string.
 * Handles: name: 'value', name: "value", name: `value`
 * Handles multiline values with template literals and string concatenation.
 */
function parseJsObject($body) {
    $result = [];
    $fields = ['name', 'photo', 'photo2', 'rank', 'bio', 'title'];

    foreach ($fields as $field) {
        // Try to find field: followed by a string value
        // Pattern: field: 'value' or field: "value" or field: `value`
        // Also handle field: 'val1' + 'val2' concatenation
        $pattern = '/' . preg_quote($field, '/') . '\s*:\s*/s';
        if (!preg_match($pattern, $body, $m, PREG_OFFSET_CAPTURE)) {
            continue;
        }

        $valueStart = $m[0][1] + strlen($m[0][0]);
        $value = extractJsStringValue($body, $valueStart);
        if ($value !== null) {
            $result[$field] = $value;
        }
    }

    return $result;
}

/**
 * Extract a JS string value starting at position $pos in $str.
 * Handles concatenation with +, single/double/backtick quotes.
 * Returns the final string value.
 */
function extractJsStringValue($str, $pos) {
    $len = strlen($str);
    $fullValue = '';

    while ($pos < $len) {
        // Skip whitespace
        while ($pos < $len && ctype_space($str[$pos])) $pos++;
        if ($pos >= $len) break;

        $ch = $str[$pos];

        if ($ch === "'" || $ch === '"' || $ch === '`') {
            $quote = $ch;
            $pos++;
            $segment = '';
            while ($pos < $len) {
                if ($str[$pos] === '\\' && $pos + 1 < $len) {
                    $next = $str[$pos + 1];
                    if ($next === 'n') { $segment .= "\n"; $pos += 2; continue; }
                    elseif ($next === 't') { $segment .= "\t"; $pos += 2; continue; }
                    elseif ($next === '\\') { $segment .= "\\"; $pos += 2; continue; }
                    elseif ($next === "'") { $segment .= "'"; $pos += 2; continue; }
                    elseif ($next === '"') { $segment .= '"'; $pos += 2; continue; }
                    elseif ($next === '`') { $segment .= '`'; $pos += 2; continue; }
                    else { $segment .= $next; $pos += 2; continue; }
                }
                if ($str[$pos] === $quote) {
                    $pos++;
                    break;
                }
                $segment .= $str[$pos];
                $pos++;
            }
            $fullValue .= $segment;

            // Check for concatenation with +
            $tmpPos = $pos;
            while ($tmpPos < $len && ctype_space($str[$tmpPos])) $tmpPos++;
            if ($tmpPos < $len && $str[$tmpPos] === '+') {
                $pos = $tmpPos + 1;
                continue; // next segment
            }
            break;
        } else {
            // Not a string literal - could be a number or variable, skip
            break;
        }
    }

    return $fullValue !== '' ? $fullValue : null;
}

// Parse all arrays
echo "\nParsing JS arrays...\n";

$heroesUssr = parseJsArray($jsContent, 'HEROES_USSR');
echo "  HEROES_USSR: " . count($heroesUssr) . " entries\n";

$heroesSocLabor = parseJsArray($jsContent, 'HEROES_SOC_LABOR');
echo "  HEROES_SOC_LABOR: " . count($heroesSocLabor) . " entries\n";

$heroesRussia = parseJsArray($jsContent, 'HEROES_RUSSIA');
echo "  HEROES_RUSSIA: " . count($heroesRussia) . " entries\n";

$postwarPages = parseJsArray($jsContent, 'POSTWAR_PAGES');
echo "  POSTWAR_PAGES: " . count($postwarPages) . " entries\n";

$warPages = parseJsArray($jsContent, 'WAR_PAGES');
echo "  WAR_PAGES: " . count($warPages) . " entries\n";

$creationPages = parseJsArray($jsContent, 'CREATION_PAGES');
echo "  CREATION_PAGES: " . count($creationPages) . " entries\n";

$conflictsPages = parseJsArray($jsContent, 'CONFLICTS_PAGES');
echo "  CONFLICTS_PAGES: " . count($conflictsPages) . " entries\n";

$modernPages = parseJsArray($jsContent, 'MODERN_PAGES');
echo "  MODERN_PAGES: " . count($modernPages) . " entries\n";

// --- Database operations ---
echo "\nOpening database: $dbPath\n";

$db = new PDO('sqlite:' . $dbPath);
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->exec('PRAGMA journal_mode=WAL');
$db->exec('PRAGMA foreign_keys=ON');

// Ensure tables exist
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

// Clear existing data
echo "Clearing existing data...\n";
$db->exec('DELETE FROM pages');
$db->exec('DELETE FROM sections');
echo "  Done.\n";

// Helper functions
function insertSection($db, $slug, $title, $type, $parentId, $icon, $sortOrder) {
    $stmt = $db->prepare('INSERT INTO sections (slug, title, type, parent_id, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
    $stmt->execute([$slug, $title, $type, $parentId, $icon, $sortOrder]);
    return $db->lastInsertId();
}

function insertPage($db, $sectionId, $title, $name, $rank, $bio, $photo, $photo2, $template, $sortOrder) {
    $stmt = $db->prepare('INSERT INTO pages (section_id, title, name, rank, bio, photo, photo2, template, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([$sectionId, $title, $name, $rank, $bio, $photo, $photo2, $template, $sortOrder]);
    return $db->lastInsertId();
}

function insertHeroPages($db, $sectionId, $heroes) {
    foreach ($heroes as $index => $h) {
        $name = $h['name'] ?? '';
        $photo = $h['photo'] ?? '';
        $rank = $h['rank'] ?? '';
        $bio = $h['bio'] ?? '';
        insertPage($db, $sectionId, '', $name, $rank, $bio, $photo, '', 'default', $index);
    }
}

function insertHistoryPages($db, $sectionId, $pages) {
    foreach ($pages as $index => $p) {
        $title = $p['title'] ?? '';
        $photo = $p['photo'] ?? '';
        $bio = $p['bio'] ?? '';
        insertPage($db, $sectionId, $title, '', '', $bio, $photo, '', 'default', $index);
    }
}

// --- Insert all data ---
echo "\nInserting data...\n";

$db->exec('BEGIN TRANSACTION');

try {
    // 1. ГЕРОИ (combined gallery with sub-tabs)
    echo "  1. Герои...\n";
    $heroesId = insertSection($db, 'heroes', 'Герои', 'hero_gallery', null, 'images/hero_ussr.png', 1);

    $ussrId = insertSection($db, 'heroes_ussr', 'Герои Советского Союза', 'gallery', $heroesId, '', 1);
    insertHeroPages($db, $ussrId, $heroesUssr);
    echo "    heroes_ussr: " . count($heroesUssr) . " pages\n";

    $socId = insertSection($db, 'heroes_soc', 'Герои Социалистического Труда', 'gallery', $heroesId, '', 2);
    insertHeroPages($db, $socId, $heroesSocLabor);
    echo "    heroes_soc: " . count($heroesSocLabor) . " pages\n";

    $russiaId = insertSection($db, 'heroes_russia', 'Герои Российской Федерации', 'gallery', $heroesId, '', 3);
    insertHeroPages($db, $russiaId, $heroesRussia);
    echo "    heroes_russia: " . count($heroesRussia) . " pages\n";

    // 2. ГЕНЕРАЛЫ
    echo "  2. Генералы...\n";
    $generalsId = insertSection($db, 'generals', 'Генералы', 'gallery', null, '', 2);

    // Генерал Романов
    insertPage($db, $generalsId, '', 'Романов Анатолий Александрович', 'Генерал-полковник',
        'Романов Анатолий Александрович — генерал-полковник, Герой Российской Федерации. Выпускник Саратовского высшего военного командного училища внутренних войск МВД СССР (1972). В октябре 1995 года, будучи командующим Объединённой группировкой федеральных войск в Чечне, был тяжело ранен в результате покушения в Грозном. Награждён орденом «За заслуги перед Отечеством» 2-й степени, орденом Мужества, медалью «За отвагу».',
        'images/generals/romanov.svg', '', 'default', 0);

    // 4 placeholder generals
    for ($i = 1; $i <= 4; $i++) {
        insertPage($db, $generalsId, '', 'Генерал-выпускник СВКИ', 'Генерал',
            'Информация будет добавлена.',
            'images/generals/silhouette.svg', '', 'default', $i);
    }
    echo "    5 pages (1 Romanov + 4 placeholders)\n";

    // 3. ИСТОРИЯ ИНСТИТУТА
    echo "  3. История института...\n";
    $historyId = insertSection($db, 'history', 'История института', 'group', null, '', 3);

    $creationId = insertSection($db, 'creation', 'Создание и становление (1932–1941)', 'book', $historyId, '', 1);
    insertHistoryPages($db, $creationId, $creationPages);
    echo "    creation: " . count($creationPages) . " pages\n";

    $postwarId = insertSection($db, 'postwar', 'Послевоенный период (1945–1991)', 'book', $historyId, '', 2);
    insertHistoryPages($db, $postwarId, $postwarPages);
    echo "    postwar: " . count($postwarPages) . " pages\n";

    $conflictsId = insertSection($db, 'conflicts', 'Участие в конфликтах (конец 1980-х – начало 1990-х)', 'book', $historyId, '', 3);
    insertHistoryPages($db, $conflictsId, $conflictsPages);
    echo "    conflicts: " . count($conflictsPages) . " pages\n";

    $modernId = insertSection($db, 'modern', 'Современный этап (1992 – настоящее время)', 'book', $historyId, '', 4);
    insertHistoryPages($db, $modernId, $modernPages);
    echo "    modern: " . count($modernPages) . " pages\n";

    // 4. УЧАСТИЕ В ВОВ
    echo "  4. Участие в ВОВ...\n";
    $warId = insertSection($db, 'war_years', 'Участие в Великой Отечественной войне (1941–1945)', 'book', null, '', 4);
    insertHistoryPages($db, $warId, $warPages);
    echo "    war_years: " . count($warPages) . " pages\n";

    // 5. ИНСТИТУТ РОСГВАРДИИ СЕГОДНЯ
    echo "  5. Институт Росгвардии сегодня...\n";
    $todayId = insertSection($db, 'today', 'Институт Росгвардии сегодня', 'group', null, '', 5);

    $eduId = insertSection($db, 'education', 'Образование', 'book', $todayId, '', 1);
    insertPage($db, $eduId, 'Образование', '', '', 'Информация об образовательной деятельности...', 'images/generals/silhouette.svg', '', 'default', 0);

    $scienceId = insertSection($db, 'science', 'Наука', 'book', $todayId, '', 2);
    insertPage($db, $scienceId, 'Наука', '', '', 'Информация о научной деятельности...', 'images/generals/silhouette.svg', '', 'default', 0);

    $sportId = insertSection($db, 'sport', 'Спорт', 'book', $todayId, '', 3);
    insertPage($db, $sportId, 'Спорт', '', '', 'Информация о спортивной деятельности...', 'images/generals/silhouette.svg', '', 'default', 0);

    $baseId = insertSection($db, 'material_base', 'Материально-техническая база', 'book', $todayId, '', 4);
    insertPage($db, $baseId, 'Материально-техническая база', '', '', 'Информация о материально-технической базе...', 'images/generals/silhouette.svg', '', 'default', 0);
    echo "    4 sub-sections with 1 page each\n";

    $db->exec('COMMIT');
    echo "\n=== MIGRATION COMPLETE ===\n";

    // Summary
    $totalSections = $db->query('SELECT COUNT(*) FROM sections')->fetchColumn();
    $totalPages = $db->query('SELECT COUNT(*) FROM pages')->fetchColumn();
    echo "Total sections: $totalSections\n";
    echo "Total pages: $totalPages\n";

} catch (Exception $e) {
    $db->exec('ROLLBACK');
    echo "\nERROR: " . $e->getMessage() . "\n";
    echo "Migration rolled back.\n";
}
echo "</pre></body></html>\n";
