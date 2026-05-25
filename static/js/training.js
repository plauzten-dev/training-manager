/* ── training.js ──────────────────────────────────────────────────────────── */

const MONTHS_DE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const SPORT_BG_CLASS = {
  'Fußball':  'sport-bg-fussball',
  'Tennis':   'sport-bg-tennis',
  'Floorball':'sport-bg-floorball',
};
const SPORT_FIELD_SVG_SM = {
  'Fußball':   `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.4"><rect x="2" y="5" width="24" height="18" rx="1"/><line x1="14" y1="5" x2="14" y2="23"/><circle cx="14" cy="14" r="4"/></svg>`,
  'Tennis':    `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.4"><rect x="2" y="2" width="24" height="24" rx="1"/><line x1="14" y1="2" x2="14" y2="26"/><line x1="2" y1="14" x2="26" y2="14"/></svg>`,
  'Floorball': `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.4"><rect x="2" y="5" width="24" height="18" rx="6"/><circle cx="14" cy="14" r="3.5"/><line x1="14" y1="5" x2="14" y2="23"/></svg>`,
  'default':   `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.4"><circle cx="14" cy="14" r="10"/><circle cx="14" cy="14" r="4"/></svg>`,
};

let training = null;
let notesTimer = null;

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  await loadTraining();
}

async function loadTraining() {
  const res = await fetch(`/api/trainings/${TRAINING_ID}`);
  if (!res.ok) {
    document.getElementById('training-page-content').innerHTML = `
      <div class="empty-state" style="margin-top:80px">
        <h3>Training nicht gefunden</h3>
        <p>Dieses Training existiert nicht oder gehört dir nicht.</p>
        <a href="/calendar" class="btn btn-primary" style="margin-top:12px">Zum Kalender</a>
      </div>`;
    return;
  }
  training = await res.json();
  renderPage();
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderPage() {
  const dateObj = new Date(training.date + 'T00:00:00');
  const displayDate = `${dateObj.getDate()}. ${MONTHS_DE[dateObj.getMonth()]} ${dateObj.getFullYear()}`;

  document.getElementById('training-page-content').innerHTML = `
    <div class="training-page-layout">

      <!-- Header -->
      <div class="training-header-card">
        <div class="training-title-block">
          <h1 id="training-title-display">${escHtml(training.title)}</h1>
          <div class="training-date-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            ${displayDate}
          </div>
        </div>
        <div class="training-actions">
          <button class="btn btn-ghost btn-sm" onclick="showEditModal()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Bearbeiten
          </button>
          <a href="/training/${TRAINING_ID}/pdf" target="_blank" class="btn btn-ghost btn-sm" title="Als PDF exportieren">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            PDF
          </a>
          <button class="btn btn-danger btn-sm" onclick="confirmDeleteTraining()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
          <a href="/calendar" class="btn btn-ghost btn-sm">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
            Kalender
          </a>
        </div>
      </div>

      <!-- Notes -->
      <div class="training-notes-card">
        <div class="notes-label">Notizen</div>
        <textarea class="notes-textarea" id="notes-area" placeholder="Notizen zum Training..."
          oninput="scheduleNotesSave()">${escHtml(training.notes || '')}</textarea>
        <div class="notes-save-row">
          <span id="notes-status" style="font-size:0.78rem;color:var(--text-muted)"></span>
        </div>
      </div>

      <!-- Exercises -->
      <div class="exercises-section">
        <div class="section-header">
          <span class="section-title">Übungen</span>
          <span class="section-count" id="ex-count">${training.exercises.length} Übung${training.exercises.length !== 1 ? 'en' : ''}</span>
        </div>
        <div class="exercise-list" id="exercise-list">
          ${renderExerciseList()}
        </div>
        <button class="add-exercise-btn" onclick="showAddExerciseModal()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Übung hinzufügen
        </button>
      </div>

    </div>`;
  attachDragHandlers();
}

function renderExerciseList() {
  if (!training.exercises.length) {
    return `<div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5"><path d="M2 20h20M6 20V10M12 20V4M18 20v-6"/></svg>
      <p>Noch keine Übungen hinzugefügt.</p>
    </div>`;
  }
  return training.exercises.map((e, i) => exerciseItemHTML(e, i)).join('');
}

const PLAYER_ICON_SM = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg>`;
const GK_ICON_SM     = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="10" rx="1"/><path d="M10 11V8a2 2 0 1 1 4 0v3"/></svg>`;

const DRAG_HANDLE_SVG = `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="4" cy="3" r="1.2"/><circle cx="10" cy="3" r="1.2"/><circle cx="4" cy="7" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="4" cy="11" r="1.2"/><circle cx="10" cy="11" r="1.2"/></svg>`;

function exerciseItemHTML(e, i) {
  const bgClass  = SPORT_BG_CLASS[e.sport] || 'sport-bg-default';
  const svgSmall = SPORT_FIELD_SVG_SM[e.sport] || SPORT_FIELD_SVG_SM['default'];
  const thumbHTML = e.image_path
    ? `<img src="${e.image_path.startsWith('http') ? e.image_path : '/uploads/' + e.image_path}" alt="${escHtml(e.title)}">`
    : `<div class="field-placeholder ${bgClass}" style="width:100%;height:100%">${svgSmall}</div>`;

  return `
    <div class="exercise-list-item" id="ex-item-${e.id}" draggable="true" data-id="${e.id}">
      <div class="drag-handle" title="Ziehen zum Sortieren">${DRAG_HANDLE_SVG}</div>
      <div class="exercise-list-thumb">${thumbHTML}</div>
      <div class="exercise-list-info">
        <div class="exercise-list-title">${escHtml(e.title)}</div>
        <div class="exercise-list-meta">
          <span>${PLAYER_ICON_SM} ${e.field_players}</span>
          <span>${GK_ICON_SM} ${e.goalkeepers}</span>
          <span>${escHtml(e.core_competency)}</span>
          <span class="badge ${diffBadge(e.difficulty)}" style="font-size:0.7rem">${e.difficulty}</span>
        </div>
      </div>
      <button class="exercise-list-remove" title="Entfernen" onclick="removeExercise(${e.id})">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`;
}

function diffBadge(d) {
  return { 'Anfänger':'diff-Anfänger','Fortgeschritten':'diff-Fortgeschritten','Profi':'diff-Profi' }[d] || 'badge-gray';
}

// ── Notes ─────────────────────────────────────────────────────────────────────
function scheduleNotesSave() {
  clearTimeout(notesTimer);
  document.getElementById('notes-status').textContent = 'Änderungen...';
  notesTimer = setTimeout(saveNotes, 1200);
}

async function saveNotes() {
  const notes = document.getElementById('notes-area').value;
  const res = await fetch(`/api/trainings/${TRAINING_ID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: training.title, date: training.date, notes })
  });
  if (res.ok) {
    training.notes = notes;
    document.getElementById('notes-status').textContent = '✓ Gespeichert';
    setTimeout(() => {
      const el = document.getElementById('notes-status');
      if (el) el.textContent = '';
    }, 2000);
  }
}

// ── Edit Training Modal ───────────────────────────────────────────────────────
function showEditModal() {
  openModal('Training bearbeiten', `
    <form id="edit-training-form" onsubmit="submitEditTraining(event)">
      <div class="form-group">
        <label>Titel *</label>
        <input type="text" name="title" value="${escHtml(training.title)}" required>
      </div>
      <div class="form-group">
        <label>Datum *</label>
        <input type="date" name="date" value="${training.date}" required>
      </div>
      <div class="form-group">
        <label>Notizen</label>
        <textarea name="notes">${escHtml(training.notes || '')}</textarea>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
        <button type="submit" class="btn btn-primary">Speichern</button>
      </div>
    </form>`);
}

async function submitEditTraining(e) {
  e.preventDefault();
  const form = e.target;
  const res = await fetch(`/api/trainings/${TRAINING_ID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: form.title.value, date: form.date.value, notes: form.notes.value })
  });
  if (res.ok) {
    training.title = form.title.value;
    training.date  = form.date.value;
    training.notes = form.notes.value;
    closeModal();
    renderPage();
    showToast('Training aktualisiert!', 'success');
  } else {
    showToast('Fehler', 'error');
  }
}

// ── Delete Training ───────────────────────────────────────────────────────────
function confirmDeleteTraining() {
  openModal('Training löschen', `
    <p style="margin-bottom:20px;color:var(--text-muted)">
      Möchtest du das Training <strong>"${escHtml(training.title)}"</strong> wirklich löschen?
      Alle Übungszuordnungen werden ebenfalls gelöscht.
    </p>
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-danger" onclick="doDeleteTraining()">Training löschen</button>
    </div>`);
}

async function doDeleteTraining() {
  const res = await fetch(`/api/trainings/${TRAINING_ID}`, { method: 'DELETE' });
  if (res.ok) {
    window.location.href = '/calendar';
  } else {
    showToast('Fehler beim Löschen', 'error');
  }
}

// ── Add Exercise Modal ────────────────────────────────────────────────────────
async function showAddExerciseModal() {
  openModal('Übung hinzufügen', `
    <div>
      <input type="text" id="picker-search" class="filter-input" placeholder="Übung suchen..."
        oninput="filterPickerCards()" style="margin-bottom:14px;width:100%">
      <div class="exercise-picker-grid" id="picker-grid">
        <div class="loading-spinner" style="grid-column:1/-1"><div class="spinner"></div></div>
      </div>
    </div>`, 'xl');

  const res = await fetch('/api/exercises');
  if (!res.ok) { showToast('Fehler beim Laden', 'error'); return; }
  const exercises = await res.json();
  const addedIds = new Set(training.exercises.map(e => e.id));
  renderPickerCards(exercises, addedIds);
}

function renderPickerCards(exercises, addedIds) {
  const grid = document.getElementById('picker-grid');
  if (!exercises.length) {
    grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:20px">Keine Übungen vorhanden</p>`;
    return;
  }
  grid.innerHTML = exercises.map(e => {
    const added    = addedIds?.has(e.id);
    const bgClass  = SPORT_BG_CLASS[e.sport] || 'sport-bg-default';
    const svgSmall = SPORT_FIELD_SVG_SM[e.sport] || SPORT_FIELD_SVG_SM['default'];
    const imgHTML  = e.image_path
      ? `<img src="${e.image_path.startsWith('http') ? e.image_path : '/uploads/' + e.image_path}" alt="" style="width:100%;height:100%;object-fit:cover">`
      : `<div class="field-placeholder ${bgClass}" style="width:100%;height:100%">${svgSmall}</div>`;
    return `
      <div class="picker-card ${added ? 'already-added' : ''}" onclick="${added ? '' : `addExercise(${e.id})`}"
           data-title="${escHtml(e.title).toLowerCase()}">
        <div class="picker-card-img">${imgHTML}</div>
        <div class="picker-card-body">
          <div class="picker-card-title">${escHtml(e.title)}</div>
          <div class="picker-card-meta">👥 ${e.field_players} · 🧤 ${e.goalkeepers} · ${e.difficulty}</div>
          ${added ? '<div style="color:var(--success);font-size:0.72rem;font-weight:700;margin-top:4px">✓ Bereits hinzugefügt</div>' : ''}
        </div>
      </div>`;
  }).join('');
}

function filterPickerCards() {
  const q = document.getElementById('picker-search').value.toLowerCase();
  document.querySelectorAll('.picker-card').forEach(card => {
    card.style.display = card.dataset.title?.includes(q) ? '' : 'none';
  });
}

async function addExercise(exerciseId) {
  const res = await fetch(`/api/trainings/${TRAINING_ID}/exercises`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exercise_id: exerciseId })
  });
  if (res.ok) {
    showToast('Übung hinzugefügt!', 'success');
    closeModal();
    await loadTraining();
  } else {
    const d = await res.json();
    showToast(d.error || 'Fehler', 'error');
  }
}

async function removeExercise(exerciseId) {
  const res = await fetch(`/api/trainings/${TRAINING_ID}/exercises/${exerciseId}`, { method: 'DELETE' });
  if (res.ok) {
    training.exercises = training.exercises.filter(e => e.id !== exerciseId);
    document.getElementById('exercise-list').innerHTML = renderExerciseList();
    document.getElementById('ex-count').textContent =
      `${training.exercises.length} Übung${training.exercises.length !== 1 ? 'en' : ''}`;
    attachDragHandlers();
    showToast('Übung entfernt', 'info');
  } else {
    showToast('Fehler', 'error');
  }
}

// ── Drag & Drop ───────────────────────────────────────────────────────────────
let dragSrcId = null;

function attachDragHandlers() {
  const list = document.getElementById('exercise-list');
  if (!list) return;

  list.querySelectorAll('.exercise-list-item[draggable]').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      dragSrcId = item.dataset.id;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      list.querySelectorAll('.exercise-list-item').forEach(i => i.classList.remove('drag-over'));
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (item.dataset.id !== dragSrcId) {
        list.querySelectorAll('.exercise-list-item').forEach(i => i.classList.remove('drag-over'));
        item.classList.add('drag-over');
      }
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      if (item.dataset.id === dragSrcId) return;

      const srcIdx = training.exercises.findIndex(ex => String(ex.id) === dragSrcId);
      const dstIdx = training.exercises.findIndex(ex => String(ex.id) === item.dataset.id);
      const [moved] = training.exercises.splice(srcIdx, 1);
      training.exercises.splice(dstIdx, 0, moved);

      document.getElementById('exercise-list').innerHTML = renderExerciseList();
      attachDragHandlers();
      saveDragOrder();
    });
  });
}

async function saveDragOrder() {
  const order = training.exercises.map(e => e.id);
  const res = await fetch(`/api/trainings/${TRAINING_ID}/exercises/reorder`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order })
  });
  if (!res.ok) showToast('Reihenfolge konnte nicht gespeichert werden', 'error');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

init();
