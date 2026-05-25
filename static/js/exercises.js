/* ── exercises.js ─────────────────────────────────────────────────────────── */

let currentSport = '';
let searchTimeout = null;

// ── SVG Icons (no emojis) ────────────────────────────────────────────────────

// Small inline icons for card meta (player / goalkeeper)
const PLAYER_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg>`;
const GK_ICON     = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="10" rx="1"/><path d="M10 11V8a2 2 0 1 1 4 0v3"/></svg>`;
const FIELD_ICON  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="14" rx="1"/><line x1="12" y1="5" x2="12" y2="19"/><circle cx="12" cy="12" r="3"/></svg>`;

// Sport-field diagram SVGs for card placeholders
const SPORT_FIELD_SVG = {
  'Fußball': `<svg width="70" height="70" viewBox="0 0 70 70" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1.6" stroke-linecap="round"><rect x="8" y="14" width="54" height="42" rx="2"/><line x1="35" y1="14" x2="35" y2="56"/><circle cx="35" cy="35" r="9"/><rect x="8" y="24" width="13" height="22" rx="1"/><rect x="49" y="24" width="13" height="22" rx="1"/></svg>`,
  'Tennis':  `<svg width="70" height="70" viewBox="0 0 70 70" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1.6" stroke-linecap="round"><rect x="8" y="8" width="54" height="54" rx="1"/><line x1="35" y1="8" x2="35" y2="62"/><line x1="8" y1="35" x2="62" y2="35"/><line x1="18" y1="18" x2="18" y2="52"/><line x1="52" y1="18" x2="52" y2="52"/><rect x="18" y="18" width="34" height="34"/></svg>`,
  'Floorball':`<svg width="70" height="70" viewBox="0 0 70 70" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1.6" stroke-linecap="round"><rect x="8" y="12" width="54" height="46" rx="10"/><circle cx="35" cy="35" r="7"/><line x1="35" y1="12" x2="35" y2="58"/><rect x="8" y="24" width="11" height="22" rx="2"/><rect x="51" y="24" width="11" height="22" rx="2"/></svg>`,
  'default': `<svg width="70" height="70" viewBox="0 0 70 70" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1.6" stroke-linecap="round"><circle cx="35" cy="35" r="22"/><circle cx="35" cy="35" r="8"/><line x1="13" y1="35" x2="57" y2="35"/><line x1="35" y1="13" x2="35" y2="57"/></svg>`,
};

const SPORT_BG_CLASS = {
  'Fußball':    'sport-bg-fussball',
  'Tennis':     'sport-bg-tennis',
  'Floorball':  'sport-bg-floorball',
  'Basketball': 'sport-bg-basketball',
  'Volleyball': 'sport-bg-volleyball',
  'Gym':        'sport-bg-gym',
  'Allgemein':  'sport-bg-allgemein',
};

const DIFF_CLASS = {
  'Anfänger':     'diff-Anfänger',
  'Fortgeschritten': 'diff-Fortgeschritten',
  'Profi':        'diff-Profi',
};

const SPORT_COMPETENCIES = {
  '':          [],  // populated from API
  'Fußball':   ['Passspiel','Torschuss','Dribbling','Zweikampf','Torwartspiel','Spielaufbau','Pressing','Standardsituationen','Ausdauer','Koordination','Spielintelligenz'],
  'Tennis':    ['Schlagtechnik','Aufschlag','Netzspiel','Grundlinienspiel','Return','Taktik','Kondition'],
  'Floorball': ['Passspiel','Torschuss','Stickhandling','Zweikampf','Torhüterspiel','Spielaufbau','Pressing','Kondition'],
};

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  await loadFilterOptions('');
  await fetchExercises();
}

async function loadFilterOptions(sport) {
  const res = await fetch('/api/filter-options' + (sport ? `?sport=${encodeURIComponent(sport)}` : ''));
  if (!res.ok) return;
  const data = await res.json();

  const playerSel = document.getElementById('filter-players');
  playerSel.innerHTML = '<option value="">Alle</option>';
  for (let i = 1; i <= 20; i++) {
    playerSel.innerHTML += `<option value="${i}">${i}</option>`;
  }

  const compSel = document.getElementById('filter-competency');
  compSel.innerHTML = '<option value="">Alle</option>';
  data.competencies.forEach(c => {
    compSel.innerHTML += `<option value="${c}">${c}</option>`;
  });

  const sizeSel = document.getElementById('filter-fieldsize');
  sizeSel.innerHTML = '<option value="">Alle</option>';
  data.field_sizes.forEach(s => {
    sizeSel.innerHTML += `<option value="${s}">${s}</option>`;
  });
}

// ── Sport tabs ────────────────────────────────────────────────────────────────
async function setSport(el, sport) {
  currentSport = sport;
  document.querySelectorAll('.sport-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  // Reset competency + field size filters for the new sport
  await loadFilterOptions(sport);
  document.getElementById('filter-competency').value = '';
  document.getElementById('filter-fieldsize').value  = '';
  await fetchExercises();
}

// ── Fetch & Render ────────────────────────────────────────────────────────────
async function fetchExercises() {
  const params = new URLSearchParams();
  if (currentSport) params.set('sport', currentSport);

  const players    = document.getElementById('filter-players').value;
  const gk         = document.getElementById('filter-gk').value;
  const competency = document.getElementById('filter-competency').value;
  const difficulty = document.querySelector('input[name="difficulty"]:checked')?.value;
  const fieldSize  = document.getElementById('filter-fieldsize').value;
  const search     = document.getElementById('search-input').value.trim();

  if (players)    params.set('field_players', players);
  if (gk)         params.set('goalkeepers', gk);
  if (competency) params.set('core_competency', competency);
  if (difficulty) params.set('difficulty', difficulty);
  if (fieldSize)  params.set('field_size', fieldSize);
  if (search)     params.set('search', search);

  const grid = document.getElementById('exercises-grid');
  grid.innerHTML = `<div class="loading-spinner" style="grid-column:1/-1"><div class="spinner"></div></div>`;

  const res = await fetch('/api/exercises?' + params.toString());
  if (!res.ok) { showToast('Fehler beim Laden', 'error'); return; }
  const exercises = await res.json();
  renderExercises(exercises);
}

function renderExercises(exercises) {
  const grid  = document.getElementById('exercises-grid');
  const count = document.getElementById('exercises-count');
  count.textContent = `${exercises.length} Übung${exercises.length !== 1 ? 'en' : ''} gefunden`;

  if (!exercises.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5"><path d="M2 20h20M6 20V10M12 20V4M18 20v-6"/></svg>
        <h3>Keine Übungen gefunden</h3>
        <p>Passe die Filter an oder erstelle eine neue Übung.</p>
      </div>`;
    return;
  }
  grid.innerHTML = exercises.map(cardHTML).join('');
}

function cardHTML(e) {
  const bgClass  = SPORT_BG_CLASS[e.sport] || 'sport-bg-default';
  const fieldSvg = SPORT_FIELD_SVG[e.sport] || SPORT_FIELD_SVG['default'];
  const imgContent = e.image_path
    ? `<img src="${e.image_path.startsWith('http') ? e.image_path : '/uploads/' + e.image_path}" alt="${escHtml(e.title)}" loading="lazy">`
    : `<div class="field-placeholder ${bgClass}">${fieldSvg}</div>`;
  const diffClass = DIFF_CLASS[e.difficulty] || 'badge-gray';
  const sportBadgeClass = { 'Fußball':'badge-green','Tennis':'badge-red','Floorball':'badge-blue' }[e.sport] || 'badge-gray';

  return `
    <div class="exercise-card" onclick="showDetail(${e.id})">
      <div class="exercise-card-img">${imgContent}</div>
      <div class="exercise-card-body">
        <div class="exercise-card-title">${escHtml(e.title)}</div>
        <div class="exercise-card-meta">
          <span>${PLAYER_ICON} ${e.field_players}</span>
          <span>${GK_ICON} ${e.goalkeepers}</span>
          <span>${FIELD_ICON} ${e.field_size}</span>
        </div>
        <div class="exercise-card-badges">
          <span class="badge ${diffClass}">${e.difficulty}</span>
          <span class="badge ${sportBadgeClass}">${e.sport}</span>
        </div>
      </div>
    </div>`;
}

// ── Detail Modal ──────────────────────────────────────────────────────────────
async function showDetail(id) {
  openModal('Übung', `<div class="loading-spinner"><div class="spinner"></div></div>`, 'lg');
  const res = await fetch(`/api/exercises/${id}`);
  if (!res.ok) { closeModal(); showToast('Fehler', 'error'); return; }
  const e = await res.json();

  const bgClass  = SPORT_BG_CLASS[e.sport] || 'sport-bg-default';
  const fieldSvg = SPORT_FIELD_SVG[e.sport] || SPORT_FIELD_SVG['default'];
  const imgContent = e.image_path
    ? `<img src="${e.image_path.startsWith('http') ? e.image_path : '/uploads/' + e.image_path}" alt="${escHtml(e.title)}">`
    : `<div class="field-placeholder ${bgClass}" style="height:100%">${fieldSvg}</div>`;
  const diffClass = DIFF_CLASS[e.difficulty] || 'badge-gray';

  document.getElementById('modal-title').textContent = e.title;
  document.getElementById('modal-content').innerHTML = `
    <div class="detail-image-placeholder">${imgContent}</div>
    <div class="detail-meta-grid">
      <div class="detail-meta-item">
        <div class="detail-meta-label">Feldspieler</div>
        <div class="detail-meta-value">${PLAYER_ICON} ${e.field_players}</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-label">Torhüter</div>
        <div class="detail-meta-value">${GK_ICON} ${e.goalkeepers}</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-label">Kernkompetenz</div>
        <div class="detail-meta-value">${escHtml(e.core_competency)}</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-label">Spielfeldgröße</div>
        <div class="detail-meta-value">${escHtml(e.field_size)}</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-label">Sportart</div>
        <div class="detail-meta-value">${escHtml(e.sport)}</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-label">Schwierigkeitsgrad</div>
        <div class="detail-meta-value"><span class="badge ${diffClass}">${e.difficulty}</span></div>
      </div>
    </div>
    <p class="detail-description">${escHtml(e.description).replace(/\n/g,'<br>')}</p>
    <div class="detail-actions">
      <button class="btn btn-primary btn-sm" onclick="showAddToTrainingFromDetail(${e.id})">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Zu Training hinzufügen
      </button>
      <button class="btn btn-ghost btn-sm" onclick="showEditModal(${e.id})">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Bearbeiten
      </button>
      <button class="btn btn-danger btn-sm" onclick="confirmDelete(${e.id}, '${escHtml(e.title).replace(/'/g,"\\'")}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        Löschen
      </button>
    </div>`;
}

// ── Create / Edit ─────────────────────────────────────────────────────────────
function showCreateExerciseModal() {
  openModal('Neue Übung erstellen', exerciseFormHTML(null), 'lg');
  setupFormDynamics();
  document.getElementById('exercise-form').addEventListener('submit', submitExercise);
  setupImagePreview();
}

async function showEditModal(id) {
  const res = await fetch(`/api/exercises/${id}`);
  if (!res.ok) { showToast('Fehler', 'error'); return; }
  const e = await res.json();
  openModal('Übung bearbeiten', exerciseFormHTML(e), 'lg');
  setupFormDynamics(e.sport);
  document.getElementById('exercise-form').addEventListener('submit', (ev) => submitExercise(ev, id));
  setupImagePreview();
}

function exerciseFormHTML(e) {
  const v   = (f) => e ? escHtml(e[f] ?? '') : '';
  const sel = (f, val) => e && String(e[f]) === String(val) ? 'selected' : '';

  return `
    <form id="exercise-form" enctype="multipart/form-data">
      <div class="form-row">
        <div class="form-group" style="grid-column:1/-1">
          <label>Titel *</label>
          <input type="text" name="title" value="${v('title')}" placeholder="Name der Übung" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Sportart *</label>
          <select name="sport" id="form-sport" required onchange="updateCompetencyOptions()">
            ${['Fußball','Tennis','Floorball'].map(s => `<option value="${s}" ${sel('sport',s)}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Kernkompetenz *</label>
          <select name="core_competency" id="form-competency" required>
            <option value="">Bitte wählen</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Feldspieler *</label>
          <input type="number" name="field_players" value="${e ? e.field_players : 0}" min="0" max="25" required>
        </div>
        <div class="form-group">
          <label>Torhüter</label>
          <input type="number" name="goalkeepers" value="${e ? e.goalkeepers : 0}" min="0" max="4">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Schwierigkeit *</label>
          <select name="difficulty" required>
            <option value="">Bitte wählen</option>
            ${['Anfänger','Fortgeschritten','Profi'].map(d => `<option value="${d}" ${sel('difficulty',d)}>${d}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Spielfeldgröße *</label>
          <select name="field_size" required>
            <option value="">Bitte wählen</option>
            ${['Klein (10x10m)','Mittel (20x30m)','Groß (40x30m)','Groß (Vollfeld)'].map(s => `<option value="${s}" ${sel('field_size',s)}>${s}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Erklärung *</label>
        <textarea name="description" rows="5" placeholder="Beschreibe die Übung detailliert..." required>${v('description')}</textarea>
      </div>
      <div class="form-group">
        <label>Bild (optional)</label>
        <div class="image-upload-area">
          <input type="file" name="image" accept="image/*" id="image-input">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5" style="margin-bottom:8px"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>
          <p style="color:var(--text-muted);font-size:0.82rem">Klicke oder ziehe ein Bild hierher</p>
          <p style="color:#94a3b8;font-size:0.75rem">PNG, JPG, GIF bis 16 MB</p>
          <img id="image-preview-el" class="image-preview" alt="Vorschau">
        </div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
        <button type="submit" class="btn btn-primary" id="submit-btn">
          ${e ? 'Änderungen speichern' : 'Übung erstellen'}
        </button>
      </div>
    </form>`;
}

function setupFormDynamics(currentSportVal) {
  updateCompetencyOptions(currentSportVal);
}

function updateCompetencyOptions(sportVal) {
  const sportEl = document.getElementById('form-sport');
  const compEl  = document.getElementById('form-competency');
  if (!sportEl || !compEl) return;

  const sport = sportVal || sportEl.value;
  const options = SPORT_COMPETENCIES[sport] || [];

  // Preserve current selection if still valid
  const current = compEl.value;
  compEl.innerHTML = '<option value="">Bitte wählen</option>';
  options.forEach(c => {
    compEl.innerHTML += `<option value="${c}" ${c === current ? 'selected' : ''}>${c}</option>`;
  });
}

function setupImagePreview() {
  const input = document.getElementById('image-input');
  if (!input) return;
  input.addEventListener('change', function () {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const preview = document.getElementById('image-preview-el');
      if (preview) { preview.src = ev.target.result; preview.style.display = 'block'; }
    };
    reader.readAsDataURL(file);
  });
}

async function submitExercise(e, editId = null) {
  e.preventDefault();
  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.textContent = 'Wird gespeichert...';

  const formData = new FormData(document.getElementById('exercise-form'));
  const url    = editId ? `/api/exercises/${editId}` : '/api/exercises';
  const method = editId ? 'PUT' : 'POST';

  const res  = await fetch(url, { method, body: formData });
  const data = await res.json();

  if (res.ok) {
    closeModal();
    showToast(editId ? 'Übung aktualisiert!' : 'Übung erstellt!', 'success');
    await fetchExercises();
  } else {
    showToast(data.error || 'Fehler beim Speichern', 'error');
    btn.disabled = false;
    btn.textContent = editId ? 'Änderungen speichern' : 'Übung erstellen';
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────
function confirmDelete(id, title) {
  openModal('Übung löschen', `
    <p style="margin-bottom:20px;color:var(--text-muted)">
      Möchtest du <strong>"${escHtml(title)}"</strong> wirklich löschen?
      Diese Aktion kann nicht rückgängig gemacht werden.
    </p>
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-danger" onclick="deleteExercise(${id})">Endgültig löschen</button>
    </div>`);
}

async function deleteExercise(id) {
  const res = await fetch(`/api/exercises/${id}`, { method: 'DELETE' });
  if (res.ok) {
    closeModal();
    showToast('Übung gelöscht', 'success');
    await fetchExercises();
  } else {
    showToast('Fehler beim Löschen', 'error');
  }
}

// ── Add to Training from Detail ───────────────────────────────────────────────
const MONTHS_SHORT = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

async function showAddToTrainingFromDetail(exerciseId) {
  document.getElementById('modal-title').textContent = 'Zu Training hinzufügen';
  document.getElementById('modal-content').innerHTML = `<div class="loading-spinner"><div class="spinner"></div></div>`;

  const res = await fetch('/api/trainings');
  if (!res.ok) { showToast('Fehler beim Laden', 'error'); return; }
  const trainings = await res.json();

  if (!trainings.length) {
    document.getElementById('modal-content').innerHTML = `
      <div class="empty-state" style="padding:24px 0">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <p>Noch keine Trainings vorhanden.</p>
        <a href="/calendar" class="btn btn-primary btn-sm" style="margin-top:10px">Zum Kalender</a>
      </div>`;
    return;
  }

  document.getElementById('modal-content').innerHTML = `
    <p style="color:var(--text-muted);font-size:0.82rem;margin-bottom:12px">Wähle ein Training:</p>
    <div class="training-picker-list">
      ${trainings.map(t => {
        const d = new Date(t.date + 'T00:00:00');
        const dateStr = `${d.getDate()}. ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
        return `
          <div class="training-picker-item" onclick="addExerciseToTraining(${t.id}, ${exerciseId}, this)">
            <div class="training-picker-info">
              <div class="training-picker-title">${escHtml(t.title)}</div>
              <div class="training-picker-date">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                ${dateStr}
              </div>
            </div>
            <span class="training-picker-count">${t.exercise_count} Üb.</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </div>`;
      }).join('')}
    </div>`;
}

async function addExerciseToTraining(trainingId, exerciseId, rowEl) {
  rowEl.style.pointerEvents = 'none';
  rowEl.style.opacity = '0.5';

  const res = await fetch(`/api/trainings/${trainingId}/exercises`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exercise_id: exerciseId })
  });

  if (res.ok) {
    closeModal();
    showToast('Übung zum Training hinzugefügt!', 'success');
  } else {
    const d = await res.json();
    rowEl.style.pointerEvents = '';
    rowEl.style.opacity = '';
    showToast(d.error || 'Fehler', 'error');
  }
}

// ── Filters ───────────────────────────────────────────────────────────────────
function applyFilters()    { fetchExercises(); }
function debounceSearch()  { clearTimeout(searchTimeout); searchTimeout = setTimeout(fetchExercises, 350); }

function resetFilters() {
  document.getElementById('filter-players').value    = '';
  document.getElementById('filter-gk').value         = '';
  document.getElementById('filter-competency').value = '';
  document.getElementById('filter-fieldsize').value  = '';
  document.getElementById('search-input').value      = '';
  document.querySelector('input[name="difficulty"][value=""]').checked = true;
  fetchExercises();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

init();

// ── Mobile filter toggle ──────────────────────────────────────────────────────
function toggleMobileFilter() {
  const sidebar = document.querySelector('.filter-sidebar');
  const label   = document.getElementById('filter-btn-label');
  const open    = sidebar.classList.toggle('mobile-open');
  label.textContent = open ? 'Filter ausblenden' : 'Filter anzeigen';
}

function initMobileFilterBtn() {
  const btn = document.getElementById('mobile-filter-toggle');
  if (!btn) return;
  const isMobile = () => window.innerWidth <= 640;
  const update = () => { btn.style.display = isMobile() ? 'flex' : 'none'; };
  update();
  window.addEventListener('resize', update);
}
initMobileFilterBtn();
