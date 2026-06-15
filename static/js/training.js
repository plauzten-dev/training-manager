/* ── training.js ──────────────────────────────────────────────────────────── */

const MONTHS_DE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const SPORT_BG_CLASS = {
  'Fußball':   'sport-bg-fussball',
  'Tennis':    'sport-bg-tennis',
  'Floorball': 'sport-bg-floorball',
  'Basketball':'sport-bg-basketball',
  'Volleyball':'sport-bg-volleyball',
  'Gym':       'sport-bg-gym',
  'Allgemein': 'sport-bg-allgemein',
};

// Trainings-Blöcke (Design: nummerierte Blöcke)
const BLOCK_ORDER  = ['Aufwärmen', 'Hauptteil', 'Abschluss'];
const BLOCK_COLORS = { 'Aufwärmen': '#3b82f6', 'Hauptteil': '#16a34a', 'Abschluss': '#7c3aed' };

// Aktive Trainingseinheit: häufigste Sportart der enthaltenen Übungen
function dominantSport() {
  const counts = {};
  (training.exercises || []).forEach(e => { counts[e.sport] = (counts[e.sport] || 0) + 1; });
  let best = null, bestN = 0;
  for (const s in counts) { if (counts[s] > bestN) { best = s; bestN = counts[s]; } }
  return best || 'Allgemein';
}

function blockOf(e) { return BLOCK_ORDER.includes(e.block) ? e.block : 'Hauptteil'; }
const SPORT_FIELD_SVG_SM = {
  'Fußball':   `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.4"><rect x="2" y="5" width="24" height="18" rx="1"/><line x1="14" y1="5" x2="14" y2="23"/><circle cx="14" cy="14" r="4"/></svg>`,
  'Tennis':    `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.4"><rect x="2" y="2" width="24" height="24" rx="1"/><line x1="14" y1="2" x2="14" y2="26"/><line x1="2" y1="14" x2="26" y2="14"/></svg>`,
  'Floorball': `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.4"><rect x="2" y="5" width="24" height="18" rx="6"/><circle cx="14" cy="14" r="3.5"/><line x1="14" y1="5" x2="14" y2="23"/></svg>`,
  'default':   `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.4"><circle cx="14" cy="14" r="10"/><circle cx="14" cy="14" r="4"/></svg>`,
};

let training    = null;
let notesTimer  = null;
let attTeamId   = null;
let attTeams    = [];

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  await loadTraining();
  if (USER_ROLE === 'trainer') {
    fetchAttTeams();
  } else if (USER_ROLE === 'player') {
    loadMyAttendance();
  }
  // private: keine Anwesenheit
}

async function fetchAttTeams() {
  const res = await fetch('/api/teams');
  if (!res.ok) return;
  attTeams = await res.json();
  const saved = localStorage.getItem(`att_team_${TRAINING_ID}`);
  if (saved) attTeamId = parseInt(saved) || null;
  renderAttTeamSelect();
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
  // canEdit: Trainer immer, Privat immer, Spieler nur bei eigenem Training
  const canEdit = USER_ROLE === 'trainer' || USER_ROLE === 'private' || (USER_ROLE === 'player' && training.owned_by_me);
  const isTrainerTraining = USER_ROLE === 'player' && !training.owned_by_me;
  window._canEdit = canEdit;
  window._isTrainerTraining = isTrainerTraining;
  const dateObj = new Date(training.date + 'T00:00:00');
  const displayDate = `${dateObj.getDate()}. ${MONTHS_DE[dateObj.getMonth()]} ${dateObj.getFullYear()}`;

  const sport     = dominantSport();
  const sportCls  = SPORT_BG_CLASS[sport] || 'sport-bg-allgemein';
  const today     = new Date(); today.setHours(0,0,0,0);
  const isToday   = dateObj.getTime() === today.getTime();
  const tomorrow  = new Date(today); tomorrow.setDate(today.getDate()+1);
  const relDate   = isToday ? 'Heute' : (dateObj.getTime() === tomorrow.getTime() ? 'Morgen' : displayDate);
  const metaParts = [sport, relDate + (training.time ? ' ' + training.time : '')];
  const totalMin  = training.exercises.reduce((s,e) => s + (parseInt(e.duration) || 0), 0);
  const blockCnt  = new Set(training.exercises.map(blockOf)).size;
  const exCnt     = training.exercises.length;

  // Verlauf-Panel-Inhalt je nach Rolle
  let verlaufHTML;
  if (USER_ROLE === 'trainer') {
    verlaufHTML = `
      <div class="attendance-section" id="attendance-section">
        <div class="section-header">
          <span class="section-title">Anwesenheit</span>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="section-count" id="attendance-count"></span>
            <button class="att-reload-btn" id="att-reload-btn" onclick="reloadAttendance()" title="Anwesenheiten aktualisieren">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            </button>
          </div>
        </div>
        <div class="att-team-row" id="att-team-row" style="display:none">
          <select class="att-team-select" id="att-team-select" onchange="onAttTeamChange(this.value)">
            <option value="">Alle Spieler</option>
          </select>
          <button class="att-all-btn" onclick="setAllPresent(true)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Ganzes Team anwesend
          </button>
        </div>
        <div id="attendance-list">
          <div style="padding:10px 0;text-align:center">
            <div class="spinner" style="width:22px;height:22px;border-width:2px;margin:0 auto"></div>
          </div>
        </div>
      </div>`;
  } else if (isTrainerTraining) {
    verlaufHTML = `
      <div class="attendance-section" id="attendance-section">
        <div class="section-header"><span class="section-title">Meine Anwesenheit</span></div>
        <div id="my-attendance-block" style="padding:8px 0">
          <div class="spinner" style="width:20px;height:20px;border-width:2px;margin:0 auto"></div>
        </div>
      </div>`;
  } else {
    verlaufHTML = `
      <div class="td-empty">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg>
        <p>Für private Trainings wird keine Anwesenheit erfasst.</p>
      </div>`;
  }

  const notesHTML = canEdit
    ? `<textarea class="notes-textarea" id="notes-area" placeholder="Notizen zum Training..."
         oninput="scheduleNotesSave()">${escHtml(training.notes || '')}</textarea>
       <div class="notes-save-row"><span id="notes-status" style="font-size:0.78rem;color:var(--text-muted)"></span></div>`
    : `<div class="notes-readonly">${training.notes ? escHtml(training.notes) : '<span style="color:var(--text-muted);font-size:0.85rem">Keine Notizen</span>'}</div>`;

  document.getElementById('training-page-content').innerHTML = `
    <div class="td-page">

      <!-- Topbar -->
      <div class="td-topbar">
        <a href="/my-trainings" class="td-iconbtn" title="Zurück">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="15 18 9 12 15 6"/></svg>
        </a>
        <div class="td-topbar-right">
          ${canEdit ? `<button class="td-iconbtn" onclick="duplicateTraining()" title="Training duplizieren">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>` : ''}
          ${canEdit ? `<button class="td-iconbtn" onclick="showEditModal()" title="Bearbeiten">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>` : ''}
          <a href="/training/${TRAINING_ID}/pdf" target="_blank" class="td-iconbtn" title="Als PDF exportieren">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          </a>
          ${canEdit ? `<button class="td-iconbtn td-iconbtn-danger" onclick="confirmDeleteTraining()" title="Löschen">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>` : ''}
        </div>
      </div>

      <!-- Titel -->
      <div class="td-titlerow">
        <div class="td-sport-icon ${sportCls}">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M2 20h20M6 20V10M12 20V4M18 20v-6"/></svg>
        </div>
        <div class="td-titletext">
          <h1 class="td-title" id="training-title-display">${escHtml(training.title)}</h1>
          <div class="td-meta">${metaParts.map(escHtml).join(' · ')}</div>
        </div>
      </div>

      <!-- Stats -->
      <div class="td-stats">
        <div class="td-stat"><b id="td-stat-min">${totalMin}</b><span>Minuten</span></div>
        <div class="td-stat"><b id="td-stat-ex">${exCnt}</b><span>Übungen</span></div>
        <div class="td-stat"><b id="td-stat-blocks">${blockCnt}</b><span>Blöcke</span></div>
      </div>

      <!-- Tabs -->
      <div class="td-tabs">
        <button class="td-tab active" data-tab="ex" onclick="switchTab('ex')">Übungen</button>
        <button class="td-tab" data-tab="verlauf" onclick="switchTab('verlauf')">Verlauf</button>
        <button class="td-tab" data-tab="notes" onclick="switchTab('notes')">Notizen</button>
      </div>

      <!-- Panel: Übungen -->
      <div class="td-panel" id="td-panel-ex">
        ${renderBlocks()}
        ${canEdit ? `<button class="add-exercise-btn" onclick="showAddExerciseModal()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Übung hinzufügen
        </button>` : ''}
      </div>

      <!-- Panel: Verlauf -->
      <div class="td-panel hidden" id="td-panel-verlauf">${verlaufHTML}</div>

      <!-- Panel: Notizen -->
      <div class="td-panel hidden" id="td-panel-notes">
        <div class="training-notes-card">${notesHTML}</div>
      </div>

    </div>
    ${training.exercises.length ? `<div class="td-footer"><button class="td-start-btn" onclick="startTraining()">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 4 20 12 6 20 6 4"/></svg>
      Training starten
    </button></div>` : ''}`;
  attachDragHandlers();
  loadAttendance();
}

// Tab-Wechsel
function switchTab(tab) {
  document.querySelectorAll('.td-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('td-panel-ex').classList.toggle('hidden', tab !== 'ex');
  document.getElementById('td-panel-verlauf').classList.toggle('hidden', tab !== 'verlauf');
  document.getElementById('td-panel-notes').classList.toggle('hidden', tab !== 'notes');
}

// Blöcke rendern (nummerierte Karten mit ihren Übungen)
function renderBlocks() {
  if (!training.exercises.length) {
    return `<div class="td-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5"><path d="M2 20h20M6 20V10M12 20V4M18 20v-6"/></svg>
      <p>Noch keine Übungen hinzugefügt.</p>
    </div>`;
  }
  const present = BLOCK_ORDER.filter(b => training.exercises.some(e => blockOf(e) === b));
  return present.map((block, idx) => {
    const items = training.exercises.filter(e => blockOf(e) === block);
    const min   = items.reduce((s,e) => s + (parseInt(e.duration) || 0), 0);
    const color = BLOCK_COLORS[block];
    return `
      <div class="td-block">
        <div class="td-block-head">
          <span class="td-block-num" style="background:${color}">${idx + 1}</span>
          <div class="td-block-title">
            <span class="td-block-name">${block}</span>
            <span class="td-block-sub">${items.length} Übung${items.length !== 1 ? 'en' : ''}${min ? ` · ${min} Min` : ''}</span>
          </div>
          ${min ? `<span class="td-block-min">${min} Min</span>` : ''}
        </div>
        <div class="exercise-list td-block-list" data-block="${block}">
          ${items.map(e => exerciseItemHTML(e)).join('')}
        </div>
      </div>`;
  }).join('');
}

// Übungs-Panel neu rendern (nach Änderung von Block/Dauer/Reihenfolge)
function refreshExPanel() {
  const panel = document.getElementById('td-panel-ex');
  if (panel) {
    const addBtn = window._canEdit ? `<button class="add-exercise-btn" onclick="showAddExerciseModal()">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Übung hinzufügen</button>` : '';
    panel.innerHTML = renderBlocks() + addBtn;
    attachDragHandlers();
  }
  refreshStats();
}

function refreshStats() {
  const totalMin = training.exercises.reduce((s,e) => s + (parseInt(e.duration) || 0), 0);
  const blockCnt = new Set(training.exercises.map(blockOf)).size;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('td-stat-min', totalMin);
  set('td-stat-ex', training.exercises.length);
  set('td-stat-blocks', blockCnt);
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

  const metaCtrls = window._canEdit ? `
        <div class="ex-meta-ctrls" onclick="event.stopPropagation()">
          <select class="ex-block-sel" onchange="updateExerciseMeta(${e.id}, 'block', this.value)">
            ${BLOCK_ORDER.map(b => `<option value="${b}"${blockOf(e) === b ? ' selected' : ''}>${b}</option>`).join('')}
          </select>
          <span class="ex-min-wrap">
            <input type="number" min="0" max="240" class="ex-min-input" placeholder="–"
                   value="${e.duration != null ? e.duration : ''}"
                   onchange="updateExerciseMeta(${e.id}, 'duration', this.value)">
            <span>Min</span>
          </span>
        </div>` : '';

  return `
    <div class="exercise-list-item" id="ex-item-${e.id}" ${window._canEdit ? 'draggable="true"' : ''} data-id="${e.id}">
      ${window._canEdit ? `<div class="drag-handle" title="Ziehen zum Sortieren">${DRAG_HANDLE_SVG}</div>` : ''}
      <div class="exercise-list-thumb">${thumbHTML}</div>
      <div class="exercise-list-info">
        <div class="exercise-list-title">${escHtml(e.title)}</div>
        <div class="exercise-list-meta">
          <span>${PLAYER_ICON_SM} ${e.field_players}</span>
          <span>${GK_ICON_SM} ${e.goalkeepers}</span>
          <span>${escHtml(e.core_competency)}</span>
          <span class="badge ${diffBadge(e.difficulty)}" style="font-size:0.7rem">${e.difficulty}</span>
        </div>
        ${metaCtrls}
      </div>
      ${window._canEdit ? `
      <button class="exercise-list-remove" title="Entfernen" onclick="removeExercise(${e.id})">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>` : ''}
    </div>`;
}

// Block/Dauer einer Übung im Training aktualisieren
async function updateExerciseMeta(exerciseId, field, value) {
  const ex = training.exercises.find(e => e.id === exerciseId);
  if (!ex) return;
  if (field === 'duration') ex.duration = value === '' ? null : (parseInt(value) || 0);
  else ex.block = value;
  const res = await fetch(`/api/trainings/${TRAINING_ID}/exercises/${exerciseId}/meta`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [field]: value })
  });
  if (!res.ok) { showToast('Fehler beim Speichern', 'error'); return; }
  refreshExPanel();
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
      <div class="form-row" style="display:flex;gap:10px">
        <div class="form-group" style="flex:1">
          <label>Datum *</label>
          <input type="date" name="date" value="${training.date}" required>
        </div>
        <div class="form-group" style="flex:1">
          <label>Uhrzeit</label>
          <input type="time" name="time" value="${escHtml(training.time || '')}">
        </div>
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
    body: JSON.stringify({ title: form.title.value, date: form.date.value, time: form.time.value, notes: form.notes.value })
  });
  if (res.ok) {
    training.title = form.title.value;
    training.date  = form.date.value;
    training.time  = form.time.value || null;
    training.notes = form.notes.value;
    closeModal();
    renderPage();
    showToast('Training aktualisiert!', 'success');
  } else {
    showToast('Fehler', 'error');
  }
}

// Training duplizieren (Kopie mit neuem Datum)
async function duplicateTraining() {
  const res = await fetch(`/api/trainings/${TRAINING_ID}/duplicate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: training.date })
  });
  if (res.ok) {
    const t = await res.json();
    showToast('Training dupliziert!', 'success');
    window.location.href = `/training/${t.id}`;
  } else {
    showToast('Fehler beim Duplizieren', 'error');
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
      <div class="picker-block-row">
        <label>Block:</label>
        <select id="picker-block">
          ${BLOCK_ORDER.map(b => `<option value="${b}"${b === 'Hauptteil' ? ' selected' : ''}>${b}</option>`).join('')}
        </select>
      </div>
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
  const block = document.getElementById('picker-block')?.value || 'Hauptteil';
  const res = await fetch(`/api/trainings/${TRAINING_ID}/exercises`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exercise_id: exerciseId, block })
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
    refreshExPanel();
    showToast('Übung entfernt', 'info');
  } else {
    showToast('Fehler', 'error');
  }
}

// ── Drag & Drop (Mouse + Touch) ───────────────────────────────────────────────
let dragSrcId    = null;
let touchDragId  = null;
let touchClone   = null;
let touchOffX    = 0;
let touchOffY    = 0;

function attachDragHandlers() {
  const lists = document.querySelectorAll('.exercise-list');
  if (!lists.length) return;

  document.querySelectorAll('.exercise-list .exercise-list-item[draggable]').forEach(item => {
    const list = item.closest('.exercise-list');
    // ── Mouse drag ──
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
      reorderExercises(dragSrcId, item.dataset.id);
    });

    // ── Touch drag (nur auf dem Handle) ──
    item.querySelector('.drag-handle')?.addEventListener('touchstart', onTouchStart, { passive: false });
  });
}

function onTouchStart(e) {
  e.preventDefault();
  const item = e.currentTarget.closest('.exercise-list-item');
  if (!item) return;
  touchDragId = item.dataset.id;

  const touch = e.touches[0];
  const rect  = item.getBoundingClientRect();
  touchOffX   = touch.clientX - rect.left;
  touchOffY   = touch.clientY - rect.top;

  touchClone = item.cloneNode(true);
  Object.assign(touchClone.style, {
    position: 'fixed', left: rect.left + 'px', top: rect.top + 'px',
    width: rect.width + 'px', zIndex: '9999', opacity: '0.88',
    pointerEvents: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
    borderRadius: '10px', background: 'white', transition: 'none',
  });
  item.style.opacity = '0.3';
  document.body.appendChild(touchClone);

  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('touchend',  onTouchEnd);
}

function onTouchMove(e) {
  e.preventDefault();
  if (!touchClone) return;
  const touch = e.touches[0];
  touchClone.style.left = (touch.clientX - touchOffX) + 'px';
  touchClone.style.top  = (touch.clientY - touchOffY) + 'px';

  touchClone.style.display = 'none';
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  touchClone.style.display = '';

  document.querySelectorAll('.exercise-list-item').forEach(i => i.classList.remove('drag-over'));
  const over = el?.closest('.exercise-list-item');
  if (over && over.dataset.id !== touchDragId) over.classList.add('drag-over');
}

function onTouchEnd(e) {
  document.removeEventListener('touchmove', onTouchMove);
  document.removeEventListener('touchend',  onTouchEnd);

  if (touchClone) { touchClone.remove(); touchClone = null; }

  document.querySelectorAll('.exercise-list-item').forEach(i => {
    i.classList.remove('drag-over');
    i.style.opacity = '';
  });

  if (!touchDragId) { touchDragId = null; return; }

  const touch  = e.changedTouches[0];
  const el     = document.elementFromPoint(touch.clientX, touch.clientY);
  const over   = el?.closest('.exercise-list-item');
  if (over && over.dataset.id !== touchDragId) reorderExercises(touchDragId, over.dataset.id);

  touchDragId = null;
}

function reorderExercises(srcId, dstId) {
  const srcIdx = training.exercises.findIndex(ex => String(ex.id) === srcId);
  const dstIdx = training.exercises.findIndex(ex => String(ex.id) === dstId);
  if (srcIdx === -1 || dstIdx === -1) return;
  const moved  = training.exercises[srcIdx];
  const target = training.exercises[dstIdx];
  const blockChanged = blockOf(moved) !== blockOf(target);
  moved.block = blockOf(target);   // beim Ziehen in einen anderen Block übernehmen
  training.exercises.splice(srcIdx, 1);
  training.exercises.splice(training.exercises.findIndex(ex => String(ex.id) === dstId), 0, moved);
  refreshExPanel();
  saveDragOrder();
  if (blockChanged) {
    fetch(`/api/trainings/${TRAINING_ID}/exercises/${moved.id}/meta`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ block: moved.block })
    });
  }
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

// ── Player: eigene Anwesenheit ────────────────────────────────────────────────
async function loadMyAttendance() {
  const block = document.getElementById('my-attendance-block');
  if (!block) return;
  const res  = await fetch(`/api/trainings/${TRAINING_ID}/my-attendance`);
  if (!res.ok) { block.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">Fehler beim Laden</p>'; return; }
  const data = await res.json();
  renderMyAttendance(data);
}

function renderMyAttendance(data) {
  const block = document.getElementById('my-attendance-block');
  if (!block) return;
  const present = data.present;
  block.innerHTML = `
    <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:10px">Bist du bei diesem Training dabei?</p>
    <div style="display:flex;gap:8px">
      <button onclick="setMyAttendance(true)" class="btn btn-sm${present === 1 ? ' btn-primary' : ' btn-ghost'}" style="flex:1">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        Ja, ich bin dabei
      </button>
      <button onclick="setMyAttendance(false)" class="btn btn-sm${present === 0 ? ' btn-danger' : ' btn-ghost'}" style="flex:1">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        Nein, ich fehle
      </button>
    </div>`;
}

async function setMyAttendance(present) {
  const res = await fetch(`/api/trainings/${TRAINING_ID}/my-attendance`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ present })
  });
  if (res.ok) {
    const data = await res.json();
    renderMyAttendance({ present: data.present });
    showToast(present ? 'Anwesenheit bestätigt' : 'Abwesenheit vermerkt');
  } else {
    showToast('Fehler beim Speichern', 'error');
  }
}

function reloadAttendance() {
  const btn = document.getElementById('att-reload-btn');
  if (btn) {
    btn.classList.add('att-reload-spinning');
    btn.disabled = true;
    setTimeout(() => { btn.classList.remove('att-reload-spinning'); btn.disabled = false; }, 700);
  }
  loadAttendance();
}

// ── Attendance ────────────────────────────────────────────────────────────────
const ATT_POS_COLORS = {
  'Torwart':    '#f59e0b', 'Verteidiger': '#3b82f6', 'Mittelfeld': '#16a34a',
  'Sturm':      '#ef4444', 'Außen':       '#f97316', 'Universal':  '#8b5cf6',
};

function renderAttTeamSelect() {
  const sel = document.getElementById('att-team-select');
  const row = document.getElementById('att-team-row');
  if (!sel) return;
  if (!attTeams.length) {
    row.style.display = 'flex';
    renderAttendance(null);
    return;
  }
  sel.innerHTML = '<option value="">– Team auswählen –</option>' +
    attTeams.map(t => `<option value="${t.id}">${t.name} · ${t.sport}</option>`).join('');
  if (attTeamId) {
    sel.value = attTeamId;
    if (!sel.value) attTeamId = null; // team no longer exists
  }
  row.style.display = 'flex';
  if (attTeamId) loadAttendance();
  else renderAttendance(null);
}

function onAttTeamChange(val) {
  attTeamId = val ? parseInt(val) : null;
  if (attTeamId) localStorage.setItem(`att_team_${TRAINING_ID}`, attTeamId);
  else localStorage.removeItem(`att_team_${TRAINING_ID}`);
  loadAttendance();
}

async function setAllPresent(present) {
  if (!attTeamId) return;
  const res = await fetch(`/api/trainings/${TRAINING_ID}/attendance/all`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ present, team_id: attTeamId }),
  });
  if (res.ok) {
    const d = await res.json();
    showToast(d.message || 'Gespeichert', 'success');
    loadAttendance();
  } else {
    showToast('Fehler', 'error');
  }
}

async function loadAttendance() {
  const list    = document.getElementById('attendance-list');
  const countEl = document.getElementById('attendance-count');
  if (!attTeamId) {
    renderAttendance(null);
    return;
  }
  const res = await fetch(`/api/trainings/${TRAINING_ID}/attendance?team_id=${attTeamId}`);
  if (!res.ok) return;
  const players = await res.json();
  renderAttendance(players);
}

function renderAttendance(players) {
  const list    = document.getElementById('attendance-list');
  const countEl = document.getElementById('attendance-count');
  if (!list) return;

  // No team selected yet
  if (players === null) {
    list.innerHTML = `
      <div class="att-no-team">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.4">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <p>${attTeams.length ? 'Wähle ein Team aus, um die Spielerliste zu sehen.' : 'Noch kein Team angelegt. <a href="/players" style="color:var(--primary);font-weight:600">Team erstellen</a>'}</p>
      </div>`;
    if (countEl) countEl.textContent = '';
    return;
  }

  if (!players.length) {
    list.innerHTML = `
      <div class="att-no-team">
        <p style="color:var(--text-muted);font-size:0.85rem">
          Dieses Team hat noch keine Spieler. &nbsp;
          <a href="/players" style="color:var(--primary);font-weight:600">Team verwalten</a>
        </p>
      </div>`;
    if (countEl) countEl.textContent = '0 Spieler';
    return;
  }

  const presentCount = players.filter(p => p.present === 1).length;
  if (countEl) countEl.textContent = `${presentCount} / ${players.length} anwesend`;

  list.innerHTML = players.map(p => {
    const color    = ATT_POS_COLORS[p.position] || '#8b5cf6';
    const initials = p.name.trim().split(/\s+/).map(n => n[0]).slice(0, 2).join('').toUpperCase();
    const state    = (p.present === null || p.present === undefined) ? 'none'
                   : (p.present === 1 ? 'present' : 'absent');

    const checkSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
    const crossSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

    let btnInner, btnClass;
    if (state === 'present') { btnInner = `${checkSvg} Anwesend`; btnClass = 'att-present'; }
    else if (state === 'absent') { btnInner = `${crossSvg} Fehlt`; btnClass = 'att-absent'; }
    else { btnInner = 'Markieren'; btnClass = 'att-none'; }

    const injuryDot = p.status !== 'fit'
      ? `<span class="att-injury-dot ${p.status === 'krank' ? 'att-dot-krank' : 'att-dot-verletzt'}" title="${p.status === 'krank' ? 'Krank' : 'Verletzt'}"></span>`
      : '';

    return `
      <div class="attendance-row">
        <div class="att-avatar" style="background:${color}">${initials}</div>
        <div class="att-info">
          <span class="att-name">${escHtml(p.name)}${injuryDot}</span>
          <span class="att-pos">${escHtml(p.position)}${p.number ? ` · #${p.number}` : ''}</span>
        </div>
        <button class="att-btn ${btnClass}" onclick="toggleAttendance(${p.id},'${state}')">${btnInner}</button>
      </div>`;
  }).join('');
}

async function toggleAttendance(playerId, currentState) {
  const nextPresent = currentState === 'none' ? 1
                    : currentState === 'present' ? 0
                    : null;

  const res = await fetch(`/api/trainings/${TRAINING_ID}/attendance`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ player_id: playerId, present: nextPresent }),
  });
  if (res.ok) loadAttendance();
  else showToast('Fehler beim Speichern', 'error');
}

// ── Live-Modus: Training starten ──────────────────────────────────────────────
let runOrder = [], runIdx = 0, runTimer = null, runRemaining = 0, runElapsed = 0, runPaused = false;

function orderedExercises() {
  const out = [];
  BLOCK_ORDER.forEach(b => training.exercises.filter(e => blockOf(e) === b).forEach(e => out.push(e)));
  return out;
}

function startTraining() {
  runOrder = orderedExercises();
  if (!runOrder.length) { showToast('Keine Übungen zum Starten', 'info'); return; }
  runIdx = 0;
  let overlay = document.getElementById('td-runner');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'td-runner';
    overlay.className = 'td-runner';
    document.body.appendChild(overlay);
  }
  document.body.style.overflow = 'hidden';
  renderRunStep();
}

function fmtTime(s) {
  s = Math.max(0, Math.round(s));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function clearRunTimer() { if (runTimer) { clearInterval(runTimer); runTimer = null; } }

function renderRunStep() {
  clearRunTimer();
  const overlay = document.getElementById('td-runner');
  if (!overlay) return;

  if (runIdx >= runOrder.length) {
    overlay.innerHTML = `
      <div class="run-done">
        <div class="run-done-ring">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>
        </div>
        <h2>Training abgeschlossen!</h2>
        <p>Stark gemacht. ${runOrder.length} Übung${runOrder.length !== 1 ? 'en' : ''} absolviert.</p>
        <button class="td-start-btn" style="max-width:280px" onclick="closeRunner()">Fertig</button>
      </div>`;
    return;
  }

  const e = runOrder[runIdx];
  const block = blockOf(e);
  const bgClass = SPORT_BG_CLASS[e.sport] || 'sport-bg-allgemein';
  const svgSmall = SPORT_FIELD_SVG_SM[e.sport] || SPORT_FIELD_SVG_SM['default'];
  const img = e.image_path
    ? `<img src="${e.image_path.startsWith('http') ? e.image_path : '/uploads/' + e.image_path}" alt="">`
    : `<div class="field-placeholder ${bgClass}" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center">${svgSmall}</div>`;

  const hasDur = e.duration != null && e.duration > 0;
  runRemaining = hasDur ? e.duration * 60 : 0;
  runElapsed = 0;
  runPaused = false;

  overlay.innerHTML = `
    <div class="run-top">
      <button class="run-close" onclick="closeRunner()" aria-label="Schließen">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div class="run-progress-text">${runIdx + 1} / ${runOrder.length}</div>
      <span class="run-block-tag" style="background:${BLOCK_COLORS[block]}22;color:${BLOCK_COLORS[block]}">${block}</span>
    </div>
    <div class="run-progress-bar"><div class="run-progress-fill" style="width:${(runIdx) / runOrder.length * 100}%"></div></div>

    <div class="run-body">
      <div class="run-img">${img}</div>
      <h2 class="run-title">${escHtml(e.title)}</h2>
      <div class="run-meta">${escHtml(e.core_competency)} · ${escHtml(e.difficulty)} · ${escHtml(e.sport)}</div>
      <div class="run-timer ${hasDur ? '' : 'run-timer-up'}" id="run-timer">${hasDur ? fmtTime(runRemaining) : '0:00'}</div>
      ${e.description ? `<p class="run-desc">${escHtml(e.description)}</p>` : ''}
    </div>

    <div class="run-controls">
      <button class="run-nav-btn" onclick="runPrev()" ${runIdx === 0 ? 'disabled' : ''}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <button class="run-play-btn" id="run-play" onclick="toggleRunPause()">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>
      </button>
      <button class="run-nav-btn run-next" onclick="runNext()">
        ${runIdx === runOrder.length - 1
          ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="20 6 9 17 4 12"/></svg>`
          : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="9 18 15 12 9 6"/></svg>`}
      </button>
    </div>`;

  startRunTimer(hasDur);
}

function startRunTimer(countdown) {
  clearRunTimer();
  runTimer = setInterval(() => {
    if (runPaused) return;
    const el = document.getElementById('run-timer');
    if (!el) { clearRunTimer(); return; }
    if (countdown) {
      runRemaining -= 1;
      if (runRemaining <= 0) { runRemaining = 0; el.textContent = '0:00'; el.classList.add('run-timer-done'); clearRunTimer(); return; }
      el.textContent = fmtTime(runRemaining);
    } else {
      runElapsed += 1;
      el.textContent = fmtTime(runElapsed);
    }
  }, 1000);
}

function toggleRunPause() {
  runPaused = !runPaused;
  const btn = document.getElementById('run-play');
  if (btn) btn.innerHTML = runPaused
    ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>`
    : `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>`;
}

function runNext() { runIdx += 1; renderRunStep(); }
function runPrev() { if (runIdx > 0) { runIdx -= 1; renderRunStep(); } }

function closeRunner() {
  clearRunTimer();
  const overlay = document.getElementById('td-runner');
  if (overlay) overlay.remove();
  document.body.style.overflow = '';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

init();
