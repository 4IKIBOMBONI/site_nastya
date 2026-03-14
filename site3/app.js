// ============ STATE ============
var sections = [];
var currentBook = null;
var currentPage = 0;
var currentGalleryType = null;
var currentGalleryPages = [];
var currentHeroIdx = 0;

// ============ INIT ============
window.addEventListener('load', function() {
  loadSections().then(function() {
    setTimeout(function() {
      document.getElementById('loader').classList.add('hidden');
      document.getElementById('mainPage').classList.add('visible');
    }, 1500);
  });
});

function loadSections() {
  return fetch('/api/sections').then(function(r) { return r.json(); }).then(function(data) {
    sections = data;
    renderMainPage();
  });
}

// ============ MAIN PAGE ============
function renderMainPage() {
  var content = document.getElementById('mainContent');
  // Layout: left column, center emblem, right column, bottom
  var left = [];
  var right = [];

  sections.forEach(function(s, i) {
    var isHero = s.slug === 'heroes';
    var plateClass = isHero ? 'plate plate-hero' : 'plate';
    var medal = '';
    if (isHero) {
      medal = '<img src="images/hero_ussr.png" alt="" class="plate-medal plate-medal-left">' +
              '<img src="images/hero_russia.png" alt="" class="plate-medal plate-medal-right">';
    }
    var html = '<a class="' + plateClass + '" onclick="openSection(\'' + s.slug + '\')">' +
      medal +
      '<span class="' + (isHero ? 'plate-text' : '') + '">' + s.title + '</span>' +
      '<span class="s1"></span><span class="s2"></span></a>';

    if (i % 2 === 0) left.push(html);
    else right.push(html);
  });

  content.innerHTML =
    '<div class="left-col">' + left.join('') + '</div>' +
    '<div class="center-col"><div class="emblem-area">' +
      '<img src="images/emblem.png" alt="Эмблема СВКИ" class="emblem">' +
    '</div></div>' +
    '<div class="right-col">' + right.join('') + '</div>';
}

// ============ OVERLAYS ============
function getOverlay(id) {
  var el = document.getElementById('overlay_' + id);
  if (!el) {
    el = document.createElement('div');
    el.id = 'overlay_' + id;
    el.className = 'subpage-overlay';
    el.addEventListener('click', function(e) {
      if (e.target === el) closePage(id);
    });
    document.getElementById('overlayContainer').appendChild(el);
  }
  return el;
}

function openSection(slug) {
  var loader = document.getElementById('subpageLoader');
  loader.classList.add('active');

  fetch('/api/sections/' + slug).then(function(r) { return r.json(); }).then(function(section) {
    loader.classList.remove('active');

    if (section.type === 'hero_gallery') {
      renderHeroGallery(section);
    } else if (section.type === 'group') {
      renderGroup(section);
    } else if (section.type === 'gallery') {
      renderGallery(section);
    } else {
      renderBookSection(section);
    }

    getOverlay(slug).classList.add('active');
    document.body.classList.add('overlay-open');
  });
}

function closePage(id) {
  var el = document.getElementById('overlay_' + id);
  if (el) el.classList.remove('active');
  document.body.classList.remove('overlay-open');
  currentBook = null;
}

// ============ HERO GALLERY (combined with sub-tabs) ============
function renderHeroGallery(section) {
  var el = getOverlay(section.slug);
  var firstChild = section.children && section.children.length > 0 && section.children[0];
  if (firstChild) {
    renderHeroGalleryTab(section, firstChild.slug);
  } else if (section.pages && section.pages.length > 0) {
    // No children but has pages directly - render as gallery
    var isLarge = section.pages.length > 6;
    var gridClass = isLarge ? 'gallery-grid-large' : 'gallery-grid';
    var cards = section.pages.map(function(p, i) {
      return '<div class="gallery-card" onclick="openHeroDetail(\'' + section.slug + '\',' + i + ')">' +
        '<img src="' + p.photo + '" alt="' + (p.name || p.title) + '" onerror="this.src=\'images/generals/silhouette.svg\'">' +
        '<div class="gallery-card-name">' + (p.name || p.title) + '</div></div>';
    }).join('');
    el.innerHTML = '<div class="book-container">' +
      '<div class="book-header">' +
        '<div class="book-title">' + section.title + '</div>' +
        '<button class="back-btn" onclick="closePage(\'' + section.slug + '\')">✕</button>' +
      '</div>' +
      '<div style="flex:1;overflow-y:auto;padding:2vh 2vw;">' +
        '<div class="' + gridClass + '">' + cards + '</div>' +
      '</div></div>';
    currentGalleryType = section.slug;
    currentGalleryPages = section.pages;
  } else {
    renderPlaceholder(section);
  }
}

function renderHeroGalleryTab(parentSection, activeSlug) {
  fetch('/api/sections/' + activeSlug).then(function(r) { return r.json(); }).then(function(activeSection) {
    var el = getOverlay(parentSection.slug);
    var tabs = parentSection.children.map(function(c) {
      return '<button class="tab-btn ' + (c.slug === activeSlug ? 'active' : '') +
        '" onclick="renderHeroGalleryTab(cachedParent, \'' + c.slug + '\')">' + c.title + '</button>';
    }).join('');

    var isLarge = activeSection.pages.length > 6;
    var gridClass = isLarge ? 'gallery-grid-large' : 'gallery-grid';

    var cards = activeSection.pages.map(function(p, i) {
      return '<div class="gallery-card" onclick="openHeroDetail(\'' + activeSlug + '\',' + i + ')">' +
        '<img src="' + p.photo + '" alt="' + (p.name || p.title) + '" onerror="this.src=\'images/generals/silhouette.svg\'">' +
        '<div class="gallery-card-name">' + (p.name || p.title) + '</div></div>';
    }).join('');

    el.innerHTML = '<div class="book-container">' +
      '<div class="book-header">' +
        '<div style="display:flex;gap:1.5vw;align-items:center;flex-wrap:wrap">' + tabs + '</div>' +
        '<button class="back-btn" onclick="closePage(\'' + parentSection.slug + '\')">✕</button>' +
      '</div>' +
      '<div style="flex:1;overflow-y:auto;padding:2vh 2vw;">' +
        '<div class="' + gridClass + '">' + cards + '</div>' +
      '</div></div>';

    // Cache for tab switching
    window.cachedParent = parentSection;
    currentGalleryType = activeSlug;
    currentGalleryPages = activeSection.pages;
  });
}

// ============ GALLERY (Generals, etc.) ============
function renderGallery(section) {
  var el = getOverlay(section.slug);
  var cards = section.pages.map(function(p, i) {
    return '<div class="gallery-card" onclick="openHeroDetail(\'' + section.slug + '\',' + i + ')">' +
      '<img src="' + p.photo + '" alt="' + (p.name || p.title) + '" onerror="this.src=\'images/generals/silhouette.svg\'">' +
      '<div class="gallery-card-name">' + (p.name || p.title) + '</div></div>';
  }).join('');

  el.innerHTML = '<div class="book-container">' +
    '<div class="book-header">' +
      '<div class="book-title">' + section.title + '</div>' +
      '<button class="back-btn" onclick="closePage(\'' + section.slug + '\')">✕</button>' +
    '</div>' +
    '<div style="flex:1;overflow-y:auto;padding:2vh 2vw;">' +
      '<div class="gallery-grid">' + cards + '</div>' +
    '</div></div>';

  currentGalleryType = section.slug;
  currentGalleryPages = section.pages;
}

// ============ HERO DETAIL ============
function openHeroDetail(type, idx) {
  // Load pages if not cached
  if (currentGalleryType !== type || !currentGalleryPages.length) {
    fetch('/api/sections/' + type + '/pages').then(function(r) { return r.json(); }).then(function(pages) {
      currentGalleryType = type;
      currentGalleryPages = pages;
      showHeroDetail(idx);
    });
  } else {
    showHeroDetail(idx);
  }
}

function showHeroDetail(idx) {
  var pages = currentGalleryPages;
  if (idx < 0 || idx >= pages.length) return;
  currentHeroIdx = idx;
  var h = pages[idx];
  var bioHtml = (h.bio || '').split('\n\n').map(function(p) { return '<p>' + p.replace(/\n/g, '<br>') + '</p>'; }).join('');

  var el = getOverlay('hero_detail');
  el.innerHTML = '<div class="book-container" style="width:88vw;height:88vh;">' +
    '<div class="book-header">' +
      '<div class="book-title">' + (h.rank || '') + '</div>' +
      '<div style="display:flex;align-items:center;gap:1.5vw;">' +
        '<button class="book-nav-btn" onclick="navHero(-1)" ' + (idx === 0 ? 'disabled' : '') + '>◄</button>' +
        '<span class="book-page-info">' + (idx + 1) + ' / ' + pages.length + '</span>' +
        '<button class="book-nav-btn" onclick="navHero(1)" ' + (idx === pages.length - 1 ? 'disabled' : '') + '>►</button>' +
        '<button class="back-btn" onclick="closeHeroDetail()">✕</button>' +
      '</div></div>' +
    '<div class="book-body">' +
      '<div class="book-left"><img src="' + h.photo + '" alt="' + (h.name || '') + '" onclick="zoomPhoto(this.src)" style="cursor:zoom-in" onerror="this.src=\'images/generals/silhouette.svg\'"></div>' +
      '<div class="book-right">' +
        '<div class="book-name">' + (h.name || '') + '</div>' +
        (h.rank ? '<div class="book-rank">' + h.rank + '</div>' : '') +
        '<div class="book-bio">' + bioHtml + '</div>' +
      '</div></div></div>';
  el.classList.add('active');
}

function navHero(dir) {
  showHeroDetail(currentHeroIdx + dir);
}

function closeHeroDetail() {
  var el = document.getElementById('overlay_hero_detail');
  if (el) el.classList.remove('active');
}

// ============ GROUP (sub-menu with child sections) ============
function renderGroup(section) {
  var el = getOverlay(section.slug);
  var buttons = section.children.map(function(c) {
    return '<a class="plate group-plate" onclick="openChildSection(\'' + section.slug + '\', \'' + c.slug + '\')">' +
      '<span>' + c.title + '</span><span class="s1"></span><span class="s2"></span></a>';
  }).join('');

  el.innerHTML = '<div class="book-container">' +
    '<div class="book-header">' +
      '<div class="book-title">' + section.title + '</div>' +
      '<button class="back-btn" onclick="closePage(\'' + section.slug + '\')">✕</button>' +
    '</div>' +
    '<div class="group-grid">' + buttons + '</div></div>';
}

function openChildSection(parentSlug, childSlug) {
  var loader = document.getElementById('subpageLoader');
  loader.classList.add('active');

  fetch('/api/sections/' + childSlug).then(function(r) { return r.json(); }).then(function(section) {
    loader.classList.remove('active');

    if (section.type === 'gallery') {
      renderGallery(section);
    } else {
      renderBookSection(section);
    }
    getOverlay(childSlug).classList.add('active');
    document.body.classList.add('overlay-open');
  });
}

// ============ BOOK SECTION ============
function renderBookSection(section) {
  if (!section.pages || section.pages.length === 0) {
    renderPlaceholder(section);
    return;
  }
  currentBook = { slug: section.slug, pages: section.pages, title: section.title };
  currentPage = 0;
  updateBookPage();
}

function updateBookPage() {
  if (!currentBook) return;
  var pages = currentBook.pages;
  var page = pages[currentPage];
  var bioHtml = (page.bio || '').split('\n\n').map(function(p) { return '<p>' + p.replace(/\n/g, '<br>') + '</p>'; }).join('');
  var slug = currentBook.slug;

  // Determine template
  var template = page.template || 'default';
  var leftContent = '';
  if (template === 'two_landscape' && page.photo2) {
    leftContent =
      '<img src="' + page.photo + '" alt="" onclick="zoomPhoto(this.src)" style="cursor:zoom-in;max-width:90%;max-height:32vh;margin-bottom:1vh" onerror="this.style.display=\'none\'">' +
      '<img src="' + page.photo2 + '" alt="" onclick="zoomPhoto(this.src)" style="cursor:zoom-in;max-width:90%;max-height:32vh" onerror="this.style.display=\'none\'">';
  } else {
    leftContent = '<img src="' + page.photo + '" alt="' + (page.title || '') + '" onclick="zoomPhoto(this.src)" style="cursor:zoom-in" onerror="this.parentElement.innerHTML=\'<div style=padding:2vh;color:#c9a84c;text-align:center>Фото будет добавлено</div>\'">';
  }

  var el = getOverlay(slug);
  el.innerHTML = '<div class="book-container">' +
    '<div class="book-header">' +
      '<div class="book-title">' + currentBook.title + '</div>' +
      '<div style="display:flex;align-items:center;gap:2vw;">' +
        '<div class="book-page-info">' + (currentPage + 1) + ' / ' + pages.length + '</div>' +
        '<button class="back-btn" onclick="closePage(\'' + slug + '\')">✕</button>' +
      '</div></div>' +
    '<div class="book-body">' +
      '<div class="book-left' + (template === 'two_landscape' ? ' book-left-stacked' : '') + '">' + leftContent + '</div>' +
      '<div class="book-right">' +
        (page.title ? '<div class="book-name">' + page.title + '</div>' : '') +
        '<div class="book-bio">' + bioHtml + '</div>' +
      '</div></div>' +
    '<div class="book-nav">' +
      '<button class="book-nav-btn" onclick="bookNav(-1)" ' + (currentPage === 0 ? 'disabled' : '') + '>◄ Предыдущий</button>' +
      '<button class="book-nav-btn" onclick="bookNav(1)" ' + (currentPage === pages.length - 1 ? 'disabled' : '') + '>Следующий ►</button>' +
    '</div></div>';
}

function bookNav(dir) {
  if (!currentBook) return;
  var newPage = currentPage + dir;
  if (newPage >= 0 && newPage < currentBook.pages.length) {
    currentPage = newPage;
    updateBookPage();
  }
}

function renderPlaceholder(section) {
  var el = getOverlay(section.slug);
  el.innerHTML = '<div class="book-container">' +
    '<div class="book-header">' +
      '<div class="book-title">' + section.title + '</div>' +
      '<button class="back-btn" onclick="closePage(\'' + section.slug + '\')">✕</button>' +
    '</div>' +
    '<div style="flex:1;display:flex;align-items:center;justify-content:center">' +
      '<p style="color:#c9a84c;font-size:clamp(1rem,2vw,1.5rem)">Данные будут добавлены позже.</p>' +
    '</div></div>';
}

// ============ PHOTO ZOOM ============
function zoomPhoto(src) {
  var overlay = document.getElementById('zoomOverlay');
  document.getElementById('zoomImg').src = src;
  overlay.classList.add('active');
}

function closeZoom() {
  document.getElementById('zoomOverlay').classList.remove('active');
}

// ============ KEYBOARD NAVIGATION ============
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    // Close zoom first
    if (document.getElementById('zoomOverlay').classList.contains('active')) {
      closeZoom();
      return;
    }
    // Close hero detail
    var heroDetail = document.getElementById('overlay_hero_detail');
    if (heroDetail && heroDetail.classList.contains('active')) {
      closeHeroDetail();
      return;
    }
    // Close any active overlay
    var overlays = document.querySelectorAll('.subpage-overlay.active');
    overlays.forEach(function(el) { el.classList.remove('active'); });
    document.body.classList.remove('overlay-open');
    currentBook = null;
  }
  if (currentBook) {
    if (e.key === 'ArrowLeft') bookNav(-1);
    if (e.key === 'ArrowRight') bookNav(1);
  }
});
