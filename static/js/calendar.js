/* ── calendar.js ──────────────────────────────────────────────────────────── */

const MONTHS_DE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const MONTHS_SHORT_DE = ['Jan.','Feb.','März','Apr.','Mai','Juni','Juli','Aug.','Sep.','Okt.','Nov.','Dez.'];
let currentYear, currentMonth, trainingsMap = {}, eventsMap = {}, selectedDate = null;
let currentView = 'month';   // 'month' | 'week'
let weekStart = null;        // Date = Montag der aktiven Woche

const EVENT_COLORS = { spiel: '#d97706', turnier: '#7c3aed', sonstiges: '#64748b' };
const EVENT_LABELS = { spiel: 'Spiel', turnier: 'Turnier', sonstiges: 'Termin' };

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

  // In der Wochenansicht ist die Tages-Sidebar überflüssig → ausblenden, Card volle Breite
  document.querySelector('.calendar-layout').classList.toggle('week-mode', view === 'week');

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

// Lädt eine Liste von Monaten ('YYYY-MM') und füllt trainingsMap + eventsMap neu.
async function loadMonths(monthStrs) {
  trainingsMap = {};
  eventsMap = {};
  for (const m of [...new Set(monthStrs)]) {
    await Promise.all([fetchTrainings(m), fetchEvents(m)]);
  }
}

async function fetchTrainings(monthStr) {
  const res = await fetch(`/api/trainings?month=${monthStr}`);
  if (!res.ok) return;
  const trainings = await res.json();
  trainings.forEach(t => {
    if (!trainingsMap[t.date]) trainingsMap[t.date] = [];
    trainingsMap[t.date].push(t);
  });
}

async function fetchEvents(monthStr) {
  const res = await fetch(`/api/events?month=${monthStr}`);
  if (!res.ok) return;
  const events = await res.json();
  events.forEach(ev => {
    if (!eventsMap[ev.date]) eventsMap[ev.date] = [];
    eventsMap[ev.date].push(ev);
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
    if (eventsMap[dateStr]?.length) classes.push('has-event');
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

  const allItems = [
    ...(trainingsMap[dateStr] || []).map(t => ({ kind: 'training', ...t })),
    ...(eventsMap[dateStr] || []).map(ev => ({ kind: 'event', ...ev })),
  ];
  const shown = allItems.slice(0, 2);
  shown.forEach(item => {
    const chip = document.createElement('div');
    if (item.kind === 'event') {
      chip.className = 'training-chip event-chip';
      chip.style.background = EVENT_COLORS[item.type] || '#64748b';
      chip.textContent = item.title;
    } else {
      chip.className = 'training-chip';
      chip.textContent = item.title;
    }
    dots.appendChild(chip);
  });
  if (allItems.length > 2) {
    const more = document.createElement('div');
    more.className = 'training-chip';
    more.style.background = '#64748b';
    more.textContent = `+${allItems.length - 2}`;
    dots.appendChild(more);
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
  const events    = eventsMap[dateStr] || [];
  const [y, m, d] = dateStr.split('-');
  const dateObj = new Date(`${y}-${m}-${d}T00:00:00`);
  const weekday = WEEKDAYS_DE[dateObj.getDay()];
  const displayDate = `${parseInt(d)}. ${MONTHS_DE[parseInt(m)-1]} ${y}`;

  const trainingsHTML = trainings.map(t => `
    <div class="training-list-item" onclick="window.location.href='/training/${t.id}'">
      <div class="cal-list-dot"></div>
      <div>
        <div class="training-list-title">${escHtml(t.title)}</div>
        <div class="training-list-meta">
          ${t.time ? `<span>${escHtml(t.time)} Uhr</span>` : ''}
          <span>${t.exercise_count || 0} Übung${t.exercise_count !== 1 ? 'en' : ''}</span>
        </div>
      </div>
    </div>`).join('');

  const eventsHTML = events.map(ev => `
    <div class="training-list-item cal-event-item" style="border-left-color:${EVENT_COLORS[ev.type] || '#64748b'}" onclick="showEditEventModal(${ev.id},'${dateStr}')">
      <div class="cal-list-dot" style="background:${EVENT_COLORS[ev.type] || '#64748b'}"></div>
      <div style="flex:1">
        <div class="training-list-title">${escHtml(ev.title)}</div>
        <div class="training-list-meta">
          <span class="cal-event-badge" style="background:${EVENT_COLORS[ev.type]}20;color:${EVENT_COLORS[ev.type]}">${EVENT_LABELS[ev.type] || ev.type}</span>
          ${ev.time ? `<span>${ev.time} Uhr</span>` : ''}
          ${ev.location ? `<span>${escHtml(ev.location)}</span>` : ''}
          ${ev.team_name ? `<span>${escHtml(ev.team_name)}</span>` : ''}
        </div>
      </div>
      <button class="cal-event-del" onclick="deleteEventFromSidebar(event,${ev.id},'${dateStr}')" title="Termin löschen">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`).join('');

  const emptyHTML = !trainings.length && !events.length
    ? `<p style="color:var(--text-muted);font-size:0.83rem;text-align:center;padding:18px 0 10px">Kein Eintrag an diesem Tag</p>`
    : '';

  sidebar.innerHTML = `
    <div class="cal-sidebar-header">
      <div class="cal-detail-date">${displayDate}</div>
      <div class="cal-detail-weekday">${weekday}</div>
    </div>
    <div class="cal-detail-body">
      ${emptyHTML}${trainingsHTML}${eventsHTML}
      <button class="cal-add-btn" onclick="showCreateTrainingModal('${dateStr}')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Training hinzufügen
      </button>
      ${USER_ROLE === 'trainer' ? `<button class="cal-add-btn cal-add-event-btn" onclick="showCreateEventModal('${dateStr}')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/></svg>
        Termin hinzufügen
      </button>` : ''}
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
    const dayEvents = eventsMap[dateStr] || [];
    const isToday = dateStr === todayStr;

    const trainingHTML = trainings.map(t => `
        <div class="cal-wk-item" onclick="window.location.href='/training/${t.id}'">
          <div class="cal-wk-item-title">${escHtml(t.title)}</div>
          <div class="cal-wk-item-meta">${t.exercise_count || 0} Übung${t.exercise_count !== 1 ? 'en' : ''}</div>
        </div>`).join('');

    const evHTML = dayEvents.map(ev => `
        <div class="cal-wk-item cal-wk-event" style="border-left-color:${EVENT_COLORS[ev.type] || '#64748b'}" onclick="showEditEventModal(${ev.id},'${dateStr}')">
          <div class="cal-wk-item-title">${escHtml(ev.title)}</div>
          <div class="cal-wk-item-meta" style="color:${EVENT_COLORS[ev.type] || '#64748b'}">${EVENT_LABELS[ev.type] || ev.type}${ev.time ? ' · ' + ev.time : ''}</div>
        </div>`).join('');

    const bodyHTML = (!trainings.length && !dayEvents.length)
      ? `<span class="cal-wk-empty">Frei</span>`
      : trainingHTML + evHTML;

    return `
      <div class="cal-week-day${isToday ? ' today' : ''}">
        <div class="cal-week-day-head">
          <span class="cal-week-wd">${WEEKDAYS_SHORT_DE[i]}</span>
          <span class="cal-week-date">${d.getDate()}</span>
        </div>
        <div class="cal-week-body">
          ${bodyHTML}
          <button class="cal-wk-add" onclick="showCreateTrainingModal('${dateStr}')" aria-label="Training hinzufügen" title="Training hinzufügen">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
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
      <div class="form-row" style="display:flex;gap:10px">
        <div class="form-group" style="flex:1">
          <label>Datum *</label>
          <input type="date" name="date" value="${dateVal}" required>
        </div>
        <div class="form-group" style="flex:1">
          <label>Uhrzeit</label>
          <input type="time" name="time">
        </div>
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
    time:  form.time.value,
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

// ── Event Modals ──────────────────────────────────────────────────────────────
async function loadTeams() {
  try {
    const res = await fetch('/api/teams');
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

function eventFormHTML(dateVal, ev, teams) {
  const v = (f) => ev ? escHtml(ev[f] ?? '') : '';
  const sel = (val) => ev && ev.type === val ? 'selected' : '';
  const teamDropdown = teams && teams.length ? `
    <div class="form-group">
      <label>Team <span style="font-weight:400;color:var(--text-muted)">(optional)</span></label>
      <select name="team_id">
        <option value="">Kein Team – nur für mich sichtbar</option>
        ${teams.map(t => `<option value="${t.id}"${ev && ev.team_id === t.id ? ' selected' : ''}>${escHtml(t.name)}</option>`).join('')}
      </select>
    </div>` : '';
  return `
    <form id="event-form" onsubmit="submitEvent(event,${ev ? ev.id : 'null'},'${dateVal}')">
      <div class="form-group">
        <label>Titel *</label>
        <input type="text" name="title" value="${v('title')}" placeholder="z.B. Heimspiel vs. FC Rot" required autofocus>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Typ *</label>
          <select name="type" required>
            <option value="spiel" ${sel('spiel')}>Spiel</option>
            <option value="turnier" ${sel('turnier')}>Turnier</option>
            <option value="sonstiges" ${sel('sonstiges')}>Sonstiges</option>
          </select>
        </div>
        <div class="form-group">
          <label>Datum *</label>
          <input type="date" name="date" value="${ev ? escHtml(ev.date) : dateVal}" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Uhrzeit</label>
          <input type="time" name="time" value="${v('time')}">
        </div>
        <div class="form-group">
          <label>Ort</label>
          <input type="text" name="location" value="${v('location')}" placeholder="optional">
        </div>
      </div>
      ${teamDropdown}
      <div class="form-group">
        <label>Notizen</label>
        <textarea name="notes" rows="3" placeholder="optional">${v('notes')}</textarea>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        ${ev ? `<button type="button" class="btn btn-danger" style="margin-right:auto" onclick="deleteEventFromModal(${ev.id},'${dateVal}')">Löschen</button>` : ''}
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
        <button type="submit" class="btn btn-primary">${ev ? 'Speichern' : 'Termin erstellen'}</button>
      </div>
    </form>`;
}

async function showCreateEventModal(date) {
  const dateVal = date || toDateStr(new Date());
  openModal('Neuer Termin', `<div class="loading-spinner"><div class="spinner"></div></div>`);
  const teams = await loadTeams();
  document.getElementById('modal-content').innerHTML = eventFormHTML(dateVal, null, teams);
}

async function showEditEventModal(eventId, dateStr) {
  openModal('Termin bearbeiten', `<div class="loading-spinner"><div class="spinner"></div></div>`);
  const [evRes, teams] = await Promise.all([
    fetch(`/api/events?month=${dateStr.slice(0,7)}`),
    loadTeams()
  ]);
  if (!evRes.ok) { closeModal(); return; }
  const events = await evRes.json();
  const ev = events.find(e => e.id === eventId);
  if (!ev) { closeModal(); showToast('Termin nicht gefunden', 'error'); return; }
  document.getElementById('modal-content').innerHTML = eventFormHTML(dateStr, ev, teams);
}

async function submitEvent(e, editId, dateStr) {
  e.preventDefault();
  const form = e.target;
  const data = {
    title:    form.title.value.trim(),
    date:     form.date.value,
    type:     form.type.value,
    time:     form.time.value || null,
    location: form.location.value.trim() || null,
    notes:    form.notes.value.trim(),
    team_id:  form.team_id?.value ? parseInt(form.team_id.value) : null,
  };
  const url    = editId ? `/api/events/${editId}` : '/api/events';
  const method = editId ? 'PUT' : 'POST';
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  if (res.ok) {
    closeModal();
    showToast(editId ? 'Termin aktualisiert!' : 'Termin erstellt!', 'success');
    const targetDate = data.date;
    if (currentView === 'week') {
      await renderWeek();
    } else {
      await renderCalendar();
      selectDay(targetDate);
    }
  } else {
    const d = await res.json();
    showToast(d.error || 'Fehler', 'error');
  }
}

async function deleteEventFromModal(eventId, dateStr) {
  const res = await fetch(`/api/events/${eventId}`, { method: 'DELETE' });
  if (res.ok) {
    closeModal();
    showToast('Termin gelöscht', 'success');
    if (currentView === 'week') { await renderWeek(); } else { await renderCalendar(); selectDay(dateStr); }
  } else {
    showToast('Fehler beim Löschen', 'error');
  }
}

async function deleteEventFromSidebar(e, eventId, dateStr) {
  e.stopPropagation();
  const res = await fetch(`/api/events/${eventId}`, { method: 'DELETE' });
  if (res.ok) {
    showToast('Termin gelöscht', 'success');
    if (currentView === 'week') { await renderWeek(); } else { await renderCalendar(); selectDay(dateStr); }
  } else {
    showToast('Fehler beim Löschen', 'error');
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
