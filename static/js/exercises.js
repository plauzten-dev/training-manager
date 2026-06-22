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
  '':           [],
  'Fußball':    ['Passspiel','Torschuss','Dribbling','Zweikampf','Torwartspiel','Spielaufbau','Pressing','Standardsituationen','Ausdauer','Koordination','Spielintelligenz'],
  'Tennis':     ['Schlagtechnik','Aufschlag','Netzspiel','Grundlinienspiel','Return','Taktik','Kondition'],
  'Floorball':  ['Passspiel','Torschuss','Stickhandling','Zweikampf','Torhüterspiel','Spielaufbau','Pressing','Kondition'],
  'Basketball': ['Dribbling','Korbwurf','Taktik','Spielform','Schnellangriff','Verteidigung','Kondition'],
  'Volleyball': ['Annahme','Zuspiel','Aufschlag','Block','Angriff','Spielform','Kondition'],
  'Gym':        ['Kraft','Ausdauer','Rumpfkraft','Explosivkraft','Koordination','Stabilisation','Abschluss'],
  'Allgemein':  ['Aufwärmen','Dehnen','Koordination','Stabilisation','Ausdauer','Abschluss'],
};

const SPORT_COLORS = {
  'Fußball':    '#16a34a',
  'Tennis':     '#ea580c',
  'Floorball':  '#3b82f6',
  'Basketball': '#7c3aed',
  'Volleyball': '#d97706',
  'Gym':        '#4b5563',
  'Allgemein':  '#0d9488',
};

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const savedSport = localStorage.getItem('exercises_sport') || '';
  if (savedSport) {
    currentSport = savedSport;
    if (savedSport !== 'favorites') {
      const tab = document.querySelector(`.sport-tab[data-sport="${savedSport}"]`);
      if (tab) {
        document.querySelectorAll('.sport-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
      }
    }
  }
  updateSportSelMobile(currentSport);
  updateFavToggleBtn(currentSport);
  if (currentSport === 'favorites') {
    await fetchExercises();
    return;
  }

  // Close mobile sport panel on outside click
  document.addEventListener('click', (e) => {
    const mob   = document.getElementById('sport-sel-mob');
    const panel = document.getElementById('sport-sel-mob-panel');
    if (mob && panel && !mob.contains(e.target) && !panel.contains(e.target)) {
      panel.classList.remove('open');
    }
  });

  await loadFilterOptions(currentSport);
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
  localStorage.setItem('exercises_sport', sport);
  document.querySelectorAll('.sport-tab').forEach(t => t.classList.remove('active'));
  if (el) {
    el.classList.add('active');
  } else if (sport !== 'favorites') {
    document.querySelector(`.sport-tab[data-sport="${sport}"]`)?.classList.add('active');
  }
  updateSportSelMobile(sport);
  updateFavToggleBtn(sport);
  if (sport !== 'favorites') {
    await loadFilterOptions(sport);
    document.getElementById('filter-competency').value = '';
    document.getElementById('filter-fieldsize').value  = '';
  }
  await fetchExercises();
}

function toggleFavoritesView() {
  if (currentSport === 'favorites') {
    setSport(null, '');
  } else {
    setSport(null, 'favorites');
  }
}

function updateFavToggleBtn(sport) {
  const btn = document.getElementById('fav-toggle-btn');
  if (!btn) return;
  const active = sport === 'favorites';
  btn.classList.toggle('fav-toggle-active', active);
  const svg = btn.querySelector('svg');
  if (svg) {
    svg.setAttribute('fill', active ? '#e11d48' : 'none');
    svg.setAttribute('stroke', active ? '#e11d48' : 'currentColor');
  }
}

function updateSportSelMobile(sport) {
  const dot     = document.getElementById('sport-sel-mob-dot');
  const label   = document.getElementById('sport-sel-mob-label');
  const trigger = document.getElementById('sport-sel-mob-trigger');
  // Favorites handled by header button; dropdown shows sport filter only
  const displaySport = sport === 'favorites' ? '' : sport;
  const color = displaySport ? (SPORT_COLORS[displaySport] || '#64748b') : '#64748b';
  const labelText = displaySport || 'Alle Sportarten';
  if (dot)     dot.style.background = color;
  if (label)   label.textContent = labelText;
  if (trigger) { trigger.style.borderColor = displaySport ? color : ''; trigger.style.color = displaySport ? color : ''; }
  document.querySelectorAll('.sport-sel-opt').forEach(btn => {
    const s = btn.dataset.sport;
    const isActive = s === displaySport;
    const c = s ? SPORT_COLORS[s] : '#64748b';
    btn.classList.toggle('active', isActive);
    btn.style.background  = isActive ? c + '20' : '';
    btn.style.borderColor = isActive ? c : '';
    btn.style.color       = isActive ? c : '';
  });
  document.getElementById('sport-sel-mob-panel')?.classList.remove('open');
  updateCompactHeader(sport);
}

function toggleSportSelMobile(event) {
  event.stopPropagation();
  const panel   = document.getElementById('sport-sel-mob-panel');
  const trigger = document.getElementById('sport-sel-mob-trigger');
  if (!panel) return;
  const isOpen = panel.classList.contains('open');
  if (!isOpen && trigger) {
    // An document.body hängen statt im ex-header-wrap zu belassen: .ex-fullhead
    // hat will-change:opacity (für den scroll-synchronen Header-Crossfade), das
    // erzeugt einen eigenen Stacking-Context – darin wäre z-index:9999 nur lokal
    // gültig und würde von der später im DOM stehenden .exercises-layout
    // (Übungskarten) optisch überdeckt. Als Body-Kind + position:fixed umgeht
    // das die Stacking-Context-Falle zuverlässig (wie ein simples Portal).
    if (panel.parentElement !== document.body) document.body.appendChild(panel);
    const rect = trigger.getBoundingClientRect();
    panel.style.top   = (rect.bottom + 4) + 'px';
    panel.style.left  = rect.left + 'px';
    panel.style.width = rect.width + 'px';
  }
  panel.classList.toggle('open');
}

// ── Fetch & Render ────────────────────────────────────────────────────────────
async function fetchExercises() {
  const params = new URLSearchParams();
  if (currentSport === 'favorites') {
    params.set('favorites', '1');
  } else if (currentSport) {
    params.set('sport', currentSport);
  }

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
  const label = `${exercises.length} Übung${exercises.length !== 1 ? 'en' : ''}`;
  count.textContent = `${label} gefunden`;
  const sub = document.getElementById('ex-count-sub');
  if (sub) sub.textContent = currentSport === 'favorites'
    ? `${label} in deinen Favoriten`
    : `${label} in deiner Datenbank`;

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

  // Nach Listenwechsel sauberer Zustand: an den Anfang, Kopfzeile ausklappen
  const sm = document.querySelector('.exercises-main');
  if (sm) sm.scrollTop = 0;
  updateExHeaderProgress();
}

function cardHTML(e) {
  const bgClass  = SPORT_BG_CLASS[e.sport] || 'sport-bg-default';
  const fieldSvg = SPORT_FIELD_SVG[e.sport] || SPORT_FIELD_SVG['default'];
  const imgContent = e.image_path
    ? `<img src="${e.image_path.startsWith('http') ? e.image_path : '/uploads/' + e.image_path}" alt="${escHtml(e.title)}" loading="lazy">`
    : `<div class="field-placeholder ${bgClass}">${fieldSvg}</div>`;
  const diffClass = DIFF_CLASS[e.difficulty] || 'badge-gray';
  const sportBadgeClass = { 'Fußball':'badge-green','Tennis':'badge-red','Floorball':'badge-blue' }[e.sport] || 'badge-gray';

  const favFill = e.is_favorite ? '#e11d48' : 'none';
  const favStroke = e.is_favorite ? '#e11d48' : 'currentColor';

  return `
    <div class="exercise-card" onclick="showDetail(${e.id})">
      <div class="exercise-card-img">${imgContent}</div>
      <button class="fav-btn${e.is_favorite ? ' fav-active' : ''}" onclick="toggleFavorite(event,${e.id},this)" title="${e.is_favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="${favFill}" stroke="${favStroke}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
      </button>
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

// ── Favorites ─────────────────────────────────────────────────────────────────
async function toggleFavorite(event, exerciseId, btn) {
  event.stopPropagation();
  const res = await fetch(`/api/exercises/${exerciseId}/favorite`, { method: 'POST' });
  if (!res.ok) { showToast('Fehler', 'error'); return; }
  const { is_favorite } = await res.json();

  const svg = btn.querySelector('svg');
  if (svg) {
    svg.setAttribute('fill', is_favorite ? '#e11d48' : 'none');
    svg.setAttribute('stroke', is_favorite ? '#e11d48' : 'currentColor');
  }
  btn.classList.toggle('fav-active', is_favorite);

  // Wenn wir im Favoriten-Tab sind und eine Übung entfernt wird, neu laden
  if (!is_favorite && currentSport === 'favorites') {
    await fetchExercises();
  }
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
      ${e.is_owner ? `
      <button class="btn btn-ghost btn-sm" id="share-btn-${e.id}" onclick="shareExercise(${e.id}, this)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        Teilen
      </button>
      <button class="btn btn-ghost btn-sm" onclick="showEditModal(${e.id})">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Bearbeiten
      </button>
      <button class="btn btn-danger btn-sm" onclick="confirmDelete(${e.id}, '${escHtml(e.title).replace(/'/g,"\\'")}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        Löschen
      </button>` : ''}
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
          <div class="ex-sport-wrap" id="ex-sport-wrap">
            <button type="button" class="ex-sport-trigger" id="ex-sport-trigger"
                    onclick="toggleExSportDropdown(event)">
              <span class="ex-sport-dot" id="ex-sport-dot"
                    style="background:${SPORT_COLORS[e?.sport || 'Fußball'] || '#16a34a'}"></span>
              <span id="ex-sport-label">${e?.sport || 'Fußball'}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:auto;opacity:.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="ex-sport-panel" id="ex-sport-panel">
              ${Object.keys(SPORT_COLORS).map(s => `
                <button type="button" class="ex-sport-option${(e?.sport || 'Fußball') === s ? ' active' : ''}"
                        onclick="selectExSport('${s}')"
                        style="${(e?.sport || 'Fußball') === s ? `background:${SPORT_COLORS[s]}15;border-color:${SPORT_COLORS[s]};color:${SPORT_COLORS[s]}` : ''}">
                  <span class="ex-sport-dot" style="background:${SPORT_COLORS[s]}"></span>
                  ${s}
                </button>`).join('')}
            </div>
          </div>
          <input type="hidden" name="sport" id="form-sport" value="${e?.sport || 'Fußball'}">
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
  // Close sport dropdown on outside click
  document.addEventListener('click', closeExSportDropdown, { capture: true, once: false });
}

function updateCompetencyOptions(sportVal) {
  const hiddenEl = document.getElementById('form-sport');
  const compEl   = document.getElementById('form-competency');
  if (!compEl) return;

  const sport   = sportVal || (hiddenEl ? hiddenEl.value : 'Fußball');
  const options = SPORT_COMPETENCIES[sport] || [];

  const current = compEl.value;
  compEl.innerHTML = '<option value="">Bitte wählen</option>';
  options.forEach(c => {
    compEl.innerHTML += `<option value="${c}" ${c === current ? 'selected' : ''}>${c}</option>`;
  });
}

function toggleExSportDropdown(event) {
  event.stopPropagation();
  const panel   = document.getElementById('ex-sport-panel');
  const trigger = document.getElementById('ex-sport-trigger');
  if (!panel) return;
  const isOpen = panel.classList.contains('open');
  if (!isOpen && trigger) {
    const rect = trigger.getBoundingClientRect();
    // Span the full modal width so form content doesn't bleed through on the right
    const modal = trigger.closest('.modal-box');
    const modalRect = modal ? modal.getBoundingClientRect() : null;
    const left  = modalRect ? modalRect.left + 8 : rect.left;
    const width = modalRect ? modalRect.width - 16 : Math.max(rect.width, 280);
    panel.style.top   = (rect.bottom + 4) + 'px';
    panel.style.left  = left + 'px';
    panel.style.width = width + 'px';
  }
  panel.classList.toggle('open');
}

function closeExSportDropdown(e) {
  const wrap = document.getElementById('ex-sport-wrap');
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById('ex-sport-panel')?.classList.remove('open');
  }
}

function selectExSport(sport) {
  // Update hidden input
  const hidden = document.getElementById('form-sport');
  if (hidden) hidden.value = sport;

  // Update trigger label + dot
  const label = document.getElementById('ex-sport-label');
  const dot   = document.getElementById('ex-sport-dot');
  if (label) label.textContent = sport;
  if (dot)   dot.style.background = SPORT_COLORS[sport] || '#64748b';

  // Update active state in panel
  document.querySelectorAll('.ex-sport-option').forEach(btn => {
    const isActive = btn.textContent.trim() === sport;
    btn.classList.toggle('active', isActive);
    btn.style.background    = isActive ? `${SPORT_COLORS[sport]}15` : '';
    btn.style.borderColor   = isActive ? SPORT_COLORS[sport] : '';
    btn.style.color         = isActive ? SPORT_COLORS[sport] : '';
  });

  // Close panel
  document.getElementById('ex-sport-panel')?.classList.remove('open');

  // Update competency options
  updateCompetencyOptions(sport);
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

  let res, data = {};
  try {
    res = await fetch(url, { method, body: formData });
    data = await res.json().catch(() => ({}));
  } catch (err) {
    showToast('Netzwerkfehler – bitte erneut versuchen', 'error');
    btn.disabled = false;
    btn.textContent = editId ? 'Änderungen speichern' : 'Übung erstellen';
    return;
  }

  if (res.ok) {
    closeModal();
    showToast(editId ? 'Übung aktualisiert!' : 'Übung erstellt!', 'success');
    await fetchExercises();
  } else {
    const msg = data.error || (res.status === 413 ? 'Bild ist zu groß (max. 16 MB)' : 'Fehler beim Speichern');
    showToast(msg, 'error');
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

// ── Import via Link ───────────────────────────────────────────────────────────
function showImportFromLinkModal() {
  openModal('Übung via Link importieren', `
    <p style="color:var(--text-muted);font-size:0.875rem;margin-bottom:16px">
      Füge einen Share-Link ein, um eine geteilte Übung in deine Sammlung zu kopieren.
    </p>
    <div class="form-group">
      <label>Share-Link</label>
      <input type="url" id="import-link-input" placeholder="https://…/exercise/share/…" style="width:100%"
             oninput="document.getElementById('import-link-error').textContent=''">
      <p id="import-link-error" style="color:var(--danger);font-size:0.8rem;margin-top:4px;min-height:1.2em"></p>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px">
      <button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" id="import-link-btn" onclick="submitImportFromLink()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Importieren
      </button>
    </div>`, 'md');

  setTimeout(() => document.getElementById('import-link-input')?.focus(), 50);
}

async function submitImportFromLink() {
  const input = document.getElementById('import-link-input');
  const errEl = document.getElementById('import-link-error');
  const btn   = document.getElementById('import-link-btn');
  const raw   = (input?.value || '').trim();

  if (!raw) { errEl.textContent = 'Bitte einen Link einfügen.'; return; }

  // Token aus URL extrahieren: letztes URL-Segment oder direkt Token (32 hex chars)
  const match = raw.match(/\/exercise\/share\/([a-f0-9]{32})/i) || raw.match(/^([a-f0-9]{32})$/i);
  if (!match) { errEl.textContent = 'Ungültiger Share-Link. Bitte den vollständigen Link einfügen.'; return; }
  const token = match[1];

  btn.disabled = true;
  btn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin-btn 0.8s linear infinite"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>
    Wird importiert…`;

  const res = await fetch(`/api/exercises/import/${token}`, { method: 'POST' });
  if (res.ok) {
    closeModal();
    showToast('Übung erfolgreich importiert!', 'success');
    await fetchExercises();
  } else {
    const d = await res.json().catch(() => ({}));
    errEl.textContent = d.error || 'Fehler beim Importieren.';
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Importieren`;
  }
}

// Spin-Animation für Import-Button (einmalig injiziert)
if (!document.getElementById('exercises-keyframes')) {
  const s = document.createElement('style');
  s.id = 'exercises-keyframes';
  s.textContent = '@keyframes spin-btn { to { transform: rotate(360deg); } }';
  document.head.appendChild(s);
}

// ── Share ─────────────────────────────────────────────────────────────────────
async function shareExercise(exerciseId, btn) {
  btn.disabled = true;

  const res = await fetch(`/api/exercises/${exerciseId}/share`, { method: 'POST' });
  if (!res.ok) {
    btn.disabled = false;
    showToast('Fehler beim Erstellen des Links', 'error');
    return;
  }
  const { share_url } = await res.json();

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Übung teilen', url: share_url });
    } catch (_) { /* abgebrochen */ }
    btn.disabled = false;
    return;
  }

  // Fallback: Link in Zwischenablage
  try {
    await navigator.clipboard.writeText(share_url);
    showToast('Link in Zwischenablage kopiert!', 'success');
  } catch (_) {
    const el = document.createElement('textarea');
    el.value = share_url;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showToast('Link in Zwischenablage kopiert!', 'success');
  }
  btn.disabled = false;
}

// ── Filters ───────────────────────────────────────────────────────────────────
function applyFilters()    { updateFilterBadge(); fetchExercises(); }
function debounceSearch()  { clearTimeout(searchTimeout); searchTimeout = setTimeout(fetchExercises, 350); }

function resetFilters() {
  document.getElementById('filter-players').value    = '';
  document.getElementById('filter-gk').value         = '';
  document.getElementById('filter-competency').value = '';
  document.getElementById('filter-fieldsize').value  = '';
  document.getElementById('search-input').value      = '';
  document.querySelector('input[name="difficulty"][value=""]').checked = true;
  updateFilterBadge();
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
  const btn     = document.getElementById('mobile-filter-toggle');
  const open    = sidebar.classList.toggle('mobile-open');
  btn?.classList.toggle('ex-filter-open', open);
}

// Grüner Punkt am Filter-Trigger zeigt an, ob Filter (außer Sportart/Suche,
// die schon eigene Bedienelemente haben) aktiv sind, ohne dafür aufklappen zu müssen.
function updateFilterBadge() {
  const badge = document.getElementById('ex-filter-badge');
  if (!badge) return;
  const active = document.getElementById('filter-players').value !== ''
    || document.getElementById('filter-gk').value !== ''
    || document.getElementById('filter-competency').value !== ''
    || document.getElementById('filter-fieldsize').value !== ''
    || document.querySelector('input[name="difficulty"]:checked')?.value !== '';
  badge.classList.toggle('show', active);
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

// ── Einklappbare Kopfzeile beim Scrollen (≤640px) ─────────────────────────────
// Höhe + Crossfade hängen direkt (1:1) am Scroll-Offset statt an einer
// Schwellwert-Klasse mit eigener CSS-Transition-Dauer – so läuft die Animation
// exakt synchron zur Scroll-Geste (oder zum nativen smooth-scroll bei
// expandExHeader), ohne Drift/Ruckeln. rAF batcht die Style-Writes auf 1×/Frame.
const EX_COLLAPSE_DISTANCE = 90; // px Scroll bis komplett eingeklappt

function updateExHeaderProgress() {
  const scroller = document.querySelector('.exercises-main');
  const wrap      = document.getElementById('ex-header-wrap');
  const fullhead  = document.getElementById('ex-fullhead');
  const compact   = document.getElementById('ex-compact');
  if (!scroller || !wrap || !fullhead || !compact) return;

  if (window.innerWidth > 640) {
    wrap.style.height = '';
    fullhead.style.opacity = '';
    fullhead.style.pointerEvents = '';
    compact.style.opacity = '';
    compact.style.pointerEvents = '';
    return;
  }

  const fullH    = fullhead.offsetHeight;
  const compactH = compact.offsetHeight || 53;
  const p        = Math.max(0, Math.min(1, scroller.scrollTop / EX_COLLAPSE_DISTANCE));

  wrap.style.height = (fullH - p * (fullH - compactH)) + 'px';
  fullhead.style.opacity = String(Math.max(0, 1 - p * 1.3));
  compact.style.opacity  = String(Math.max(0, Math.min(1, (p - 0.25) / 0.75)));

  const compactActive = p > 0.55;
  fullhead.style.pointerEvents = compactActive ? 'none' : 'auto';
  compact.style.pointerEvents  = compactActive ? 'auto' : 'none';
}

(function initCondensedHeader() {
  const scroller = document.querySelector('.exercises-main');
  if (!scroller) return;
  let ticking = false;
  const onScroll = () => {
    if (window.innerWidth > 640) return;
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { updateExHeaderProgress(); ticking = false; });
  };
  scroller.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', updateExHeaderProgress);
  updateExHeaderProgress();
})();

// Kopfzeile wieder ausklappen (Tap auf kompakten Titel / Such-Icon)
function expandExHeader(focusSearch) {
  const scroller = document.querySelector('.exercises-main');
  if (scroller) scroller.scrollTo({ top: 0, behavior: 'smooth' });
  if (focusSearch) setTimeout(() => document.getElementById('ex-search-mob-input')?.focus(), 340);
}

// Kompakte Kopfzeile: Sportart-Label + Favoriten-Status synchronisieren
function updateCompactHeader(sport) {
  const cs = document.getElementById('ex-compact-sport');
  if (cs) cs.textContent = sport === 'favorites' ? 'Favoriten' : (sport || 'Alle');
  const fb = document.getElementById('ex-compact-fav');
  if (fb) fb.classList.toggle('fav-active', sport === 'favorites');
}
