/* ── calendar.js ──────────────────────────────────────────────────────────── */

const MONTHS_DE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const MONTHS_SHORT_DE = ['Jan.','Feb.','März','Apr.','Mai','Juni','Juli','Aug.','Sep.','Okt.','Nov.','Dez.'];
let currentYear, currentMonth, trainingsMap = {}, selectedDate = null;
let currentView = 'month';   // 'month' | 'week'
let weekStart = null;        // Date = Montag der aktiven Woche

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  const now = new Date();
  currentYear  = now.getFullYear();
  currentMonth = now.getMonth(); // 0-based
  weekStart    = getMonday(now);

  const saved = localStorage.getItem('calView');
  if (saved === 'week') {
    setCalView('week');
  } else {
    renderCalendar();
  }
}

// ── View-Umschaltung ────────────────────────────────────────────────────────
function setCalView(view) {
  currentView = view;
  localStorage.setItem('calView', view);

  document.getElementById('cal-view-month').classList.toggle('active', view === 'month');
  document.getElementById('cal-view-week').classList.toggle('active', view === 'week');
  document.getElementById('cal-month-grid').classList.toggle('hidden', view !== 'month');
  document.getElementById('cal-week').classList.toggle('hidden', view !== 'week');

  if (view === 'week') {
    renderWeek();
  } else {
    renderCalendar();
  }
}

// Nav-Pfeile delegieren je nach View
function navPrev() { currentView === 'week' ? changeWeek(-1) : changeMonth(-1); }
function navNext() { currentView === 'week' ? changeWeek(1)  : changeMonth(1);  }

async function renderCalendar() {
  document.getElementById('cal-month-title').textContent =
    `${MONTHS_DE[currentMonth]} ${currentYear}`;

  const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2,'0')}`;
  await loadMonths([monthStr]);
  renderDays();
}

// Lädt eine Liste von Monaten ('YYYY-MM') und füllt trainingsMap neu.
async function loadMonths(monthStrs) {
  trainingsMap = {};
  // Duplikate entfernen (Woche kann denselben Monat zweimal liefern)
  for (const m of [...new Set(monthStrs)]) {
    await fetchTrainings(m);
  }
}

// Hängt die Trainings eines Monats an trainingsMap an (ohne zu leeren).
async function fetchTrainings(monthStr) {
  const res = await fetch(`/api/trainings?month=${monthStr}`);
  if (!res.ok) return;
  const trainings = await res.json();
  trainings.forEach(t => {
    const day = t.date; // YYYY-MM-DD
    if (!trainingsMap[day]) trainingsMap[day] = [];
    trainingsMap[day].push(t);
  });
}

function renderDays() {
  const container = document.getElementById('cal-days');
  container.innerHTML = '';

  const firstDay = new Date(currentYear, currentMonth, 1);
  // Monday = 0 in our grid; JS: Sunday=0, Monday=1 → offset
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6; // Sunday → 6

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysInPrev  = new Date(currentYear, currentMonth, 0).getDate();
  const today = new Date();
  const todayStr = toDateStr(today);

  // Previous month's trailing days
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = daysInPrev - i;
    const m = currentMonth === 0 ? 11 : currentMonth - 1;
    const y = currentMonth === 0 ? currentYear - 1 : currentYear;
    container.appendChild(buildDayCell(d, `${y}-${pad(m+1)}-${pad(d)}`, 'other-month'));
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${currentYear}-${pad(currentMonth+1)}-${pad(d)}`;
    const classes = [];
    if (dateStr === todayStr) classes.push('today');
    if (trainingsMap[dateStr]?.length) classes.push('has-training');
    if (dateStr === selectedDate) classes.push('selected');
    container.appendChild(buildDayCell(d, dateStr, classes.join(' ')));
  }

  // Next month's leading days
  const totalCells = startOffset + daysInMonth;
  const remaining  = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let d = 1; d <= remaining; d++) {
    const m = currentMonth === 11 ? 0 : currentMonth + 1;
    const y = currentMonth === 11 ? currentYear + 1 : currentYear;
    container.appendChild(buildDayCell(d, `${y}-${pad(m+1)}-${pad(d)}`, 'other-month'));
  }
}

function buildDayCell(dayNum, dateStr, extraClass) {
  const cell = document.createElement('div');
  cell.className = `cal-day ${extraClass}`;
  cell.onclick = () => selectDay(dateStr);

  const numEl = document.createElement('div');
  numEl.className = 'day-number';
  numEl.textContent = dayNum;
  cell.appendChild(numEl);

  const dots = document.createElement('div');
  dots.className = 'cal-training-dot';
  if (trainingsMap[dateStr]) {
    trainingsMap[dateStr].slice(0, 2).forEach(t => {
      const chip = document.createElement('div');
      chip.className = 'training-chip';
      chip.textContent = t.title;
      dots.appendChild(chip);
    });
    if (trainingsMap[dateStr].length > 2) {
      const more = document.createElement('div');
      more.className = 'training-chip';
      more.style.background = '#64748b';
      more.textContent = `+${trainingsMap[dateStr].length - 2}`;
      dots.appendChild(more);
    }
  }
  cell.appendChild(dots);
  return cell;
}

// ── Day selection & sidebar ───────────────────────────────────────────────────
function selectDay(dateStr) {
  selectedDate = dateStr;
  renderDays();
  renderSidebar(dateStr);
}

const WEEKDAYS_DE = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];

function renderSidebar(dateStr) {
  const sidebar = document.getElementById('cal-detail');
  const trainings = trainingsMap[dateStr] || [];
  const [y, m, d] = dateStr.split('-');
  const dateObj = new Date(`${y}-${m}-${d}T00:00:00`);
  const weekday = WEEKDAYS_DE[dateObj.getDay()];
  const displayDate = `${parseInt(d)}. ${MONTHS_DE[parseInt(m)-1]} ${y}`;

  const itemsHTML = trainings.length === 0
    ? `<p style="color:var(--text-muted);font-size:0.83rem;text-align:center;padding:18px 0 10px">Kein Training an diesem Tag</p>`
    : trainings.map(t => `
        <div class="training-list-item" onclick="window.location.href='/training/${t.id}'">
          <div class="cal-list-dot"></div>
          <div>
            <div class="training-list-title">${escHtml(t.title)}</div>
            <div class="training-list-meta">${t.exercise_count || 0} Übung${t.exercise_count !== 1 ? 'en' : ''}</div>
          </div>
        </div>`).join('');

  sidebar.innerHTML = `
    <div class="cal-sidebar-header">
      <div class="cal-detail-date">${displayDate}</div>
      <div class="cal-detail-weekday">${weekday}</div>
    </div>
    <div class="cal-detail-body">
      ${itemsHTML}
      <button class="cal-add-btn" onclick="showCreateTrainingModal('${dateStr}')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Training hinzufügen
      </button>
    </div>`;
}

// ── Wochenansicht ───────────────────────────────────────────────────────────
const WEEKDAYS_SHORT_DE = ['Mo','Di','Mi','Do','Fr','Sa','So'];

// Montag der Woche zu einem beliebigen Datum (lokal, ohne Zeitanteil).
function getMonday(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  let day = d.getDay();          // So=0 ... Sa=6
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

async function renderWeek() {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i);
    days.push(d);
  }
  const end = days[6];

  // Titel: "5. – 11. Mai 2026" bzw. mit Monats-/Jahreswechsel
  let title;
  if (weekStart.getMonth() === end.getMonth()) {
    title = `${weekStart.getDate()}. – ${end.getDate()}. ${MONTHS_DE[end.getMonth()]} ${end.getFullYear()}`;
  } else if (weekStart.getFullYear() === end.getFullYear()) {
    title = `${weekStart.getDate()}. ${MONTHS_SHORT_DE[weekStart.getMonth()]} – ${end.getDate()}. ${MONTHS_SHORT_DE[end.getMonth()]} ${end.getFullYear()}`;
  } else {
    title = `${weekStart.getDate()}. ${MONTHS_SHORT_DE[weekStart.getMonth()]} ${weekStart.getFullYear()} – ${end.getDate()}. ${MONTHS_SHORT_DE[end.getMonth()]} ${end.getFullYear()}`;
  }
  document.getElementById('cal-month-title').textContent = title;

  // Trainings der berührten Monate laden (max. 2)
  const months = days.map(d => `${d.getFullYear()}-${pad(d.getMonth()+1)}`);
  await loadMonths(months);

  const todayStr = toDateStr(new Date());
  const container = document.getElementById('cal-week');
  container.innerHTML = days.map((d, i) => {
    const dateStr = toDateStr(d);
    const trainings = trainingsMap[dateStr] || [];
    const isToday = dateStr === todayStr;

    const itemsHTML = trainings.length === 0
      ? `<p class="cal-week-empty">Kein Training</p>`
      : trainings.map(t => `
          <div class="training-list-item" onclick="window.location.href='/training/${t.id}'">
            <div class="cal-list-dot"></div>
            <div>
              <div class="training-list-title">${escHtml(t.title)}</div>
              <div class="training-list-meta">${t.exercise_count || 0} Übung${t.exercise_count !== 1 ? 'en' : ''}</div>
            </div>
          </div>`).join('');

    return `
      <div class="cal-week-day${isToday ? ' today' : ''}">
        <div class="cal-week-day-head">
          <span class="cal-week-wd">${WEEKDAYS_SHORT_DE[i]}</span>
          <span class="cal-week-date">${d.getDate()}. ${MONTHS_SHORT_DE[d.getMonth()]}</span>
        </div>
        <div class="cal-week-body">
          ${itemsHTML}
          <button class="cal-add-btn cal-week-add" onclick="showCreateTrainingModal('${dateStr}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
      </div>`;
  }).join('');
}

function changeWeek(dir) {
  weekStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + dir * 7);
  renderWeek();
}

// ── Month navigation ──────────────────────────────────────────────────────────
function goToToday() {
  const now = new Date();
  currentYear  = now.getFullYear();
  currentMonth = now.getMonth();
  weekStart    = getMonday(now);
  selectedDate = null;

  if (currentView === 'week') { renderWeek(); return; }

  document.getElementById('cal-detail').innerHTML = `
    <div class="cal-detail-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      <p>Klicke auf einen Tag um Trainings zu sehen</p>
    </div>`;
  renderCalendar();
}

function changeMonth(dir) {
  currentMonth += dir;
  if (currentMonth > 11) { currentMonth = 0;  currentYear++; }
  if (currentMonth < 0)  { currentMonth = 11; currentYear--; }
  selectedDate = null;
  document.getElementById('cal-detail').innerHTML = `
    <div class="cal-detail-empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      <p>Klicke auf einen Tag um Trainings zu sehen</p>
    </div>`;
  renderCalendar();
}

// ── Create Training Modal ─────────────────────────────────────────────────────
function showCreateTrainingModal(date) {
  const dateVal = date || toDateStr(new Date());
  openModal('Neues Training erstellen', `
    <form id="create-training-form" onsubmit="submitCreateTraining(event)">
      <div class="form-group">
        <label>Titel *</label>
        <input type="text" name="title" placeholder="z.B. Dienstagstraining" required autofocus>
      </div>
      <div class="form-group">
        <label>Datum *</label>
        <input type="date" name="date" value="${dateVal}" required>
      </div>
      <div class="form-group">
        <label>Notizen</label>
        <textarea name="notes" placeholder="Optionale Anmerkungen..."></textarea>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
        <button type="submit" class="btn btn-primary">Training erstellen</button>
      </div>
    </form>`);
}

async function submitCreateTraining(e) {
  e.preventDefault();
  const form = e.target;
  const data = {
    title: form.title.value.trim(),
    date:  form.date.value,
    notes: form.notes.value
  };
  const res = await fetch('/api/trainings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (res.ok) {
    const t = await res.json();
    closeModal();
    showToast('Training erstellt!', 'success');
    if (currentView === 'week') {
      await renderWeek();
    } else {
      await renderCalendar();
      selectDay(data.date);
    }
    // Navigate to training detail
    window.location.href = `/training/${t.id}`;
  } else {
    const d = await res.json();
    showToast(d.error || 'Fehler', 'error');
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toDateStr(date) {
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
}
function pad(n) { return String(n).padStart(2,'0'); }
function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

init();
