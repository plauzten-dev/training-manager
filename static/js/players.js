/* ── players.js ──────────────────────────────────────────────────────────── */

const SPORT_POSITIONS = {
  'Fußball':    ['Torwart', 'Innenverteidiger', 'Außenverteidiger', 'Defensives MF', 'Mittelfeld', 'Offensives MF', 'Außenstürmer', 'Stürmer'],
  'Basketball': ['Point Guard', 'Shooting Guard', 'Small Forward', 'Power Forward', 'Center'],
  'Volleyball': ['Libero', 'Außenangreifer', 'Mittelangreifer', 'Zuspieler', 'Diagonal'],
  'Tennis':     ['Einzel', 'Doppel', 'Universal'],
  'Floorball':  ['Torwart', 'Verteidiger', 'Stürmer'],
  'Gym':        ['Universal'],
  'Allgemein':  ['Universal'],
};

const SPORT_COLORS = {
  'Fußball':    { bg: '#16a34a', cls: 'sport-bg-fussball' },
  'Basketball': { bg: '#7c3aed', cls: 'sport-bg-basketball' },
  'Volleyball': { bg: '#d97706', cls: 'sport-bg-volleyball' },
  'Tennis':     { bg: '#ea580c', cls: 'sport-bg-tennis' },
  'Floorball':  { bg: '#3b82f6', cls: 'sport-bg-floorball' },
  'Gym':        { bg: '#4b5563', cls: 'sport-bg-gym' },
  'Allgemein':  { bg: '#0d9488', cls: 'sport-bg-allgemein' },
};

const POS_COLORS = {
  default: { bg: '#8b5cf6' },
};
function posColor(pos) {
  const map = {
    'Torwart': '#f59e0b', 'Innenverteidiger': '#3b82f6', 'Außenverteidiger': '#60a5fa',
    'Verteidiger': '#3b82f6', 'Defensives MF': '#06b6d4', 'Mittelfeld': '#16a34a',
    'Offensives MF': '#22c55e', 'Außenstürmer': '#f97316', 'Stürmer': '#ef4444',
    'Außen': '#f97316', 'Sturm': '#ef4444',
    'Point Guard': '#8b5cf6', 'Shooting Guard': '#a855f7', 'Small Forward': '#ec4899',
    'Power Forward': '#f43f5e', 'Center': '#ef4444',
    'Libero': '#06b6d4', 'Außenangreifer': '#3b82f6', 'Mittelangreifer': '#8b5cf6',
    'Zuspieler': '#f59e0b', 'Diagonal': '#f97316',
    'Einzel': '#16a34a', 'Doppel': '#0d9488',
    'Universal': '#64748b',
  };
  return map[pos] || '#8b5cf6';
}

let allTeams   = [];
let allPlayers = [];
let currentTeamId  = null;
let activePosFilter = '';

// ── Birthday helpers ──────────────────────────────────────────────────────────
function isBirthdayToday(birthday) {
  if (!birthday) return false;
  const today = new Date();
  const parts = birthday.split('-');
  return parseInt(parts[1]) === today.getMonth() + 1 &&
         parseInt(parts[2]) === today.getDate();
}

function calcAge(birthday) {
  if (!birthday) return null;
  const today = new Date();
  const [y, m, d] = birthday.split('-').map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return age;
}

function formatBirthdayDisplay(birthday) {
  if (!birthday) return null;
  const [y, m, d] = birthday.split('-');
  return `${d}.${m}.${y}`;
}

// ── Invite code helpers ───────────────────────────────────────────────────────
async function copyInviteCode(code, btn) {
  try {
    await navigator.clipboard.writeText(code);
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
    setTimeout(() => {
      btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    }, 2000);
  } catch {
    showToast('Kopieren fehlgeschlagen', 'error');
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  await loadTeams();
}

// ── Teams ─────────────────────────────────────────────────────────────────────
async function loadTeams() {
  const res = await fetch('/api/teams');
  if (!res.ok) return;
  allTeams = await res.json();

  if (!allTeams.length) {
    renderNoTeams();
    return;
  }

  if (!currentTeamId || !allTeams.find(t => t.id === currentTeamId)) {
    currentTeamId = allTeams[0].id;
  }

  renderTeamTabs();
  await loadPlayers(currentTeamId);
}

function renderNoTeams() {
  document.getElementById('team-tabs-row').innerHTML = '';
  document.getElementById('team-content').innerHTML = `
    <div class="no-team-state">
      <div class="no-team-icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      </div>
      <h2>Kein Team vorhanden</h2>
      <p>Lege dein erstes Team an und füge dann Spieler hinzu.</p>
      <button class="btn btn-primary btn-lg" onclick="showCreateTeamModal()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Erstes Team erstellen
      </button>
    </div>`;
}

function renderTeamTabs() {
  const row = document.getElementById('team-tabs-row');
  row.innerHTML = allTeams.map(t => {
    const sc   = SPORT_COLORS[t.sport] || SPORT_COLORS['Allgemein'];
    const active = t.id === currentTeamId;
    return `
      <button class="team-tab${active ? ' active' : ''}" onclick="selectTeam(${t.id})"
              style="${active ? `background:${sc.bg};border-color:${sc.bg};color:#fff` : ''}">
        <span class="team-tab-dot" style="background:${sc.bg}"></span>
        <span class="team-tab-name">${escHtml(t.name)}</span>
        <span class="team-tab-sport">${escHtml(t.sport)}</span>
      </button>`;
  }).join('') + `
    <button class="team-tab team-tab-add" onclick="showCreateTeamModal()" title="Neues Team">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Neues Team
    </button>`;
  updateMobileTeamSelector();
}

function updateMobileTeamSelector() {
  const team = allTeams.find(t => t.id === currentTeamId);
  const sc   = team ? (SPORT_COLORS[team.sport] || SPORT_COLORS['Allgemein']) : null;
  const dot  = document.getElementById('mob-team-dot');
  const name = document.getElementById('mob-team-name');
  const sport = document.getElementById('mob-team-sport');
  if (dot && name && sport && team) {
    dot.style.cssText   = `background:${sc.bg};width:10px;height:10px;border-radius:50%;flex-shrink:0`;
    name.textContent    = team.name;
    sport.textContent   = team.sport;
  }
  const dd = document.getElementById('team-dropdown');
  if (!dd) return;
  dd.innerHTML = allTeams.map(t => {
    const sc2   = SPORT_COLORS[t.sport] || SPORT_COLORS['Allgemein'];
    const active = t.id === currentTeamId;
    return `<div class="team-dropdown-item${active ? ' active' : ''}" onclick="selectTeamMobile(${t.id})">
      <span class="team-tab-dot" style="background:${sc2.bg};width:10px;height:10px;border-radius:50%;flex-shrink:0"></span>
      <span class="team-dropdown-item-info">
        <span class="team-dropdown-item-name">${escHtml(t.name)}</span>
        <span class="team-dropdown-item-sport">${escHtml(t.sport)}</span>
      </span>
      ${active ? `<svg class="team-dropdown-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 12 4 9"/></svg>` : ''}
    </div>`;
  }).join('') + `
    <div class="team-dropdown-add" onclick="showCreateTeamModal();closeTeamDropdown()">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Neues Team
    </div>`;
}

function toggleTeamDropdown(e) {
  e.stopPropagation();
  const btn = document.getElementById('team-selector-btn');
  const dd  = document.getElementById('team-dropdown');
  const open = dd.classList.toggle('open');
  btn.classList.toggle('open', open);
}

function closeTeamDropdown() {
  const btn = document.getElementById('team-selector-btn');
  const dd  = document.getElementById('team-dropdown');
  if (!dd) return;
  dd.classList.remove('open');
  btn.classList.remove('open');
}

function selectTeamMobile(id) {
  closeTeamDropdown();
  selectTeam(id);
}

document.addEventListener('click', closeTeamDropdown);

async function selectTeam(id) {
  currentTeamId  = id;
  activePosFilter = '';
  renderTeamTabs();
  await loadPlayers(id);
}

// ── Players ───────────────────────────────────────────────────────────────────
async function loadPlayers(teamId) {
  const url = teamId ? `/api/players?team_id=${teamId}` : '/api/players';
  const res = await fetch(url);
  if (!res.ok) return;
  allPlayers = await res.json();

  const team = allTeams.find(t => t.id === teamId);
  renderContent(team);
  renderStats(allPlayers);
  applyFilters();
}

function renderContent(team) {
  const positions = team ? (SPORT_POSITIONS[team.sport] || ['Universal']) : ['Universal'];
  const sc        = team ? (SPORT_COLORS[team.sport] || SPORT_COLORS['Allgemein']) : SPORT_COLORS['Allgemein'];

  document.getElementById('team-content').innerHTML = `
    <!-- Team header -->
    <div class="team-header-row">
      <div class="team-header-info">
        <div class="team-header-badge ${sc.cls}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
        <div>
          <h2 class="team-header-name">${escHtml(team?.name || '')}</h2>
          <span class="team-header-sport">${escHtml(team?.sport || '')}</span>
        </div>
      </div>
      <div class="team-header-actions">
        <button class="btn btn-ghost btn-sm" onclick="showAttendanceSummary(${team?.id})">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          Anwesenheits-Übersicht
        </button>
        <button class="btn btn-ghost btn-sm" onclick="showEditTeamModal(${team?.id})">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Team bearbeiten
        </button>
        <button class="btn btn-primary btn-sm" onclick="showPlayerModal(null, ${team?.id})">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Spieler hinzufügen
        </button>
      </div>
    </div>

    <!-- Stats -->
    <div class="team-stats-row">
      <div class="team-stat-card">
        <span class="stat-number" id="stat-total">0</span>
        <span class="stat-label">Spieler</span>
      </div>
      <div class="team-stat-card stat-fit">
        <span class="stat-number" id="stat-fit">0</span>
        <span class="stat-label">Fit</span>
      </div>
      <div class="team-stat-card stat-krank">
        <span class="stat-number" id="stat-krank">0</span>
        <span class="stat-label">Krank</span>
      </div>
      <div class="team-stat-card stat-verletzt">
        <span class="stat-number" id="stat-verletzt">0</span>
        <span class="stat-label">Verletzt</span>
      </div>
    </div>

    <!-- Search + Filter -->
    <div class="team-toolbar">
      <div class="team-search-wrap">
        <svg class="team-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input type="text" id="player-search" class="team-search-input"
               placeholder="Spieler suchen..." oninput="applyFilters()">
      </div>
      <div class="team-filter-row collapsed" id="pos-filter-row">
        <button class="pos-filter-btn active" onclick="setPosFilter(this,'')">Alle</button>
        ${positions.map(p =>
          `<button class="pos-filter-btn" onclick="setPosFilter(this,'${escHtml(p)}')">${escHtml(p)}</button>`
        ).join('')}
      </div>
    </div>

    <!-- Grid -->
    <div class="players-grid" id="players-grid"></div>`;
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function renderStats(players) {
  const fit      = players.filter(p => p.status === 'fit').length;
  const krank    = players.filter(p => p.status === 'krank').length;
  const verletzt = players.filter(p => p.status === 'verletzt').length;

  setCount('stat-total',    players.length);
  setCount('stat-fit',      fit);
  setCount('stat-krank',    krank);
  setCount('stat-verletzt', verletzt);

  document.getElementById('team-subtitle').textContent =
    allTeams.length === 0 ? 'Teams verwalten' :
    `${allTeams.length} Team${allTeams.length !== 1 ? 's' : ''} · ${players.length} Spieler`;
}

function setCount(id, n) {
  const el = document.getElementById(id);
  if (el) el.textContent = n;
}

// ── Filters ───────────────────────────────────────────────────────────────────
function applyFilters() {
  const q = (document.getElementById('player-search')?.value || '').toLowerCase();
  let filtered = allPlayers;
  if (activePosFilter) filtered = filtered.filter(p => p.position === activePosFilter);
  if (q) filtered = filtered.filter(p =>
    p.name.toLowerCase().includes(q) || p.position.toLowerCase().includes(q));
  renderPlayers(filtered);
}

function setPosFilter(btn, pos) {
  const row = document.getElementById('pos-filter-row');
  if (btn.classList.contains('active')) {
    if (row) row.classList.toggle('collapsed');
    return;
  }
  activePosFilter = pos;
  document.querySelectorAll('.pos-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (row) row.classList.add('collapsed');
  applyFilters();
}

// ── Render Grid ───────────────────────────────────────────────────────────────
function renderPlayers(players) {
  const grid = document.getElementById('players-grid');
  if (!grid) return;

  if (!players.length && allPlayers.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;padding:48px 20px">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.4">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <h3>Noch keine Spieler</h3>
        <p>Füge den ersten Spieler zu diesem Team hinzu.</p>
        <button class="btn btn-primary" style="margin-top:12px" onclick="showPlayerModal(null,${currentTeamId})">
          Spieler hinzufügen
        </button>
      </div>`;
    return;
  }

  if (!players.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;padding:36px 20px">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <h3>Keine Treffer</h3>
        <p>Kein Spieler entspricht dem Filter.</p>
      </div>`;
    return;
  }

  grid.innerHTML = players.map(p => playerCardHTML(p)).join('');
}

function playerCardHTML(p) {
  const color       = posColor(p.position);
  const initials    = p.name.trim().split(/\s+/).map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const team        = allTeams.find(t => t.id === p.team_id);
  const sc          = team ? (SPORT_COLORS[team.sport] || SPORT_COLORS['Allgemein']) : SPORT_COLORS['Allgemein'];
  const numBadge    = p.number ? `<span class="player-num-badge">#${p.number}</span>` : '';
  const notesHTML   = p.notes ? `<p class="player-card-notes">${escHtml(p.notes)}</p>` : '';
  const avatarInner = p.avatar_path
    ? `<img src="${p.avatar_path.startsWith('http') ? p.avatar_path : '/uploads/' + p.avatar_path}" alt="">`
    : initials;

  // Birthday
  const isToday  = isBirthdayToday(p.birthday);
  const age      = calcAge(p.birthday);
  const bdClass  = isToday ? ' is-birthday' : '';

  // Birthday banner (only if today)
  const bdBanner = isToday ? `
    <div class="birthday-banner">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/>
        <path d="M4 21h16"/>
        <path d="M9 8V7a3 3 0 0 1 6 0v1"/>
        <line x1="9" y1="12" x2="9" y2="16"/>
        <line x1="12" y1="12" x2="12" y2="16"/>
        <line x1="15" y1="12" x2="15" y2="16"/>
      </svg>
      Heute Geburtstag!
    </div>` : '';

  // Age chip
  const ageChip = age !== null ? `<span class="player-age-chip">${age} J.</span>` : '';

  // Other teams badges (teams besides the current viewed one)
  const otherTeamIds = (p.team_ids || []).filter(tid => tid !== currentTeamId);
  const otherTeamBadges = otherTeamIds.slice(0, 2).map(tid => {
    const t2  = allTeams.find(x => x.id === tid);
    const sc2 = t2 ? (SPORT_COLORS[t2.sport] || SPORT_COLORS['Allgemein']) : SPORT_COLORS['Allgemein'];
    return `<span class="player-other-team-badge" style="background:${sc2.bg}22;color:${sc2.bg};border-color:${sc2.bg}44">${escHtml(t2?.name || '?')}</span>`;
  }).join('');
  const moreCount = otherTeamIds.length > 2 ? `<span class="player-other-team-more">+${otherTeamIds.length - 2}</span>` : '';
  const otherTeamsRow = otherTeamIds.length > 0
    ? `<div class="player-other-teams">${otherTeamBadges}${moreCount}</div>` : '';

  return `
    <div class="player-card${bdClass}" id="pcard-${p.id}">
      ${isToday ? '<div class="birthday-confetti" aria-hidden="true"></div>' : ''}
      <div class="player-card-top ${sc.cls}">
        ${numBadge}
        <span class="player-pos-tag">${escHtml(p.position)}</span>
      </div>
      <div class="player-card-body">
        <div class="player-avatar" style="background:${color}">${avatarInner}</div>
        <div class="player-card-name-row">
          <div class="player-card-name">${escHtml(p.name)}</div>
          ${ageChip}
        </div>
        ${bdBanner}
        ${notesHTML}
        ${otherTeamsRow}

        <!-- Direct status toggle -->
        <div class="player-status-row" id="pstatus-${p.id}">
          ${statusToggleHTML(p)}
        </div>

        <!-- Invite code -->
        ${p.invite_code ? `
        <div class="player-invite-row" id="pinvite-${p.id}">
          ${p.linked_user_id
            ? `<span class="invite-linked-badge"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Verknüpft</span>`
            : `<span class="invite-code-label">Code:</span>
               <span class="invite-code-value">${escHtml(p.invite_code)}</span>
               <button class="invite-copy-btn" title="Code kopieren" onclick="copyInviteCode('${escHtml(p.invite_code)}',this)">
                 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
               </button>`
          }
        </div>` : ''}

        <!-- Actions -->
        <div class="player-card-actions">
          <button class="btn btn-ghost btn-sm" onclick="showPlayerModal(${p.id})">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Bearbeiten
          </button>
          <button class="player-delete-btn" title="Aus Team entfernen" onclick="confirmRemoveFromTeam(${p.id},'${escHtml(p.name).replace(/'/g,"&#39;")}',${currentTeamId})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>
    </div>`;
}

function statusToggleHTML(p) {
  const statuses = [
    { key: 'fit',      label: 'Fit',      cls: 'st-fit' },
    { key: 'krank',    label: 'Krank',    cls: 'st-krank' },
    { key: 'verletzt', label: 'Verletzt', cls: 'st-verletzt' },
  ];
  return statuses.map(s => `
    <button class="st-btn ${s.cls}${p.status === s.key ? ' st-active' : ''}"
            onclick="setPlayerStatus(${p.id},'${s.key}')">
      ${s.label}
    </button>`).join('');
}

async function setPlayerStatus(playerId, status) {
  const res = await fetch(`/api/players/${playerId}/status`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ status }),
  });
  if (res.ok) {
    const p = allPlayers.find(x => x.id === playerId);
    if (p) {
      p.status = status;
      const row = document.getElementById(`pstatus-${playerId}`);
      if (row) row.innerHTML = statusToggleHTML(p);
      renderStats(allPlayers);
    }
  } else {
    showToast('Fehler', 'error');
  }
}

// ── Create / Edit Team Modals ─────────────────────────────────────────────────
function showCreateTeamModal() {
  openModal('Neues Team erstellen', `
    <form id="team-form" onsubmit="submitTeamForm(event,null)">
      <div class="form-group">
        <label>Teamname *</label>
        <input type="text" name="name" required placeholder="z.B. FC Muster, U17 Jungs...">
      </div>
      <div class="form-group">
        <label>Sportart *</label>
        <div class="sport-select-grid" id="sport-select-grid">
          ${renderSportGrid(null)}
        </div>
        <input type="hidden" name="sport" id="sport-hidden" value="Fußball">
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
        <button type="submit" class="btn btn-primary">Team erstellen</button>
      </div>
    </form>`);
}

function showEditTeamModal(teamId) {
  const t = allTeams.find(x => x.id === teamId);
  if (!t) return;
  openModal('Team bearbeiten', `
    <form id="team-form" onsubmit="submitTeamForm(event,${teamId})">
      <div class="form-group">
        <label>Teamname *</label>
        <input type="text" name="name" value="${escHtml(t.name)}" required>
      </div>
      <div class="form-group">
        <label>Sportart *</label>
        <div class="sport-select-grid" id="sport-select-grid">
          ${renderSportGrid(t.sport)}
        </div>
        <input type="hidden" name="sport" id="sport-hidden" value="${escHtml(t.sport)}">
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px">
        <button type="button" class="btn btn-ghost btn-sm" style="margin-right:auto;color:#dc2626;border-color:#fecaca"
                onclick="confirmDeleteTeam(${teamId})">Team löschen</button>
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
        <button type="submit" class="btn btn-primary">Speichern</button>
      </div>
    </form>`);
}

function renderSportGrid(selectedSport) {
  const sports = Object.keys(SPORT_COLORS);
  return sports.map(s => {
    const sc     = SPORT_COLORS[s];
    const active = (selectedSport || 'Fußball') === s;
    return `
      <button type="button" class="sport-select-btn${active ? ' selected' : ''}"
              style="${active ? `background:${sc.bg};color:#fff;border-color:${sc.bg}` : ''}"
              onclick="selectSport(this,'${s}')">
        <span class="sport-select-dot" style="background:${sc.bg}"></span>
        ${s}
      </button>`;
  }).join('');
}

function selectSport(btn, sport) {
  document.querySelectorAll('.sport-select-btn').forEach(b => {
    b.classList.remove('selected');
    b.style.background = ''; b.style.color = ''; b.style.borderColor = '';
  });
  const sc = SPORT_COLORS[sport] || SPORT_COLORS['Allgemein'];
  btn.classList.add('selected');
  btn.style.background  = sc.bg;
  btn.style.color       = '#fff';
  btn.style.borderColor = sc.bg;
  document.getElementById('sport-hidden').value = sport;
}

async function submitTeamForm(e, id) {
  e.preventDefault();
  const form = e.target;
  const data = {
    name:  form.querySelector('[name="name"]').value.trim(),
    sport: document.getElementById('sport-hidden').value,
  };
  const url    = id ? `/api/teams/${id}` : '/api/teams';
  const method = id ? 'PUT' : 'POST';
  const res    = await fetch(url, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  if (res.ok) {
    const team = await res.json();
    closeModal();
    showToast(id ? 'Team aktualisiert!' : 'Team erstellt!', 'success');
    if (!id) currentTeamId = team.id;
    await loadTeams();
  } else {
    const d = await res.json();
    showToast(d.error || 'Fehler', 'error');
  }
}

function confirmDeleteTeam(teamId) {
  const t = allTeams.find(x => x.id === teamId);
  openModal('Team löschen', `
    <p style="margin-bottom:20px;color:var(--text-muted)">
      <strong>"${escHtml(t?.name || '')}"</strong> wirklich löschen?
      Die Spieler bleiben erhalten und werden keinem Team mehr zugeordnet.
    </p>
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-danger" onclick="doDeleteTeam(${teamId})">Team löschen</button>
    </div>`);
}

async function doDeleteTeam(id) {
  const res = await fetch(`/api/teams/${id}`, { method: 'DELETE' });
  if (res.ok) {
    closeModal();
    showToast('Team gelöscht', 'info');
    currentTeamId = null;
    await loadTeams();
  } else {
    showToast('Fehler beim Löschen', 'error');
  }
}

// ── Add / Edit Player Modal ───────────────────────────────────────────────────
let pendingAvatarFile = null;

function showPlayerModal(id = null, teamId = null) {
  const p        = id ? allPlayers.find(x => x.id === id) : null;
  const tId      = p?.team_id ?? teamId ?? currentTeamId;
  const team     = allTeams.find(t => t.id === tId);
  const positions = team ? (SPORT_POSITIONS[team.sport] || ['Universal']) : ['Universal'];
  const title    = p ? 'Spieler bearbeiten' : 'Spieler hinzufügen';
  const playerTeamIds = p?.team_ids || (tId ? [tId] : []);

  pendingAvatarFile = null;
  const initials    = (p?.name || '').trim().split(/\s+/).map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?';
  const avColor     = posColor(p?.position || 'Universal');
  const avatarInner = p?.avatar_path
    ? `<img src="${p.avatar_path.startsWith('http') ? p.avatar_path : '/uploads/' + p.avatar_path}" alt="">`
    : initials;

  // Team checkboxes
  const teamCheckboxes = allTeams.map(t => {
    const sc      = SPORT_COLORS[t.sport] || SPORT_COLORS['Allgemein'];
    const checked = playerTeamIds.includes(t.id);
    return `
      <label class="team-checkbox-opt">
        <input type="checkbox" name="team_ids" value="${t.id}" ${checked ? 'checked' : ''}>
        <span class="team-checkbox-label">
          <span class="team-checkbox-dot" style="background:${sc.bg}"></span>
          <span class="team-checkbox-name">${escHtml(t.name)}</span>
          <span class="team-checkbox-sport">${escHtml(t.sport)}</span>
        </span>
      </label>`;
  }).join('');

  openModal(title, `
    <form id="player-form" onsubmit="submitPlayerForm(event,${id ?? 'null'})">
      <div class="player-avatar-edit">
        <div class="player-avatar-edit-preview" id="player-avatar-preview" style="background:${avColor}">${avatarInner}</div>
        <div>
          <div class="player-avatar-edit-actions">
            <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('player-avatar-input').click()">Bild wählen</button>
            <button type="button" class="btn btn-ghost btn-sm" id="player-avatar-remove"
                    style="color:#dc2626;${p?.avatar_path ? '' : 'display:none'}"
                    onclick="removePlayerAvatar(${id ?? 'null'})">Entfernen</button>
          </div>
        </div>
        <input type="file" id="player-avatar-input" accept="image/png,image/jpeg,image/webp,image/gif" hidden
               onchange="onPlayerAvatarPick(this,${id ?? 'null'})">
      </div>
      <div class="form-group">
        <label>Name *</label>
        <input type="text" name="name" value="${escHtml(p?.name || '')}" required placeholder="Vorname Nachname">
      </div>
      <div class="form-row">
        <div class="form-group" style="margin-bottom:0">
          <label>Position</label>
          <select name="position">
            ${positions.map(pos =>
              `<option value="${pos}"${p?.position === pos ? ' selected' : ''}>${pos}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label>Trikotnummer</label>
          <input type="number" name="number" value="${p?.number ?? ''}" placeholder="z.B. 10" min="1" max="99">
        </div>
      </div>
      <div class="form-row" style="margin-top:16px">
        <div class="form-group" style="margin-bottom:0">
          <label>Geburtstag <span class="form-optional">optional</span></label>
          <input type="date" name="birthday" value="${p?.birthday || ''}">
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label>Status</label>
          <div class="status-radio-row">
            <label class="status-radio-opt">
              <input type="radio" name="status" value="fit" ${(!p || p.status === 'fit') ? 'checked' : ''}>
              <span class="sro-label ps-fit">Fit</span>
            </label>
            <label class="status-radio-opt">
              <input type="radio" name="status" value="krank" ${p?.status === 'krank' ? 'checked' : ''}>
              <span class="sro-label ps-krank">Krank</span>
            </label>
            <label class="status-radio-opt">
              <input type="radio" name="status" value="verletzt" ${p?.status === 'verletzt' ? 'checked' : ''}>
              <span class="sro-label ps-verletzt">Verletzt</span>
            </label>
          </div>
        </div>
      </div>
      ${allTeams.length > 1 ? `
      <div class="form-group" style="margin-top:16px">
        <label>Teams</label>
        <div class="team-checkboxes-grid" id="team-checkboxes">
          ${teamCheckboxes}
        </div>
      </div>` : ''}
      <div class="form-group" style="margin-top:16px">
        <label>Notizen</label>
        <textarea name="notes" rows="2" placeholder="Stärken, besondere Anmerkungen...">${escHtml(p?.notes || '')}</textarea>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;padding-top:4px;flex-wrap:wrap">
        ${p ? `<button type="button" class="btn btn-ghost btn-sm" style="margin-right:auto;color:#dc2626;border-color:#fecaca" onclick="confirmDeletePlayer(${p.id},'${escHtml(p.name).replace(/'/g,"&#39;")}')">Spieler löschen</button>` : ''}
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
        <button type="submit" class="btn btn-primary">${p ? 'Speichern' : 'Hinzufügen'}</button>
      </div>
    </form>`);
}

async function onPlayerAvatarPick(input, id) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (file.size > 16 * 1024 * 1024) { showToast('Bild ist zu groß (max. 16 MB)', 'error'); input.value = ''; return; }

  const reader = new FileReader();
  reader.onload = ev => {
    const prev = document.getElementById('player-avatar-preview');
    if (prev) prev.innerHTML = `<img src="${ev.target.result}" alt="">`;
  };
  reader.readAsDataURL(file);

  if (id) {
    const fd = new FormData();
    fd.append('image', file);
    const res = await fetch(`/api/players/${id}/avatar`, { method: 'POST', body: fd });
    if (res.ok) {
      const p = allPlayers.find(x => x.id === id);
      if (p) p.avatar_path = (await res.json()).avatar_path;
      const rm = document.getElementById('player-avatar-remove');
      if (rm) rm.style.display = '';
      showToast('Bild gespeichert', 'success');
    } else {
      showToast('Fehler beim Hochladen', 'error');
    }
  } else {
    pendingAvatarFile = file;
    const rm = document.getElementById('player-avatar-remove');
    if (rm) rm.style.display = '';
  }
  input.value = '';
}

async function removePlayerAvatar(id) {
  pendingAvatarFile = null;
  document.getElementById('player-avatar-input').value = '';
  const prev = document.getElementById('player-avatar-preview');
  const nameInput = document.querySelector('#player-form [name="name"]');
  const initials = (nameInput?.value || '').trim().split(/\s+/).map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?';
  if (prev) prev.innerHTML = initials;
  const rm = document.getElementById('player-avatar-remove');
  if (rm) rm.style.display = 'none';
  if (id) {
    const res = await fetch(`/api/players/${id}/avatar`, { method: 'DELETE' });
    if (res.ok) {
      const p = allPlayers.find(x => x.id === id);
      if (p) p.avatar_path = null;
    }
  }
}

async function submitPlayerForm(e, id) {
  e.preventDefault();
  const form = e.target;

  // Collect team_ids from checkboxes (if shown), else use currentTeamId
  const checkboxes = form.querySelectorAll('[name="team_ids"]:checked');
  const team_ids   = checkboxes.length > 0
    ? Array.from(checkboxes).map(cb => parseInt(cb.value))
    : (currentTeamId ? [currentTeamId] : []);

  const data = {
    name:     form.querySelector('[name="name"]').value.trim(),
    position: form.position.value,
    number:   form.number.value ? parseInt(form.number.value) : null,
    notes:    form.notes.value.trim(),
    status:   form.querySelector('[name="status"]:checked')?.value || 'fit',
    birthday: form.birthday?.value || null,
    team_ids,
  };

  const url    = id ? `/api/players/${id}` : '/api/players';
  const method = id ? 'PUT' : 'POST';

  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  const res = await fetch(url, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });

  if (res.ok) {
    if (!id && pendingAvatarFile) {
      const created = await res.json();
      const fd = new FormData();
      fd.append('image', pendingAvatarFile);
      await fetch(`/api/players/${created.id}/avatar`, { method: 'POST', body: fd });
    }
    pendingAvatarFile = null;
    btn.disabled = false;
    closeModal();
    showToast(id ? 'Spieler aktualisiert!' : 'Spieler hinzugefügt!', 'success');
    await loadPlayers(currentTeamId);
  } else {
    btn.disabled = false;
    const d = await res.json();
    showToast(d.error || 'Fehler', 'error');
  }
}

// ── Remove from team (soft-remove) ───────────────────────────────────────────
function confirmRemoveFromTeam(playerId, name, teamId) {
  const team = allTeams.find(t => t.id === teamId);
  const p    = allPlayers.find(x => x.id === playerId);
  const isLastTeam = (p?.team_ids || []).length <= 1;

  openModal(isLastTeam ? 'Spieler entfernen' : 'Aus Team entfernen', `
    <p style="margin-bottom:20px;color:var(--text-muted)">
      ${isLastTeam
        ? `<strong>${escHtml(name)}</strong> hat nur dieses Team. Spieler wirklich löschen?`
        : `<strong>${escHtml(name)}</strong> aus <strong>${escHtml(team?.name || '')}</strong> entfernen? Der Spieler bleibt in anderen Teams erhalten.`}
    </p>
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-danger" onclick="${isLastTeam ? `doDeletePlayer(${playerId})` : `doRemoveFromTeam(${playerId},${teamId})`}">
        ${isLastTeam ? 'Löschen' : 'Entfernen'}
      </button>
    </div>`);
}

async function doRemoveFromTeam(playerId, teamId) {
  const res = await fetch(`/api/players/${playerId}/teams/${teamId}`, { method: 'DELETE' });
  if (res.ok) {
    closeModal();
    showToast('Spieler aus Team entfernt', 'info');
    await loadPlayers(currentTeamId);
  } else {
    showToast('Fehler', 'error');
  }
}

// ── Delete Player (full) ──────────────────────────────────────────────────────
function confirmDeletePlayer(id, name) {
  openModal('Spieler löschen', `
    <p style="margin-bottom:20px;color:var(--text-muted)">
      <strong>${escHtml(name)}</strong> endgültig löschen? Er wird aus allen Teams entfernt.
    </p>
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-danger" onclick="doDeletePlayer(${id})">Löschen</button>
    </div>`);
}

async function doDeletePlayer(id) {
  const res = await fetch(`/api/players/${id}`, { method: 'DELETE' });
  if (res.ok) {
    closeModal();
    showToast('Spieler gelöscht', 'info');
    await loadPlayers(currentTeamId);
  } else {
    showToast('Fehler', 'error');
  }
}

// ── Attendance Summary ────────────────────────────────────────────────────────
async function showAttendanceSummary(teamId) {
  if (!teamId) return;
  const res = await fetch(`/api/teams/${teamId}/attendance-summary`);
  if (!res.ok) { showToast('Fehler beim Laden', 'error'); return; }
  const data = await res.json();

  const { team_name, total_tracked, players } = data;

  const rows = players.length === 0
    ? `<p style="color:var(--text-muted);text-align:center;padding:24px 0">Noch keine Spieler im Team.</p>`
    : players.map(p => {
        const total    = p.marked_count;
        const pct      = total > 0 ? Math.round((p.present_count / total) * 100) : null;
        const barColor = pct === null ? '#e2e8f0' : pct >= 75 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626';
        const pctLabel = pct === null ? '–' : `${pct}%`;
        return `
          <div class="sum-row">
            <div class="sum-name">
              <span class="sum-name-text">${escHtml(p.name)}</span>
              <span class="sum-pos">${escHtml(p.position)}</span>
            </div>
            <div class="sum-bar-wrap">
              <div class="sum-bar-bg">
                <div class="sum-bar-fill" style="width:${pct ?? 0}%;background:${barColor}"></div>
              </div>
              <span class="sum-pct" style="color:${barColor}">${pctLabel}</span>
            </div>
            <div class="sum-counts">
              <span class="sum-present">${p.present_count}x anwesend</span>
              <span class="sum-absent">${p.absent_count}x gefehlt</span>
            </div>
          </div>`;
      }).join('');

  const subtitle = total_tracked > 0
    ? `${total_tracked} Training${total_tracked !== 1 ? 's' : ''} mit Anwesenheitstracking`
    : 'Noch kein Anwesenheitstracking für dieses Team';

  openModal(`Anwesenheits-Übersicht – ${escHtml(team_name)}`, `
    <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:20px">${escHtml(subtitle)}</p>
    <div class="sum-list">${rows}</div>
    <div style="display:flex;justify-content:flex-end;margin-top:20px">
      <button class="btn btn-ghost" onclick="closeModal()">Schließen</button>
    </div>`, 'lg');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

init();
