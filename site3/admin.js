// ============ AUTH ============
var allSections = [];
var activeSection = null;

window.addEventListener('load', checkAuth);

function checkAuth() {
  fetch('/api/admin/check').then(function(r) { return r.json(); }).then(function(d) {
    if (d.isAdmin) showAdmin();
    else showLogin();
  });
}

function showLogin() {
  document.getElementById('loginScreen').style.display = '';
  document.getElementById('adminApp').style.display = 'none';
}

function showAdmin() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminApp').style.display = '';
  loadAllSections();
}

function doLogin() {
  var pass = document.getElementById('loginPass').value;
  fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pass })
  }).then(function(r) {
    if (r.ok) showAdmin();
    else document.getElementById('loginError').textContent = 'Неверный пароль';
  });
}

function doLogout() {
  fetch('/api/admin/logout', { method: 'POST' }).then(function() { showLogin(); });
}

// ============ SECTIONS ============
function loadAllSections() {
  fetch('/api/admin/sections').then(function(r) { return r.json(); }).then(function(data) {
    allSections = data;
    renderSidebar();
  });
}

function renderSidebar() {
  var sidebar = document.getElementById('sidebar');
  var topLevel = allSections.filter(function(s) { return !s.parent_id; });

  var html = '<div style="padding:0 1rem .5rem;color:#888;font-size:.75rem;text-transform:uppercase;letter-spacing:.05em">Разделы</div>';

  topLevel.forEach(function(s) {
    var isActive = activeSection && activeSection.id === s.id;
    html += '<div class="sidebar-item ' + (isActive ? 'active' : '') + '" onclick="selectSection(' + s.id + ')">' +
      '<span>' + s.title + '</span>' +
      '<span class="type-badge">' + s.type + '</span></div>';

    var children = allSections.filter(function(c) { return c.parent_id === s.id; });
    children.forEach(function(c) {
      var isChildActive = activeSection && activeSection.id === c.id;
      html += '<div class="sidebar-child sidebar-item ' + (isChildActive ? 'active' : '') + '" onclick="selectSection(' + c.id + ')">' +
        '<span>' + c.title + '</span>' +
        '<span class="type-badge">' + c.type + '</span></div>';
    });
  });

  html += '<div class="sidebar-add" onclick="openAddSectionModal()">+ Добавить раздел</div>';
  sidebar.innerHTML = html;
}

function selectSection(id) {
  var section = allSections.find(function(s) { return s.id === id; });
  if (!section) return;
  activeSection = section;
  renderSidebar();

  fetch('/api/admin/pages?section_id=' + id).then(function(r) { return r.json(); }).then(function(pages) {
    renderSectionContent(section, pages);
  });
}

function renderSectionContent(section, pages) {
  var main = document.getElementById('mainContent');

  var html = '<div class="section-header">' +
    '<h2>' + section.title + '</h2>' +
    '<div style="display:flex;gap:.5rem">' +
      '<button class="btn btn-outline btn-sm" onclick="openEditSectionModal(' + section.id + ')">Редактировать раздел</button>' +
      '<button class="btn btn-success btn-sm" onclick="openAddPageModal(' + section.id + ')">+ Добавить страницу</button>' +
      '<button class="btn btn-danger btn-sm" onclick="deleteSection(' + section.id + ')">Удалить раздел</button>' +
    '</div></div>';

  html += '<div class="form-inline" style="margin-bottom:1.5rem">' +
    '<div class="form-group"><label>Slug</label><input value="' + esc(section.slug) + '" disabled></div>' +
    '<div class="form-group"><label>Тип</label><input value="' + section.type + '" disabled></div>' +
    '<div class="form-group"><label>Порядок</label><input value="' + section.sort_order + '" disabled></div>' +
  '</div>';

  if (pages.length === 0) {
    html += '<p style="color:#888;text-align:center;padding:2rem">Нет страниц. Нажмите "Добавить страницу" чтобы создать.</p>';
  } else {
    pages.forEach(function(p, i) {
      var displayName = p.name || p.title || 'Страница ' + (i + 1);
      var previewText = (p.bio || '').substring(0, 100);
      html += '<div class="page-card">' +
        (p.photo ? '<img class="page-card-photo" src="' + esc(p.photo) + '" onerror="this.style.display=\'none\'">' : '<div class="page-card-photo" style="display:flex;align-items:center;justify-content:center;color:#555;font-size:.7rem">Нет фото</div>') +
        '<div class="page-card-info">' +
          '<h4>' + esc(displayName) + '</h4>' +
          (p.rank ? '<p style="color:#c9a84c">' + esc(p.rank) + '</p>' : '') +
          '<p>' + esc(previewText) + (previewText.length >= 100 ? '...' : '') + '</p>' +
          '<p style="color:#555;font-size:.7rem">Шаблон: ' + p.template + ' | Порядок: ' + p.sort_order + '</p>' +
        '</div>' +
        '<div class="page-card-actions">' +
          '<button class="btn btn-outline btn-sm" onclick="openEditPageModal(' + p.id + ')">Ред.</button>' +
          '<button class="btn btn-danger btn-sm" onclick="deletePage(' + p.id + ',' + section.id + ')">Уд.</button>' +
        '</div></div>';
    });
  }

  main.innerHTML = html;
}

// ============ MODALS ============
function openModal(html) {
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modalOverlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
}

// ---- Add Section ----
function openAddSectionModal() {
  var parentOptions = '<option value="">— Нет (верхний уровень) —</option>';
  allSections.filter(function(s) { return !s.parent_id; }).forEach(function(s) {
    parentOptions += '<option value="' + s.id + '">' + esc(s.title) + '</option>';
  });

  openModal(
    '<h3>Добавить раздел</h3>' +
    '<div class="form-group"><label>Название</label><input id="mSecTitle"></div>' +
    '<div class="form-group"><label>Slug (англ, без пробелов)</label><input id="mSecSlug"></div>' +
    '<div class="form-group"><label>Тип</label><select id="mSecType">' +
      '<option value="book">Книга (book)</option>' +
      '<option value="gallery">Галерея (gallery)</option>' +
      '<option value="group">Группа подразделов (group)</option>' +
      '<option value="hero_gallery">Галерея героев с табами (hero_gallery)</option>' +
    '</select></div>' +
    '<div class="form-group"><label>Родительский раздел</label><select id="mSecParent">' + parentOptions + '</select></div>' +
    '<div class="form-group"><label>Порядок сортировки</label><input id="mSecOrder" type="number" value="0"></div>' +
    '<div class="modal-actions">' +
      '<button class="btn btn-primary" onclick="saveNewSection()">Создать</button>' +
      '<button class="btn btn-outline" onclick="closeModal()">Отмена</button>' +
    '</div>'
  );
}

function saveNewSection() {
  var data = {
    title: document.getElementById('mSecTitle').value,
    slug: document.getElementById('mSecSlug').value,
    type: document.getElementById('mSecType').value,
    parent_id: document.getElementById('mSecParent').value || null,
    sort_order: parseInt(document.getElementById('mSecOrder').value) || 0
  };
  fetch('/api/admin/sections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(function(r) {
    if (r.ok) { closeModal(); loadAllSections(); }
    else r.json().then(function(d) { alert(d.error); });
  });
}

// ---- Edit Section ----
function openEditSectionModal(id) {
  var s = allSections.find(function(x) { return x.id === id; });
  if (!s) return;

  openModal(
    '<h3>Редактировать раздел</h3>' +
    '<div class="form-group"><label>Название</label><input id="mSecTitle" value="' + esc(s.title) + '"></div>' +
    '<div class="form-group"><label>Slug</label><input id="mSecSlug" value="' + esc(s.slug) + '"></div>' +
    '<div class="form-group"><label>Тип</label><select id="mSecType">' +
      '<option value="book" ' + (s.type === 'book' ? 'selected' : '') + '>Книга</option>' +
      '<option value="gallery" ' + (s.type === 'gallery' ? 'selected' : '') + '>Галерея</option>' +
      '<option value="group" ' + (s.type === 'group' ? 'selected' : '') + '>Группа</option>' +
      '<option value="hero_gallery" ' + (s.type === 'hero_gallery' ? 'selected' : '') + '>Галерея героев</option>' +
    '</select></div>' +
    '<div class="form-group"><label>Порядок</label><input id="mSecOrder" type="number" value="' + s.sort_order + '"></div>' +
    '<div class="modal-actions">' +
      '<button class="btn btn-primary" onclick="saveEditSection(' + id + ')">Сохранить</button>' +
      '<button class="btn btn-outline" onclick="closeModal()">Отмена</button>' +
    '</div>'
  );
}

function saveEditSection(id) {
  var data = {
    title: document.getElementById('mSecTitle').value,
    slug: document.getElementById('mSecSlug').value,
    type: document.getElementById('mSecType').value,
    sort_order: parseInt(document.getElementById('mSecOrder').value) || 0
  };
  fetch('/api/admin/sections/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(function(r) {
    if (r.ok) { closeModal(); loadAllSections(); selectSection(id); }
  });
}

function deleteSection(id) {
  if (!confirm('Удалить раздел и все его страницы? Это действие необратимо.')) return;
  fetch('/api/admin/sections/' + id, { method: 'DELETE' }).then(function() {
    activeSection = null;
    document.getElementById('mainContent').innerHTML = '<div class="welcome"><h2>Раздел удалён</h2></div>';
    loadAllSections();
  });
}

// ---- Add Page ----
function openAddPageModal(sectionId) {
  openModal(
    '<h3>Добавить страницу</h3>' +
    '<div class="form-group"><label>Заголовок страницы</label><input id="mPageTitle"></div>' +
    '<div class="form-group"><label>Имя (для карточек героев/генералов)</label><input id="mPageName"></div>' +
    '<div class="form-group"><label>Звание/ранг</label><input id="mPageRank"></div>' +
    '<div class="form-group"><label>Шаблон</label><select id="mPageTemplate">' +
      '<option value="default">Стандартный (1 фото + текст)</option>' +
      '<option value="two_landscape">2 фото альбомных + текст</option>' +
      '<option value="one_portrait">1 фото книжное + текст</option>' +
    '</select></div>' +
    '<div class="form-group"><label>Фото 1</label>' +
      '<div class="photo-upload"><input type="file" id="mPageFile1" accept="image/*" onchange="previewUpload(this,\'mPagePhotoPreview1\')">' +
      '<img id="mPagePhotoPreview1" class="photo-preview" style="display:none"></div>' +
      '<input id="mPagePhoto" placeholder="Или введите путь к фото">' +
    '</div>' +
    '<div class="form-group"><label>Фото 2 (для шаблона с 2 фото)</label>' +
      '<div class="photo-upload"><input type="file" id="mPageFile2" accept="image/*" onchange="previewUpload(this,\'mPagePhotoPreview2\')">' +
      '<img id="mPagePhotoPreview2" class="photo-preview" style="display:none"></div>' +
      '<input id="mPagePhoto2" placeholder="Или введите путь к фото 2">' +
    '</div>' +
    '<div class="form-group"><label>Текст (биография/описание)</label><textarea id="mPageBio" rows="8"></textarea></div>' +
    '<div class="form-group"><label>Порядок сортировки</label><input id="mPageOrder" type="number" value="0"></div>' +
    '<div class="modal-actions">' +
      '<button class="btn btn-primary" onclick="saveNewPage(' + sectionId + ')">Создать</button>' +
      '<button class="btn btn-outline" onclick="closeModal()">Отмена</button>' +
    '</div>'
  );
}

function previewUpload(input, previewId) {
  if (input.files && input.files[0]) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = document.getElementById(previewId);
      img.src = e.target.result;
      img.style.display = 'block';
    };
    reader.readAsDataURL(input.files[0]);
  }
}

function uploadFile(fileInput) {
  return new Promise(function(resolve) {
    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
      resolve(null);
      return;
    }
    var form = new FormData();
    form.append('photo', fileInput.files[0]);
    fetch('/api/admin/upload', { method: 'POST', body: form })
      .then(function(r) { return r.json(); })
      .then(function(d) { resolve(d.url); })
      .catch(function() { resolve(null); });
  });
}

function saveNewPage(sectionId) {
  var file1 = document.getElementById('mPageFile1');
  var file2 = document.getElementById('mPageFile2');

  Promise.all([uploadFile(file1), uploadFile(file2)]).then(function(urls) {
    var data = {
      section_id: sectionId,
      title: document.getElementById('mPageTitle').value,
      name: document.getElementById('mPageName').value,
      rank: document.getElementById('mPageRank').value,
      template: document.getElementById('mPageTemplate').value,
      photo: urls[0] || document.getElementById('mPagePhoto').value,
      photo2: urls[1] || document.getElementById('mPagePhoto2').value,
      bio: document.getElementById('mPageBio').value,
      sort_order: parseInt(document.getElementById('mPageOrder').value) || 0
    };
    fetch('/api/admin/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function(r) {
      if (r.ok) { closeModal(); selectSection(sectionId); }
      else r.json().then(function(d) { alert(d.error); });
    });
  });
}

// ---- Edit Page ----
function openEditPageModal(pageId) {
  fetch('/api/admin/pages').then(function(r) { return r.json(); }).then(function(allPages) {
    var p = allPages.find(function(x) { return x.id === pageId; });
    if (!p) return;

    openModal(
      '<h3>Редактировать страницу</h3>' +
      '<div class="form-group"><label>Заголовок</label><input id="mPageTitle" value="' + esc(p.title) + '"></div>' +
      '<div class="form-group"><label>Имя</label><input id="mPageName" value="' + esc(p.name) + '"></div>' +
      '<div class="form-group"><label>Звание</label><input id="mPageRank" value="' + esc(p.rank) + '"></div>' +
      '<div class="form-group"><label>Шаблон</label><select id="mPageTemplate">' +
        '<option value="default" ' + (p.template === 'default' ? 'selected' : '') + '>Стандартный</option>' +
        '<option value="two_landscape" ' + (p.template === 'two_landscape' ? 'selected' : '') + '>2 фото альбомных</option>' +
        '<option value="one_portrait" ' + (p.template === 'one_portrait' ? 'selected' : '') + '>1 фото книжное</option>' +
      '</select></div>' +
      '<div class="form-group"><label>Фото 1</label>' +
        (p.photo ? '<img src="' + esc(p.photo) + '" style="max-width:100px;max-height:80px;display:block;margin-bottom:.5rem;border-radius:4px" onerror="this.style.display=\'none\'">' : '') +
        '<div class="photo-upload"><input type="file" id="mPageFile1" accept="image/*" onchange="previewUpload(this,\'mPagePhotoPreview1\')">' +
        '<img id="mPagePhotoPreview1" class="photo-preview" style="display:none"></div>' +
        '<input id="mPagePhoto" value="' + esc(p.photo) + '" placeholder="Путь к фото">' +
      '</div>' +
      '<div class="form-group"><label>Фото 2</label>' +
        (p.photo2 ? '<img src="' + esc(p.photo2) + '" style="max-width:100px;max-height:80px;display:block;margin-bottom:.5rem;border-radius:4px" onerror="this.style.display=\'none\'">' : '') +
        '<div class="photo-upload"><input type="file" id="mPageFile2" accept="image/*" onchange="previewUpload(this,\'mPagePhotoPreview2\')">' +
        '<img id="mPagePhotoPreview2" class="photo-preview" style="display:none"></div>' +
        '<input id="mPagePhoto2" value="' + esc(p.photo2 || '') + '" placeholder="Путь к фото 2">' +
      '</div>' +
      '<div class="form-group"><label>Текст</label><textarea id="mPageBio" rows="10">' + esc(p.bio) + '</textarea></div>' +
      '<div class="form-group"><label>Порядок</label><input id="mPageOrder" type="number" value="' + p.sort_order + '"></div>' +
      '<div class="modal-actions">' +
        '<button class="btn btn-primary" onclick="saveEditPage(' + pageId + ',' + p.section_id + ')">Сохранить</button>' +
        '<button class="btn btn-outline" onclick="closeModal()">Отмена</button>' +
      '</div>'
    );
  });
}

function saveEditPage(pageId, sectionId) {
  var file1 = document.getElementById('mPageFile1');
  var file2 = document.getElementById('mPageFile2');

  Promise.all([uploadFile(file1), uploadFile(file2)]).then(function(urls) {
    var data = {
      title: document.getElementById('mPageTitle').value,
      name: document.getElementById('mPageName').value,
      rank: document.getElementById('mPageRank').value,
      template: document.getElementById('mPageTemplate').value,
      photo: urls[0] || document.getElementById('mPagePhoto').value,
      photo2: urls[1] || document.getElementById('mPagePhoto2').value,
      bio: document.getElementById('mPageBio').value,
      sort_order: parseInt(document.getElementById('mPageOrder').value) || 0
    };
    fetch('/api/admin/pages/' + pageId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function(r) {
      if (r.ok) { closeModal(); selectSection(sectionId); }
    });
  });
}

function deletePage(pageId, sectionId) {
  if (!confirm('Удалить эту страницу?')) return;
  fetch('/api/admin/pages/' + pageId, { method: 'DELETE' }).then(function() {
    selectSection(sectionId);
  });
}

// ============ HELPERS ============
function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
