const vm = require('vm');
const fs = require('fs');
const path = require('path');
const db = require('./database');

// Read existing data file - replace const with var so they leak into sandbox
let dataCode = fs.readFileSync(path.join(__dirname, 'data_heroes_ussr.js'), 'utf8');
dataCode = dataCode.replace(/^const /gm, 'var ');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(dataCode, sandbox);

const {
  HEROES_USSR, HEROES_SOC_LABOR, HEROES_RUSSIA,
  POSTWAR_PAGES, WAR_PAGES, CREATION_PAGES,
  CONFLICTS_PAGES, MODERN_PAGES
} = sandbox;

console.log('Начинаем миграцию данных...');

// Clear existing data
db.exec('DELETE FROM pages; DELETE FROM sections;');

const insertSection = db.prepare(
  'INSERT INTO sections (slug, title, type, parent_id, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
);
const insertPage = db.prepare(
  'INSERT INTO pages (section_id, title, name, rank, bio, photo, photo2, template, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
);

const tx = db.transaction(() => {
  // 1. ГЕРОИ (combined gallery with sub-tabs)
  const heroesId = insertSection.run('heroes', 'Герои', 'hero_gallery', null, 'images/hero_ussr.png', 1).lastInsertRowid;

  const ussrId = insertSection.run('heroes_ussr', 'Герои Советского Союза', 'gallery', heroesId, '', 1).lastInsertRowid;
  HEROES_USSR.forEach((h, i) => {
    insertPage.run(ussrId, '', h.name, h.rank, h.bio, h.photo, '', 'default', i);
  });

  const socId = insertSection.run('heroes_soc', 'Герои Социалистического Труда', 'gallery', heroesId, '', 2).lastInsertRowid;
  HEROES_SOC_LABOR.forEach((h, i) => {
    insertPage.run(socId, '', h.name, h.rank, h.bio, h.photo, '', 'default', i);
  });

  const russiaId = insertSection.run('heroes_russia', 'Герои Российской Федерации', 'gallery', heroesId, '', 3).lastInsertRowid;
  HEROES_RUSSIA.forEach((h, i) => {
    insertPage.run(russiaId, '', h.name, h.rank, h.bio, h.photo, '', 'default', i);
  });

  // 2. ГЕНЕРАЛЫ
  const generalsId = insertSection.run('generals', 'Генералы', 'gallery', null, '', 2).lastInsertRowid;

  // Генерал Романов
  insertPage.run(generalsId, '', 'Романов Анатолий Александрович', 'Генерал-полковник',
    'Романов Анатолий Александрович — генерал-полковник, Герой Российской Федерации. Выпускник Саратовского высшего военного командного училища внутренних войск МВД СССР (1972). В октябре 1995 года, будучи командующим Объединённой группировкой федеральных войск в Чечне, был тяжело ранен в результате покушения в Грозном. Награждён орденом «За заслуги перед Отечеством» 2-й степени, орденом Мужества, медалью «За отвагу».',
    'images/generals/romanov.svg', '', 'default', 0);

  // Заглушки генералов
  const generalPlaceholders = [
    { name: 'Генерал-выпускник СВКИ', rank: 'Генерал', bio: 'Информация будет добавлена.' },
    { name: 'Генерал-выпускник СВКИ', rank: 'Генерал', bio: 'Информация будет добавлена.' },
    { name: 'Генерал-выпускник СВКИ', rank: 'Генерал', bio: 'Информация будет добавлена.' },
    { name: 'Генерал-выпускник СВКИ', rank: 'Генерал', bio: 'Информация будет добавлена.' },
  ];
  generalPlaceholders.forEach((g, i) => {
    insertPage.run(generalsId, '', g.name, g.rank, g.bio, 'images/generals/silhouette.svg', '', 'default', i + 1);
  });

  // 3. ИСТОРИЯ ИНСТИТУТА (group with 4 stages)
  const historyId = insertSection.run('history', 'История института', 'group', null, '', 3).lastInsertRowid;

  // Stage 1: Создание и становление (1932-1941)
  const creationId = insertSection.run('creation', 'Создание и становление (1932–1941)', 'book', historyId, '', 1).lastInsertRowid;
  CREATION_PAGES.forEach((p, i) => {
    insertPage.run(creationId, p.title || '', '', '', p.bio, p.photo, '', 'default', i);
  });

  // Stage 2: Послевоенный период (1945-1991)
  const postwarId = insertSection.run('postwar', 'Послевоенный период (1945–1991)', 'book', historyId, '', 2).lastInsertRowid;
  POSTWAR_PAGES.forEach((p, i) => {
    insertPage.run(postwarId, p.title || '', '', '', p.bio, p.photo, '', 'default', i);
  });

  // Stage 3: Участие в конфликтах (1988-1990е)
  const conflictsId = insertSection.run('conflicts', 'Участие в конфликтах (конец 1980-х – начало 1990-х)', 'book', historyId, '', 3).lastInsertRowid;
  CONFLICTS_PAGES.forEach((p, i) => {
    insertPage.run(conflictsId, p.title || '', '', '', p.bio, p.photo, '', 'default', i);
  });

  // Stage 4: Современный этап (1992-настоящее время)
  const modernId = insertSection.run('modern', 'Современный этап (1992 – настоящее время)', 'book', historyId, '', 4).lastInsertRowid;
  MODERN_PAGES.forEach((p, i) => {
    insertPage.run(modernId, p.title || '', '', '', p.bio, p.photo, '', 'default', i);
  });

  // 4. УЧАСТИЕ В ВОВ
  const warId = insertSection.run('war_years', 'Участие в Великой Отечественной войне (1941–1945)', 'book', null, '', 4).lastInsertRowid;
  WAR_PAGES.forEach((p, i) => {
    insertPage.run(warId, p.title || '', '', '', p.bio, p.photo, '', 'default', i);
  });

  // 5. ИНСТИТУТ РОСГВАРДИИ СЕГОДНЯ (group with 4 subcategories)
  const todayId = insertSection.run('today', 'Институт Росгвардии сегодня', 'group', null, '', 5).lastInsertRowid;

  const eduId = insertSection.run('education', 'Образование', 'book', todayId, '', 1).lastInsertRowid;
  insertPage.run(eduId, 'Образование', '', '', 'Информация об образовательной деятельности института будет добавлена.', 'images/generals/silhouette.svg', '', 'default', 0);

  const scienceId = insertSection.run('science', 'Наука', 'book', todayId, '', 2).lastInsertRowid;
  insertPage.run(scienceId, 'Наука', '', '', 'Информация о научной деятельности института будет добавлена.', 'images/generals/silhouette.svg', '', 'default', 0);

  const sportId = insertSection.run('sport', 'Спорт', 'book', todayId, '', 3).lastInsertRowid;
  insertPage.run(sportId, 'Спорт', '', '', 'Информация о спортивной деятельности института будет добавлена.', 'images/generals/silhouette.svg', '', 'default', 0);

  const baseId = insertSection.run('material_base', 'Материально-техническая база', 'book', todayId, '', 4).lastInsertRowid;
  insertPage.run(baseId, 'Материально-техническая база', '', '', 'Информация о материально-технической базе института будет добавлена.', 'images/generals/silhouette.svg', '', 'default', 0);
});

tx();

console.log('Миграция завершена!');
console.log('Секций:', db.prepare('SELECT COUNT(*) as c FROM sections').get().c);
console.log('Страниц:', db.prepare('SELECT COUNT(*) as c FROM pages').get().c);
