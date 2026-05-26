/* ── my_trainings.js ────────────────────────────────────────────────────────── */

const MONTHS_DE    = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const MONTHS_SHORT = ['JAN','FEB','MÄR','APR','MAI','JUN','JUL','AUG','SEP','OKT','NOV','DEZ'];
const WEEKDAYS     = ['So','Mo','Di','Mi','Do','Fr','Sa'];

let allTrainings = [];

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const res = await fetch('/api/trainings');
  if (!res.ok) { showError(); return; }
  allTrainings = await res.json();
  renderAll(allTrainings);
}

function showError() {
  document.getElementById('mt-list').innerHTML = `
    <div class="empty-state" style="margin-top:60px">
      <p>Fehler beim Laden der Trainings.</p>
    </div>`;
}

// ── Filter ────────────────────────────────────────────────────────────────────
function filterList() {
  const q = document.getElementById('mt-search').value.toLowerCase().trim();
  renderAll(q ? allTrainings.filter(t => t.title.toLowerCase().includes(q)) : allTrainings);
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderAll(trainings) {
  const container = document.getElementById('mt-list');

  if (!trainings.length) {
    container.innerHTML = `
      <div class="empty-state" style="margin-top:60px">
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.3"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <h3>Keine Trainings gefunden</h3>
        <p>Erstelle dein erstes Training über den Button oben.</p>
      </div>`;
    return;
  }

  // Stats bar
  const now        = new Date();
  const thisMonth  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const countMonth = trainings.filter(t => t.date.slice(0,7) === thisMonth).length;
  const statsHTML  = `
    <div class="mt-stats">
      <div class="mt-stat">
        <span class="mt-stat-num">${allTrainings.length}</span>
        <span class="mt-stat-label">Gesamt</span>
      </div>
      <div class="mt-stat">
        <span class="mt-stat-num">${countMonth}</span>
        <span class="mt-stat-label">Diesen Monat</span>
      </div>
      <div class="mt-stat">
        <span class="mt-stat-num">${trainings.reduce((s,t) => s + (t.exercise_count||0), 0)}</span>
        <span class="mt-stat-label">Übungen</span>
      </div>
    </div>`;

  // Group by month
  const groups = {};
  trainings.forEach(t => {
    const key = t.date.slice(0, 7);
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });
  const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  const listHTML = sortedKeys.map(key => {
    const [year, mon] = key.split('-');
    const label = `${MONTHS_DE[parseInt(mon)-1]} ${year}`;
    const count = groups[key].length;
    return `
      <div class="mt-group">
        <div class="mt-month-header">
          <span class="mt-month-label">${label}</span>
          <div class="mt-month-line"></div>
          <span class="mt-month-count">${count} Training${count !== 1 ? 's' : ''}</span>
        </div>
        <div class="mt-cards">
          ${groups[key].map(t => trainingCardHTML(t)).join('')}
        </div>
      </div>`;
  }).join('');

  container.innerHTML = statsHTML + listHTML;
}

function trainingCardHTML(t) {
  const d       = new Date(t.date + 'T00:00:00');
  const mon     = MONTHS_SHORT[d.getMonth()];
  const day     = d.getDate();
  const wd      = WEEKDAYS[d.getDay()];
  const exCount = t.exercise_count ?? 0;

  return `
    <div class="mt-card" onclick="window.location.href='/training/${t.id}'">
      <div class="mt-card-date">
        <span class="mt-card-month">${mon}</span>
        <span class="mt-card-day">${day}</span>
        <span class="mt-card-wd">${wd}</span>
      </div>
      <div class="mt-card-body">
        <div class="mt-card-title">${escHtml(t.title)}</div>
        <div class="mt-card-meta">${exCount} Übung${exCount !== 1 ? 'en' : ''}</div>
      </div>
      <div class="mt-card-actions">
        <button class="mt-repeat-btn"
          title="Wiederholen"
          onclick="event.stopPropagation(); showRepeatModal(${t.id}, '${escHtml(t.title).replace(/'/g,"\\'")}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/></svg>
        </button>
        <svg class="mt-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    </div>`;
}

// ── Repeat Modal ──────────────────────────────────────────────────────────────
function showRepeatModal(trainingId, title) {
  const today = new Date().toISOString().slice(0, 10);
  openModal('Training wiederholen', `
    <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:20px">
      Erstellt eine Kopie von <strong>"${escHtml(title)}"</strong> mit allen Übungen für ein neues Datum.
    </p>
    <form id="repeat-form" onsubmit="submitRepeat(event, ${trainingId})">
      <div class="form-group">
        <label>Neuer Titel <span style="color:var(--text-muted);font-weight:400">(optional)</span></label>
        <input type="text" id="repeat-title" value="${escHtml(title)}" placeholder="${escHtml(title)}">
      </div>
      <div class="form-group">
        <label>Datum *</label>
        <input type="date" id="repeat-date" value="${today}" required>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
        <button type="submit" class="btn btn-primary" id="repeat-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/></svg>
          Training erstellen
        </button>
      </div>
    </form>`);
}

async function submitRepeat(e, trainingId) {
  e.preventDefault();
  const btn = document.getElementById('repeat-btn');
  btn.disabled = true;
  btn.textContent = 'Wird erstellt…';

  const res = await fetch(`/api/trainings/${trainingId}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: document.getElementById('repeat-title').value.trim(),
      date:  document.getElementById('repeat-date').value
    })
  });

  if (res.ok) {
    const newT = await res.json();
    closeModal();
    window.location.href = `/training/${newT.id}`;
  } else {
    const d = await res.json();
    btn.disabled = false;
    btn.textContent = 'Training erstellen';
    showToast(d.error || 'Fehler', 'error');
  }
}

// ── Create Modal ──────────────────────────────────────────────────────────────
function showCreateModal() {
  const today = new Date().toISOString().slice(0, 10);
  openModal('Neues Training', `
    <form id="create-form" onsubmit="submitCreate(event)">
      <div class="form-group">
        <label>Titel *</label>
        <input type="text" id="new-title" placeholder="z.B. Aufwärmtraining" required>
      </div>
      <div class="form-group">
        <label>Datum *</label>
        <input type="date" id="new-date" value="${today}" required>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
        <button type="submit" class="btn btn-primary" id="create-btn">Training erstellen</button>
      </div>
    </form>`);
}

async function submitCreate(e) {
  e.preventDefault();
  const btn = document.getElementById('create-btn');
  btn.disabled = true;
  btn.textContent = 'Wird erstellt…';

  const res = await fetch('/api/trainings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: document.getElementById('new-title').value.trim(),
      date:  document.getElementById('new-date').value
    })
  });

  if (res.ok) {
    const t = await res.json();
    closeModal();
    window.location.href = `/training/${t.id}`;
  } else {
    const d = await res.json();
    btn.disabled = false;
    btn.textContent = 'Training erstellen';
    showToast(d.error || 'Fehler', 'error');
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

init();
