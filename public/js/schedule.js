const user = mirqatInitShell('schedule');
let allLists = {};
let evalTypes = [];
let fullCalendar = [];
let currentWeekInfo = null;
let viewYear, viewMonth; // شهر العرض الحالي (0-indexed للشهر)
const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const SCHOOL_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];

if (user) init();

async function init() {
  try {
    [allLists, evalTypes] = await Promise.all([
      mirqatApi('settings', 'getSettingsLists'),
      mirqatApi('settings', 'getEvalTypes')
    ]);
  } catch { allLists = {}; evalTypes = []; }

  try { fullCalendar = await mirqatApi('schedule', 'getCalendar', {}); } catch { fullCalendar = []; }
  try { currentWeekInfo = await mirqatApi('schedule', 'getCurrentTermInfo', {}); } catch { currentWeekInfo = null; }

  const today = new Date();
  viewYear = today.getFullYear();
  viewMonth = today.getMonth();

  setupMainTabs();
  setupCalendarSubTabs();

  document.getElementById('prevMonthBtn').addEventListener('click', () => changeMonth(-1));
  document.getElementById('nextMonthBtn').addEventListener('click', () => changeMonth(1));
  renderMonth();

  fillSelect('week_termFilter', allLists.terms, 'كل الترمات');
  document.getElementById('week_termFilter').addEventListener('change', renderWeekList);
  renderWeekList();

  if (user.role === 'admin') {
    document.getElementById('ttAdminFilters').style.display = 'flex';
    fillSelect('tt_branch', allLists.branches, 'الفرع');
    fillSelect('tt_grade', allLists.grades, 'الصف');
    fillSelect('tt_section', allLists.sections, 'الشعبة');
    document.getElementById('filterTimetableBtn').addEventListener('click', loadTimetable);
  }

  fillSelect('pt_eval_type', evalTypes);
  setupPeriodModal();

  loadTimetable();
  loadExams();
}

function fillSelect(id, options = [], placeholder = null) {
  const el = document.getElementById(id);
  el.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : '') + (options || []).map(o => `<option value="${o}">${o}</option>`).join('');
}

function setupMainTabs() {
  document.querySelectorAll('.content > .tabs > .tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.content > .tabs > .tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ['calendar', 'timetable', 'exams'].forEach(t => {
        document.getElementById('panel-' + t).hidden = t !== btn.dataset.tab;
      });
    });
  });
}

function setupCalendarSubTabs() {
  document.querySelectorAll('#panel-calendar > .tabs > .tab-btn[data-calview]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#panel-calendar > .tabs > .tab-btn[data-calview]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('calview-month').hidden = btn.dataset.calview !== 'month';
      document.getElementById('calview-week').hidden = btn.dataset.calview !== 'week';
    });
  });
}

/* ================= عرض شهري ================= */
function findWeekForDate(dateStr) {
  return fullCalendar.find(w => w.week_start_date && w.week_end_date && dateStr >= w.week_start_date && dateStr <= w.week_end_date);
}

function changeMonth(delta) {
  viewMonth += delta;
  if (viewMonth < 0) { viewMonth = 11; viewYear--; }
  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  renderMonth();
}

function renderMonth() {
  const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  document.getElementById('monthLabel').textContent = `${monthNames[viewMonth]} ${viewYear}`;

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startOffset = firstOfMonth.getDay(); // 0=الأحد
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const grid = document.getElementById('monthGrid');
  grid.innerHTML = DAY_NAMES.map(n => `<div class="day-name">${n}</div>`).join('') +
    cells.map(d => {
      if (!d) return `<div class="month-cell muted"></div>`;
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const week = findWeekForDate(dateStr);
      const isToday = dateStr === todayStr;
      const isSchoolDay = SCHOOL_DAYS.includes(DAY_NAMES[new Date(dateStr).getDay()]);
      const style = week?.color ? `style="--cell-color:${week.color}"` : '';
      return `
        <div class="month-cell${isToday ? ' today' : ''}${!isSchoolDay ? ' non-school' : ''}">
          <div class="day-num">${d}</div>
          ${week ? `<span class="day-event" ${style} title="${week.event || ''}">${week.event || week.week}</span>` : ''}
        </div>
      `;
    }).join('');
}

/* ================= عرض أسبوعي ================= */
function renderWeekList() {
  const term = document.getElementById('week_termFilter').value;
  const weeks = term ? fullCalendar.filter(w => w.term === term) : fullCalendar;
  const list = document.getElementById('weekList');

  if (!weeks.length) { list.innerHTML = '<p class="empty-state">لا يوجد أسابيع في التقويم</p>'; return; }

  list.innerHTML = weeks.map(w => {
    const start = w.week_start_date ? new Date(w.week_start_date) : null;
    const days = start ? SCHOOL_DAYS.map((name, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return { name, date: d.toISOString().slice(0, 10) };
    }) : [];

    return `
      <div class="week-card">
        <div class="week-card-header" style="--cell-color:${w.color || '#356854'}">
          <span>${w.term || ''} — ${w.week || ''} ${w.period ? '(' + w.period + ')' : ''}</span>
          <span>${w.week_start_date || ''} إلى ${w.week_end_date || ''}</span>
        </div>
        <div class="week-card-days">
          ${days.map(d => `
            <div class="week-day-cell">
              <div class="wd-name">${d.name}</div>
              <div class="wd-date">${d.date}</div>
              <span class="day-event" style="--cell-color:${w.color || '#356854'}">${w.event || '—'}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

/* ================= جدول الحصص ================= */
async function loadTimetable() {
  const grid = document.getElementById('timetableGrid');
  grid.innerHTML = '<p class="loading-row">جارٍ التحميل...</p>';

  const filters = {};
  if (user.role === 'admin') {
    filters.branch = document.getElementById('tt_branch').value || undefined;
    filters.grade = document.getElementById('tt_grade').value || undefined;
    filters.section = document.getElementById('tt_section').value || undefined;
  }

  try {
    const periods = await mirqatApi('schedule', 'getTimetable', { type: 'جدول حصص', filters });
    if (!periods.length) { grid.innerHTML = '<p class="empty-state">لا يوجد حصص مضافة ضمن نطاقك</p>'; return; }

    grid.innerHTML = SCHOOL_DAYS.map(day => {
      const dayPeriods = periods.filter(p => p.day === day).sort((a, b) => (a.period_number || 0) - (b.period_number || 0));
      return `
        <div class="timetable-day-col">
          <h4>${day}</h4>
          ${dayPeriods.length ? dayPeriods.map(p => `
            <div class="period-card" onclick='openPeriodModal(${JSON.stringify(p).replace(/'/g, "&apos;")})'>
              <div class="p-subject">${p.subject || '—'}</div>
              <div class="p-meta">${p.grade || ''} ${p.section || ''}${p.period_number ? ' · حصة ' + p.period_number : ''}</div>
            </div>
          `).join('') : '<p style="font-size:11px; color:var(--muted); text-align:center;">لا يوجد</p>'}
        </div>
      `;
    }).join('');
  } catch (e) {
    grid.innerHTML = `<p class="empty-state">تعذّر التحميل: ${e.message}</p>`;
  }
}

/* ================= جدول الاختبارات (عرض فقط) ================= */
async function loadExams() {
  const body = document.getElementById('examsTableBody');
  try {
    const exams = await mirqatApi('schedule', 'getTimetable', { type: 'جدول اختبار', filters: {} });
    if (!exams.length) { body.innerHTML = '<tr><td colspan="6" class="empty-state">لا يوجد اختبارات مجدولة</td></tr>'; return; }

    body.innerHTML = exams.map(e => `
      <tr>
        <td data-label="المادة">${e.subject || '—'}</td>
        <td data-label="الصف">${e.grade || ''} ${e.section || ''}</td>
        <td data-label="اليوم">${e.day || '—'}</td>
        <td data-label="التاريخ">${e.exam_date || '—'}</td>
        <td data-label="الفترة">${e.exam_period || e.exam_time || '—'}</td>
        <td data-label="المراقب">${e.employee_name || '—'}</td>
      </tr>
    `).join('');
  } catch (e) {
    body.innerHTML = `<tr><td colspan="6" class="empty-state">تعذّر التحميل: ${e.message}</td></tr>`;
  }
}

/* ================= إنشاء تكليف/إثراء من حصة ================= */
let currentPeriod = null;

function setupPeriodModal() {
  document.querySelectorAll('#periodModal .tab-btn[data-ptype]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#periodModal .tab-btn[data-ptype]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const isTask = btn.dataset.ptype === 'task';
      document.getElementById('periodTaskForm').hidden = !isTask;
      document.getElementById('periodEnrichForm').hidden = isTask;
      document.getElementById('savePeriodTaskBtn').hidden = !isTask;
      document.getElementById('savePeriodEnrichBtn').hidden = isTask;
    });
  });

  document.getElementById('closePeriodModal').addEventListener('click', closePeriodModal);
  document.getElementById('cancelPeriodBtn').addEventListener('click', closePeriodModal);
  document.getElementById('periodTaskForm').addEventListener('submit', submitPeriodTask);
  document.getElementById('periodEnrichForm').addEventListener('submit', submitPeriodEnrich);
}

function openPeriodModal(period) {
  currentPeriod = period;
  document.getElementById('periodModalTitle').textContent = `إنشاء لحصة ${period.subject || ''}`;
  document.getElementById('periodContext').textContent =
    `${period.grade || ''} ${period.section || ''} — ${period.day || ''} — ${currentWeekInfo ? currentWeekInfo.term + ' / ' + currentWeekInfo.week : 'لا يوجد أسبوع حالي محدَّد'}`;
  document.getElementById('pt_task_name').value = '';
  document.getElementById('pt_max_score').value = '';
  document.getElementById('pt_due_date').value = '';
  document.getElementById('pe_title').value = '';
  document.getElementById('pe_link').value = '';
  document.getElementById('pe_details').value = '';
  document.getElementById('periodTaskError').textContent = '';
  document.getElementById('periodEnrichError').textContent = '';
  document.getElementById('periodModal').hidden = false;
}

function closePeriodModal() { document.getElementById('periodModal').hidden = true; currentPeriod = null; }

async function submitPeriodTask(e) {
  e.preventDefault();
  const errorEl = document.getElementById('periodTaskError');
  errorEl.textContent = '';

  if (!currentWeekInfo) { errorEl.textContent = 'لا يوجد أسبوع دراسي حالي محدَّد بالتقويم'; return; }

  const data = {
    branch: currentPeriod.branch, stages: currentPeriod.stage, grades: currentPeriod.grade, sections: currentPeriod.section,
    subject: currentPeriod.subject, term: currentWeekInfo.term,
    task_name: document.getElementById('pt_task_name').value.trim(),
    eval_type: document.getElementById('pt_eval_type').value,
    max_score: document.getElementById('pt_max_score').value,
    due_date: document.getElementById('pt_due_date').value || null,
    issue_date: new Date().toISOString().slice(0, 10)
  };
  if (!data.task_name || !data.max_score) { errorEl.textContent = 'اسم التكليف والدرجة العظمى مطلوبان'; return; }

  try {
    await mirqatApi('tasks', 'saveTask', { data }, { cache: false });
    closePeriodModal();
    alert('تم إنشاء التكليف ✓');
  } catch (err) { errorEl.textContent = err.message; }
}

async function submitPeriodEnrich(e) {
  e.preventDefault();
  const errorEl = document.getElementById('periodEnrichError');
  errorEl.textContent = '';

  const data = {
    branch: currentPeriod.branch, stages: currentPeriod.stage, grades: currentPeriod.grade, sections: currentPeriod.section,
    subject: currentPeriod.subject, term: currentWeekInfo?.term || null,
    title: document.getElementById('pe_title').value.trim(),
    content_type: document.getElementById('pe_content_type').value,
    link: document.getElementById('pe_link').value.trim(),
    details: document.getElementById('pe_details').value.trim() || null,
    publish_date: new Date().toISOString().slice(0, 10)
  };
  if (!data.title || !data.link) { errorEl.textContent = 'العنوان والرابط مطلوبان'; return; }

  try {
    await mirqatApi('tasks', 'saveEnrichment', { data }, { cache: false });
    closePeriodModal();
    alert('تم إنشاء الإثراء ✓');
  } catch (err) { errorEl.textContent = err.message; }
}
