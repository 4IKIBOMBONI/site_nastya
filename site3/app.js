// ============ BOOK STATE ============
let currentBook = null;
let currentPage = 0;

// ============ INIT ============
window.addEventListener('load', function() {
  setTimeout(function() {
    document.getElementById('loader').classList.add('hidden');
    document.getElementById('mainPage').classList.add('visible');
  }, 1500);
});

function openPage(id) {
  var loader = document.getElementById('subpageLoader');
  loader.classList.add('active');
  setTimeout(function() {
    loader.classList.remove('active');
    if (id === 'heroes_ussr') renderHeroesUSSRMain();
    else if (id === 'heroes_russia') renderHeroesRussiaMain();
    else if (id === 'postwar') renderPostwar();
    else if (id === 'war_years') renderWarYears();
    else if (id === 'creation_1932') renderCreation();
    else if (id === 'conflicts') renderConflicts();
    else if (id === 'modern') renderModern();
    else renderPlaceholder(id, getTitle(id));
    document.getElementById('overlay_' + id).classList.add('active');
  }, 700);
}

function closePage(id) {
  document.getElementById('overlay_' + id).classList.remove('active');
  currentBook = null;
}

function getTitle(id) {
  var titles = {
    creation_1932: 'Создание 4-ой пограничной школы войск ОГПУ 1932 год',
    war_years: 'Саратовское военное училище в годы Великой Отечественной войны (1941–1945 гг.)',
    conflicts: 'Участие личного состава военного училища в ликвидации межнациональных конфликтов (конец 1980-х – начало 1990-х гг.)',
    modern: 'Саратовский военный институт на современном этапе своего развития (с 1992 г. – по настоящее время)'
  };
  return titles[id] || id;
}

// ============ GENERIC BOOK RENDERER (with scrollable text + fixed photo) ============
function renderGenericBook(overlayId, closeId, data, title, prevFn, nextFn) {
  var page = data[currentPage];
  var bioHtml = page.bio.split('\n\n').map(function(p){ return '<p>' + p + '</p>'; }).join('');

  var el = document.getElementById(overlayId);
  el.innerHTML = '<div class="book-container">' +
    '<div class="book-header">' +
      '<div class="book-title">' + title + '</div>' +
      '<div style="display:flex;align-items:center;gap:2vw;">' +
        '<div class="book-page-info">' + (currentPage + 1) + ' / ' + data.length + '</div>' +
        '<button class="back-btn" onclick="closePage(\'' + closeId + '\')">✕</button>' +
      '</div>' +
    '</div>' +
    '<div class="book-body">' +
      '<div class="book-left"><img src="' + page.photo + '" alt="' + page.title + '" onerror="this.parentElement.innerHTML=\'<div style=padding:2vh;color:#c9a84c;text-align:center>Фото будет добавлено</div>\'"></div>' +
      '<div class="book-right">' +
        '<div class="book-name">' + page.title + '</div>' +
        '<div class="book-bio">' + bioHtml + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="book-nav">' +
      '<button class="book-nav-btn" onclick="' + prevFn + '()" ' + (currentPage === 0 ? 'disabled' : '') + '>◄ Предыдущий</button>' +
      '<button class="book-nav-btn" onclick="' + nextFn + '()" ' + (currentPage === data.length - 1 ? 'disabled' : '') + '>Следующий ►</button>' +
    '</div>' +
  '</div>';
}

// ============ BOOK RENDERER (for heroes_russia list) ============
function renderBook(id, data, title) {
  currentBook = { id: id, data: data, title: title };
  currentPage = 0;
  updateBook();
}

function updateBook() {
  var d = currentBook.data;
  var hero = d[currentPage];
  var bioHtml = hero.bio.split('\n\n').map(function(p){ return '<p>' + p + '</p>'; }).join('');

  var el = document.getElementById('overlay_' + currentBook.id);
  el.innerHTML = '<div class="book-container">' +
    '<div class="book-header">' +
      '<div class="book-title">' + currentBook.title + '</div>' +
      '<div style="display:flex;align-items:center;gap:2vw;">' +
        '<div class="book-page-info">' + (currentPage + 1) + ' / ' + d.length + '</div>' +
        '<button class="back-btn" onclick="closePage(\'' + currentBook.id + '\')">✕ Закрыть</button>' +
      '</div>' +
    '</div>' +
    '<div class="book-body">' +
      '<div class="book-left"><img src="' + hero.photo + '" alt="' + hero.name + '" onerror="this.style.display=\'none\'"></div>' +
      '<div class="book-right">' +
        '<div class="book-name">' + hero.name + '</div>' +
        '<div class="book-rank">' + hero.rank + '</div>' +
        '<div class="book-bio">' + bioHtml + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="book-nav">' +
      '<button class="book-nav-btn" onclick="bookPrev()" ' + (currentPage === 0 ? 'disabled' : '') + '>◄ Предыдущий</button>' +
      '<button class="book-nav-btn" onclick="bookNext()" ' + (currentPage === d.length - 1 ? 'disabled' : '') + '>Следующий ►</button>' +
    '</div>' +
  '</div>';
}

function bookPrev() {
  if (currentPage > 0) { currentPage--; updateBook(); }
}

function bookNext() {
  if (currentBook && currentPage < currentBook.data.length - 1) { currentPage++; updateBook(); }
}

// Keyboard navigation
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    document.querySelectorAll('.subpage-overlay.active').forEach(function(el) { el.classList.remove('active'); });
    currentBook = null;
  }
  if (currentBook) {
    if (currentBook.id === 'postwar') {
      if (e.key === 'ArrowLeft') postwarPrev();
      if (e.key === 'ArrowRight') postwarNext();
    } else if (currentBook.id === 'war_years') {
      if (e.key === 'ArrowLeft') warPrev();
      if (e.key === 'ArrowRight') warNext();
    } else if (currentBook.id === 'creation_1932') {
      if (e.key === 'ArrowLeft') creationPrev();
      if (e.key === 'ArrowRight') creationNext();
    } else if (currentBook.id === 'conflicts') {
      if (e.key === 'ArrowLeft') conflictsPrev();
      if (e.key === 'ArrowRight') conflictsNext();
    } else if (currentBook.id === 'modern') {
      if (e.key === 'ArrowLeft') modernPrev();
      if (e.key === 'ArrowRight') modernNext();
    } else if (currentBook.id === 'heroes_ussr' || currentBook.id === 'heroes_russia') {
      // handled by gallery detail nav
    } else {
      if (e.key === 'ArrowLeft') bookPrev();
      if (e.key === 'ArrowRight') bookNext();
    }
  }
});

// Close on overlay click
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('subpage-overlay')) {
    e.target.classList.remove('active');
    currentBook = null;
  }
});

// ============ PLACEHOLDER ============
function renderPlaceholder(id, title) {
  var el = document.getElementById('overlay_' + id);
  el.innerHTML = '<div class="subpage-content">' +
    '<button class="back-btn" onclick="closePage(\'' + id + '\')">← Назад</button>' +
    '<div class="subpage-title">' + title + '</div>' +
    '<div class="subpage-text"><p class="placeholder-text">Данные для этого раздела будут добавлены позже.</p></div>' +
  '</div>';
}

// ============ POSTWAR ============
function renderPostwar() {
  currentBook = { id: 'postwar', data: POSTWAR_PAGES, title: 'Послевоенный период развития училища (1945–1991 гг.)' };
  currentPage = 0;
  updatePostwarBook();
}

function updatePostwarBook() {
  var d = currentBook.data;
  var page = d[currentPage];
  var bioHtml = page.bio.split('\n\n').map(function(p){ return '<p>' + p + '</p>'; }).join('');

  var el = document.getElementById('overlay_postwar');
  el.innerHTML = '<div class="book-container">' +
    '<div class="book-header">' +
      '<div class="book-title">' + currentBook.title + '</div>' +
      '<div style="display:flex;align-items:center;gap:2vw;">' +
        '<div class="book-page-info">' + (currentPage + 1) + ' / ' + d.length + '</div>' +
        '<button class="back-btn" onclick="closePage(\'postwar\')">✕</button>' +
      '</div>' +
    '</div>' +
    '<div class="book-body">' +
      '<div class="book-left"><img src="' + page.photo + '" alt="' + page.title + '"></div>' +
      '<div class="book-right">' +
        '<div class="book-name">' + page.title + '</div>' +
        '<div class="book-bio">' + bioHtml + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="book-nav">' +
      '<button class="book-nav-btn" onclick="postwarPrev()" ' + (currentPage === 0 ? 'disabled' : '') + '>◄ Предыдущий</button>' +
      '<button class="book-nav-btn" onclick="postwarNext()" ' + (currentPage === d.length - 1 ? 'disabled' : '') + '>Следующий ►</button>' +
    '</div>' +
  '</div>';
}

function postwarPrev() { if (currentPage > 0) { currentPage--; updatePostwarBook(); } }
function postwarNext() { if (currentBook && currentPage < currentBook.data.length - 1) { currentPage++; updatePostwarBook(); } }

// ============ HEROES USSR MAIN (with tabs for USSR + Soc Labor) ============
function renderHeroesUSSRMain() {
  currentBook = { id: 'heroes_ussr' };
  renderGalleryUSSR();
}

function renderGalleryUSSR() {
  var d = HEROES_USSR;
  var el = document.getElementById('overlay_heroes_ussr');
  var cards = d.map(function(h, i) {
    return '<div class="gallery-card" onclick="openHeroDetail(\'ussr\',' + i + ')">' +
      '<img src="' + h.photo + '" alt="' + h.name + '">' +
      '<div class="gallery-card-name">' + h.name + '</div>' +
    '</div>';
  }).join('');

  el.innerHTML = '<div class="book-container">' +
    '<div class="book-header">' +
      '<div style="display:flex;gap:1.5vw;align-items:center;">' +
        '<button class="tab-btn active" onclick="switchTab(\'ussr\')">Герои Советского Союза</button>' +
        '<button class="tab-btn" onclick="switchTab(\'soc\')">Герои Социалистического Труда</button>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:2vw;">' +
        '<button class="back-btn" onclick="closePage(\'heroes_ussr\')">✕</button>' +
      '</div>' +
    '</div>' +
    '<div style="flex:1;overflow-y:auto;padding:2vh 2vw;">' +
      '<div class="gallery-grid-large">' + cards + '</div>' +
    '</div>' +
  '</div>';
}

function renderGalleryWithTabs() {
  var d = HEROES_SOC_LABOR;
  var el = document.getElementById('overlay_heroes_ussr');
  var cards = d.map(function(h, i) {
    return '<div class="gallery-card" onclick="openHeroDetail(\'soc\',' + i + ')">' +
      '<img src="' + h.photo + '" alt="' + h.name + '">' +
      '<div class="gallery-card-name">' + h.name + '</div>' +
    '</div>';
  }).join('');

  el.innerHTML = '<div class="book-container">' +
    '<div class="book-header">' +
      '<div style="display:flex;gap:1.5vw;align-items:center;">' +
        '<button class="tab-btn" onclick="switchTab(\'ussr\')">Герои Советского Союза</button>' +
        '<button class="tab-btn active" onclick="switchTab(\'soc\')">Герои Социалистического Труда</button>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:2vw;">' +
        '<button class="back-btn" onclick="closePage(\'heroes_ussr\')">✕</button>' +
      '</div>' +
    '</div>' +
    '<div style="flex:1;overflow-y:auto;padding:2vh 2vw;">' +
      '<div class="gallery-grid">' + cards + '</div>' +
    '</div>' +
  '</div>';
}

function switchTab(tab) {
  if (tab === 'ussr') {
    renderGalleryUSSR();
  } else {
    renderGalleryWithTabs();
  }
}

// Hero detail (opens from gallery card click)
function openHeroDetail(type, idx) {
  var data = type === 'ussr' ? HEROES_USSR : (type === 'russia' ? HEROES_RUSSIA : HEROES_SOC_LABOR);
  var h = data[idx];
  var bioHtml = h.bio.split('\n\n').map(function(p){ return '<p>' + p + '</p>'; }).join('');
  var modal = document.getElementById('overlay_soc_labor');
  modal.innerHTML = '<div class="book-container" style="width:88vw;height:88vh;">' +
    '<div class="book-header">' +
      '<div class="book-title">' + h.rank + '</div>' +
      '<div style="display:flex;align-items:center;gap:1.5vw;">' +
        '<button class="book-nav-btn" onclick="navHeroDetail(\'' + type + '\',' + (idx-1) + ')" ' + (idx === 0 ? 'disabled' : '') + '>◄</button>' +
        '<span class="book-page-info">' + (idx+1) + ' / ' + data.length + '</span>' +
        '<button class="book-nav-btn" onclick="navHeroDetail(\'' + type + '\',' + (idx+1) + ')" ' + (idx === data.length-1 ? 'disabled' : '') + '>►</button>' +
        '<button class="back-btn" onclick="closeGalleryDetail()">✕</button>' +
      '</div>' +
    '</div>' +
    '<div class="book-body">' +
      '<div class="book-left"><img src="' + h.photo + '" alt="' + h.name + '"></div>' +
      '<div class="book-right">' +
        '<div class="book-name">' + h.name + '</div>' +
        '<div class="book-rank">' + h.rank + '</div>' +
        '<div class="book-bio">' + bioHtml + '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
  modal.classList.add('active');
}

function navHeroDetail(type, idx) {
  var data = type === 'ussr' ? HEROES_USSR : (type === 'russia' ? HEROES_RUSSIA : HEROES_SOC_LABOR);
  if (idx >= 0 && idx < data.length) openHeroDetail(type, idx);
}

function closeGalleryDetail() {
  document.getElementById('overlay_soc_labor').classList.remove('active');
}

// ============ HEROES RUSSIA ============
function renderHeroesRussiaMain() {
  currentBook = { id: 'heroes_russia' };
  renderGalleryRussia();
}

function renderGalleryRussia() {
  var d = HEROES_RUSSIA;
  var el = document.getElementById('overlay_heroes_russia');
  var cards = d.map(function(h, i) {
    return '<div class="gallery-card" onclick="openHeroDetail(\'russia\',' + i + ')">' +
      '<img src="' + h.photo + '" alt="' + h.name + '">' +
      '<div class="gallery-card-name">' + h.name + '</div>' +
    '</div>';
  }).join('');

  el.innerHTML = '<div class="book-container">' +
    '<div class="book-header">' +
      '<div class="book-title">Герои Российской Федерации</div>' +
      '<div style="display:flex;align-items:center;gap:2vw;">' +
        '<button class="back-btn" onclick="closePage(\'heroes_russia\')">✕</button>' +
      '</div>' +
    '</div>' +
    '<div style="flex:1;overflow-y:auto;padding:2vh 2vw;">' +
      '<div class="gallery-grid">' + cards + '</div>' +
    '</div>' +
  '</div>';
}

// ============ WAR YEARS ============
function renderWarYears() {
  currentBook = { id: 'war_years', data: WAR_PAGES, title: 'Саратовское военное училище в годы Великой Отечественной войны (1941–1945 гг.)' };
  currentPage = 0;
  updateWarBook();
}

function updateWarBook() {
  renderGenericBook('overlay_war_years', 'war_years', currentBook.data, currentBook.title, 'warPrev', 'warNext');
}

function warPrev() { if (currentPage > 0) { currentPage--; updateWarBook(); } }
function warNext() { if (currentBook && currentPage < currentBook.data.length - 1) { currentPage++; updateWarBook(); } }

// ============ CREATION 1932 ============
function renderCreation() {
  currentBook = { id: 'creation_1932', data: CREATION_PAGES, title: 'Создание 4-ой пограничной школы войск ОГПУ 1932 год' };
  currentPage = 0;
  updateCreationBook();
}

function updateCreationBook() {
  renderGenericBook('overlay_creation_1932', 'creation_1932', currentBook.data, currentBook.title, 'creationPrev', 'creationNext');
}

function creationPrev() { if (currentPage > 0) { currentPage--; updateCreationBook(); } }
function creationNext() { if (currentBook && currentPage < currentBook.data.length - 1) { currentPage++; updateCreationBook(); } }

// ============ CONFLICTS ============
function renderConflicts() {
  currentBook = { id: 'conflicts', data: CONFLICTS_PAGES, title: 'Участие личного состава в ликвидации межнациональных конфликтов (конец 1980-х – начало 1990-х гг.)' };
  currentPage = 0;
  updateConflictsBook();
}

function updateConflictsBook() {
  renderGenericBook('overlay_conflicts', 'conflicts', currentBook.data, currentBook.title, 'conflictsPrev', 'conflictsNext');
}

function conflictsPrev() { if (currentPage > 0) { currentPage--; updateConflictsBook(); } }
function conflictsNext() { if (currentBook && currentPage < currentBook.data.length - 1) { currentPage++; updateConflictsBook(); } }

// ============ MODERN ============
function renderModern() {
  currentBook = { id: 'modern', data: MODERN_PAGES, title: 'Саратовский военный институт на современном этапе (с 1992 г. – по настоящее время)' };
  currentPage = 0;
  updateModernBook();
}

function updateModernBook() {
  renderGenericBook('overlay_modern', 'modern', currentBook.data, currentBook.title, 'modernPrev', 'modernNext');
}

function modernPrev() { if (currentPage > 0) { currentPage--; updateModernBook(); } }
function modernNext() { if (currentBook && currentPage < currentBook.data.length - 1) { currentPage++; updateModernBook(); } }
