/* ── calendar.js ──────────────────────────────────────────────────────────── */

const MONTHS_DE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
let currentYear, currentMonth, trainingsMap = {}, selectedDate = null;

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  const now = new Date();
  currentYear  = now.getFullYear();
  currentMonth = now.getMonth(); // 0-based
  renderCalendar();
}

async function renderCalendar() {
  document.getElementById('cal-month-title').textContent =
    `${MONTHS_DE[currentMonth]} ${currentYear}`;

  const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2,'0')}`;
  await fetchTrainings(monthStr);
  renderDays();
}

async function fetchTrainings(monthStr) {
  const res = await fetch(`/api/trainings?month=${monthStr}`);
  if (!res.ok) return;
  const trainings = await res.json();
  trainingsMap = {};
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

// ── Month navigation ──────────────────────────────────────────────────────────
function goToToday() {
  const now = new Date();
  currentYear  = now.getFullYear();
  currentMonth = now.getMonth();
  selectedDate = null;
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
    await renderCalendar();
    selectDay(data.date);
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
