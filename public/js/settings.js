const user = mirqatInitShell('settings');
let allLists = {};

if (user) {
  if (user.role !== 'admin') {
    document.getElementById('mainContent').innerHTML = '<p class="empty-state">هذه الصفحة تتطلب صلاحية أدمن</p>';
  } else {
    init();
  }
}

async function init() {
  setupTabs();

  try {
    allLists = await mirqatApi('settings', 'getSettingsLists');
  } catch {
    allLists = {};
  }

  /* ---- القوائم ---- */
  document.getElementById('listKeySelect').addEventListener('change', renderListItems);
  document.getElementById('addItemBtn').addEventListener('click', addListItem);
  renderListItems();

  /* ---- معلومات المدرسة ---- */
  loadSchoolInfo();
  document.getElementById('schoolForm').addEventListener('submit', saveSchoolInfo);

  /* ---- توزيع المواد ---- */
  fillSelect('mx_branch', allLists.branches, 'الفرع');
  fillSelect('mx_stages', allLists.stages, 'المرحلة');
  fillSelect('mx_grades', allLists.grades, 'الصف');
  fillSelect('mx_sections', allLists.sections, 'الشعبة');
  fillSelect('mx_subject', allLists.subject, 'المادة');
  document.getElementById('addMatrixBtn').addEventListener('click', addMatrixRow);
  loadMatrix();

  /* ---- توزيع الدرجات ---- */
  fillSelect('gd_subject', allLists.subject, 'المادة');
  fillSelect('gd_eval_type', allLists.continuous_eval_types, 'نوع التقييم');
  document.getElementById('addDistBtn').addEventListener('click', addDistRow);
  loadDistribution();

  /* ---- الظهور ---- */
  buildCheckboxGroup('vis_results', allLists.grades);
  buildCheckboxGroup('vis_grades', allLists.grades);
  document.getElementById('saveVisibilityBtn').addEventListener('click', saveVisibility);
  loadVisibility();

  /* ---- التقويم والجدول ---- */
  setupScheduleSubTabs();
  fillSelect('cal_termFilter', allLists.terms, 'كل الترمات');
  document.getElementById('cal_termFilter').addEventListener('change', loadScheduleCalendar);
  document.getElementById('addCalendarBtn').addEventListener('click', () => openCalendarModal());
  document.getElementById('closeCalendarModal').addEventListener('click', () => { document.getElementById('calendarModal').hidden = true; });
  document.getElementById('cancelCalendarBtn').addEventListener('click', () => { document.getElementById('calendarModal').hidden = true; });
  document.getElementById('calendarForm').addEventListener('submit', submitCalendarForm);
  fillSelect('cf_term', allLists.terms);

  fillSelect('tt_branch', allLists.branches, 'الفرع');
  fillSelect('tt_grade', allLists.grades, 'الصف');
  fillSelect('tt_section', allLists.sections, 'الشعبة');
  document.getElementById('filterTimetableBtn').addEventListener('click', loadScheduleTimetable);
  document.getElementById('addTimetableBtn').addEventListener('click', () => openTimetableModal());
  document.getElementById('closeTimetableModal').addEventListener('click', () => { document.getElementById('timetableModal').hidden = true; });
  document.getElementById('cancelTimetableBtn').addEventListener('click', () => { document.getElementById('timetableModal').hidden = true; });
  document.getElementById('timetableForm').addEventListener('submit', submitTimetableForm);
  document.getElementById('ttf_employeeSearch').addEventListener('input', debounce(searchEmployeesForTimetable, 300));
  fillSelect('ttf_branch', allLists.branches);
  fillSelect('ttf_stage', allLists.stages);
  fillSelect('ttf_grade', allLists.grades);
  fillSelect('ttf_section', allLists.sections);
  fillSelect('ttf_subject', allLists.subject);

  document.getElementById('closeScheduleConfirmModal').addEventListener('click', closeScheduleConfirmModal);
  document.getElementById('cancelScheduleConfirmBtn').addEventListener('click', closeScheduleConfirmModal);
  document.getElementById('confirmScheduleDeleteBtn').addEventListener('click', performScheduleDelete);

  loadScheduleCalendar();
  loadScheduleTimetable();
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

function setupScheduleSubTabs() {
  document.querySelectorAll('#panel-schedule > .tabs > .tab-btn[data-schedview]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#panel-schedule > .tabs > .tab-btn[data-schedview]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('schedview-calendar').hidden = btn.dataset.schedview !== 'calendar';
      document.getElementById('schedview-timetable').hidden = btn.dataset.schedview !== 'timetable';
    });
  });
}

/* ================= التقويم الدراسي (CRUD) ================= */
let calendarCache = [];
let editingCalendarId = null;

async function loadScheduleCalendar() {
  const body = document.getElementById('calendarTableBody');
  body.innerHTML = '<tr><td colspan="8" class="loading-row">جارٍ التحميل...</td></tr>';
  const term = document.getElementById('cal_termFilter').value || undefined;

  try {
    calendarCache = await mirqatApi('schedule', 'getCalendar', { term });
    if (!calendarCache.length) { body.innerHTML = '<tr><td colspan="8" class="empty-state">لا يوجد أسابيع مضافة</td></tr>'; return; }

    body.innerHTML = calendarCache.map(c => `
      <tr>
        <td data-label="الترم">${c.term || '—'}</td>
        <td data-label="الفترة">${c.period || '—'}</td>
        <td data-label="الأسبوع">${c.week || '—'}</td>
        <td data-label="البداية">${c.week_start_date || '—'}</td>
        <td data-label="النهاية">${c.week_end_date || '—'}</td>
        <td data-label="الحدث">${c.event || '—'}</td>
        <td data-label="اللون"><span style="display:inline-block;width:16px;height:16px;border-radius:4px;background:${c.color || '#ccc'};"></span></td>
        <td>
          <div class="row-actions">
            <button class="btn btn-outline btn-sm" onclick="editCalendarRow(${c.id})">تعديل</button>
            <button class="btn btn-danger btn-sm" onclick="askScheduleDelete('calendar', ${c.id}, 'أسبوع ${c.week || ''}')">حذف</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    body.innerHTML = `<tr><td colspan="8" class="empty-state">تعذّر التحميل: ${e.message}</td></tr>`;
  }
}

function editCalendarRow(id) {
  const c = calendarCache.find(x => x.id === id);
  if (c) openCalendarModal(c);
}

function openCalendarModal(row = null) {
  editingCalendarId = row ? row.id : null;
  document.getElementById('calendarModalTitle').textContent = row ? 'تعديل أسبوع' : 'إضافة أسبوع';
  document.getElementById('cf_term').value = row?.term || '';
  document.getElementById('cf_period').value = row?.period || '';
  document.getElementById('cf_week').value = row?.week || '';
  document.getElementById('cf_start').value = row?.week_start_date || '';
  document.getElementById('cf_end').value = row?.week_end_date || '';
  document.getElementById('cf_event').value = row?.event || '';
  document.getElementById('cf_color').value = row?.color || '#356854';
  document.getElementById('calendarFormError').textContent = '';
  document.getElementById('calendarModal').hidden = false;
}

async function submitCalendarForm(e) {
  e.preventDefault();
  const errorEl = document.getElementById('calendarFormError');
  errorEl.textContent = '';

  const data = {
    term: document.getElementById('cf_term').value || null,
    period: document.getElementById('cf_period').value.trim() || null,
    week: document.getElementById('cf_week').value.trim() || null,
    week_start_date: document.getElementById('cf_start').value || null,
    week_end_date: document.getElementById('cf_end').value || null,
    event: document.getElementById('cf_event').value.trim() || null,
    color: document.getElementById('cf_color').value || null
  };

  const saveBtn = document.getElementById('saveCalendarBtn');
  saveBtn.disabled = true;
  try {
    await mirqatApi('schedule', 'saveCalendarEvent', editingCalendarId ? { id: editingCalendarId, data } : { data }, { cache: false });
    document.getElementById('calendarModal').hidden = true;
    loadScheduleCalendar();
  } catch (e) {
    errorEl.textContent = e.message;
  } finally {
    saveBtn.disabled = false;
  }
}

/* ================= الحصص والاختبارات (CRUD) ================= */
let timetableCache = [];
let editingTimetableId = null;
let selectedTimetableEmployee = null;

async function loadScheduleTimetable() {
  const body = document.getElementById('timetableTableBody');
  body.innerHTML = '<tr><td colspan="7" class="loading-row">جارٍ التحميل...</td></tr>';

  const type = document.getElementById('tt_type').value || undefined;
  const filters = {
    branch: document.getElementById('tt_branch').value || undefined,
    grade: document.getElementById('tt_grade').value || undefined,
    section: document.getElementById('tt_section').value || undefined
  };

  try {
    timetableCache = await mirqatApi('schedule', 'getTimetable', { type, filters });
    if (!timetableCache.length) { body.innerHTML = '<tr><td colspan="7" class="empty-state">لا يوجد حصص/اختبارات مطابقة</td></tr>'; return; }

    body.innerHTML = timetableCache.map(t => `
      <tr>
        <td data-label="النوع">${t.entry_type || '—'}</td>
        <td data-label="اليوم">${t.day || '—'}</td>
        <td data-label="الوقت">${t.exam_date ? (t.exam_date + ' — ' + (t.exam_time || '')) : (t.exam_time || '—')}</td>
        <td data-label="المادة">${t.subject || '—'}</td>
        <td data-label="الصف">${t.grade || '—'} ${t.section || ''}</td>
        <td data-label="المعلم">${t.employee_name || '—'}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-outline btn-sm" onclick="editTimetableRow(${t.id})">تعديل</button>
            <button class="btn btn-danger btn-sm" onclick="askScheduleDelete('timetable', ${t.id}, '${(t.subject || 'حصة').replace(/'/g, "\\'")}')">حذف</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    body.innerHTML = `<tr><td colspan="7" class="empty-state">تعذّر التحميل: ${e.message}</td></tr>`;
  }
}

function editTimetableRow(id) {
  const t = timetableCache.find(x => x.id === id);
  if (t) openTimetableModal(t);
}

function openTimetableModal(row = null) {
  editingTimetableId = row ? row.id : null;
  selectedTimetableEmployee = row ? { id: row.employee_id, name: row.employee_name } : null;
  document.getElementById('timetableModalTitle').textContent = row ? 'تعديل حصة/اختبار' : 'إضافة حصة/اختبار';
  document.getElementById('ttf_entry_type').value = row?.entry_type || 'جدول حصص';
  document.getElementById('ttf_branch').value = row?.branch || '';
  document.getElementById('ttf_stage').value = row?.stage || '';
  document.getElementById('ttf_grade').value = row?.grade || '';
  document.getElementById('ttf_section').value = row?.section || '';
  document.getElementById('ttf_day').value = row?.day || 'الأحد';
  document.getElementById('ttf_period_number').value = row?.period_number || '';
  document.getElementById('ttf_time').value = row?.exam_time || '';
  document.getElementById('ttf_exam_date').value = row?.exam_date || '';
  document.getElementById('ttf_exam_period').value = row?.exam_period || '';
  document.getElementById('ttf_subject').value = row?.subject || '';
  document.getElementById('ttf_employeeSearch').value = row?.employee_name || '';
  document.getElementById('ttf_employee_id').value = row?.employee_id || '';
  document.getElementById('ttf_selectedEmployee').textContent = row?.employee_name ? `المحدد: ${row.employee_name}` : '';
  document.getElementById('ttf_employeeResults').innerHTML = '';
  document.getElementById('timetableFormError').textContent = '';
  document.getElementById('timetableModal').hidden = false;
}

async function searchEmployeesForTimetable() {
  const q = document.getElementById('ttf_employeeSearch').value.trim();
  const results = document.getElementById('ttf_employeeResults');
  if (q.length < 2) { results.innerHTML = ''; return; }
  try {
    const res = await mirqatApi('employees', 'list', { filters: { search: q } });
    results.innerHTML = res.rows.slice(0, 8).map(e =>
      `<span class="chip" style="cursor:pointer" onclick="selectTimetableEmployee('${e.id}', '${e.name_ar.replace(/'/g, "\\'")}')">${e.name_ar}</span>`
    ).join('') || '<span class="chip">لا نتائج</span>';
  } catch { /* silent */ }
}

function selectTimetableEmployee(id, name) {
  selectedTimetableEmployee = { id, name };
  document.getElementById('ttf_employee_id').value = id;
  document.getElementById('ttf_employeeSearch').value = name;
  document.getElementById('ttf_selectedEmployee').textContent = `المحدد: ${name}`;
  document.getElementById('ttf_employeeResults').innerHTML = '';
}

async function submitTimetableForm(e) {
  e.preventDefault();
  const errorEl = document.getElementById('timetableFormError');
  errorEl.textContent = '';

  const data = {
    entry_type: document.getElementById('ttf_entry_type').value,
    branch: document.getElementById('ttf_branch').value || null,
    stage: document.getElementById('ttf_stage').value || null,
    grade: document.getElementById('ttf_grade').value || null,
    section: document.getElementById('ttf_section').value || null,
    day: document.getElementById('ttf_day').value,
    period_number: document.getElementById('ttf_period_number').value || null,
    exam_time: document.getElementById('ttf_time').value.trim() || null,
    exam_date: document.getElementById('ttf_exam_date').value || null,
    exam_period: document.getElementById('ttf_exam_period').value.trim() || null,
    subject: document.getElementById('ttf_subject').value || null,
    employee_id: document.getElementById('ttf_employee_id').value || null,
    employee_name: selectedTimetableEmployee?.name || null
  };

  const saveBtn = document.getElementById('saveTimetableBtn');
  saveBtn.disabled = true;
  try {
    await mirqatApi('schedule', 'saveTimetableEntry', editingTimetableId ? { id: editingTimetableId, data } : { data }, { cache: false });
    document.getElementById('timetableModal').hidden = true;
    loadScheduleTimetable();
  } catch (e) {
    errorEl.textContent = e.message;
  } finally {
    saveBtn.disabled = false;
  }
}

/* ================= حذف مشترك (تقويم/جدول) ================= */
let scheduleDeleteTarget = null;

function askScheduleDelete(kind, id, label) {
  scheduleDeleteTarget = { kind, id };
  document.getElementById('scheduleConfirmMessage').textContent = `سيتم حذف "${label}" نهائيًا.`;
  document.getElementById('scheduleConfirmModal').hidden = false;
}

function closeScheduleConfirmModal() {
  document.getElementById('scheduleConfirmModal').hidden = true;
  scheduleDeleteTarget = null;
}

async function performScheduleDelete() {
  if (!scheduleDeleteTarget) return;
  try {
    if (scheduleDeleteTarget.kind === 'calendar') {
      await mirqatApi('schedule', 'deleteCalendarEvent', { id: scheduleDeleteTarget.id }, { cache: false });
      closeScheduleConfirmModal();
      loadScheduleCalendar();
    } else {
      await mirqatApi('schedule', 'deleteTimetableEntry', { id: scheduleDeleteTarget.id }, { cache: false });
      closeScheduleConfirmModal();
      loadScheduleTimetable();
    }
  } catch (e) {
    alert('تعذّر الحذف: ' + e.message);
  }
}

function setupTabs() {
  document.querySelectorAll('#mainTabs > .settings-nav-item[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#mainTabs > .settings-nav-item[data-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.settings-content > .tab-panel').forEach(p => p.hidden = true);
      document.getElementById('panel-' + btn.dataset.tab).hidden = false;
    });
  });
}

function fillSelect(id, options = [], placeholder = null) {
  const el = document.getElementById(id);
  el.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : '') +
    (options || []).map(o => `<option value="${o}">${o}</option>`).join('');
}

function buildCheckboxGroup(id, options = []) {
  document.getElementById(id).innerHTML =
    (options || []).map(o => `<label><input type="checkbox" value="${o}"> ${o}</label>`).join('');
}

/* ================= القوائم ================= */
function renderListItems() {
  const key = document.getElementById('listKeySelect').value;
  const items = allLists[key] || [];
  document.getElementById('listItems').innerHTML = items.length
    ? items.map(v => `
        <span class="chip">${v}
          <button onclick="removeListItem('${key}', '${v.replace(/'/g, "\\'")}')" style="border:none;background:none;color:var(--warn);cursor:pointer;margin-right:4px;">✕</button>
        </span>
      `).join('')
    : '<span class="chip">لا عناصر</span>';
}

async function addListItem() {
  const key = document.getElementById('listKeySelect').value;
  const input = document.getElementById('newItemInput');
  const value = input.value.trim();
  if (!value) return;

  try {
    await mirqatApi('settings', 'addSettingsItem', { key, value }, { cache: false });
    allLists[key] = [...(allLists[key] || []), value];
    input.value = '';
    renderListItems();
  } catch (e) {
    alert('تعذّر الإضافة: ' + e.message);
  }
}

async function removeListItem(key, value) {
  try {
    await mirqatApi('settings', 'removeSettingsItem', { key, value }, { cache: false });
    allLists[key] = (allLists[key] || []).filter(v => v !== value);
    renderListItems();
  } catch (e) {
    alert('تعذّر الحذف: ' + e.message);
  }
}

/* ================= معلومات المدرسة ================= */
async function loadSchoolInfo() {
  try {
    const info = await mirqatApi('settings', 'getSchoolInfo');
    document.getElementById('sf_name').value = info.name || '';
    document.getElementById('sf_logo').value = info.logo || '';
  } catch { /* silent */ }
}

async function saveSchoolInfo(e) {
  e.preventDefault();
  const errorEl = document.getElementById('schoolFormError');
  errorEl.textContent = '';
  try {
    await mirqatApi('settings', 'setSchoolInfo', {
      name: document.getElementById('sf_name').value.trim(),
      logoUrl: document.getElementById('sf_logo').value.trim() || null
    }, { cache: false });
  } catch (e) {
    errorEl.textContent = e.message;
  }
}

/* ================= توزيع المواد ================= */
async function loadMatrix() {
  const body = document.getElementById('matrixTableBody');
  body.innerHTML = '<tr><td colspan="6" class="loading-row">جارٍ التحميل...</td></tr>';
  try {
    const rows = await mirqatApi('settings', 'getSubjectMatrixRows');
    if (!rows.length) { body.innerHTML = '<tr><td colspan="6" class="empty-state">لا يوجد صفوف</td></tr>'; return; }
    body.innerHTML = rows.map(r => `
      <tr>
        <td>${r.branch || '—'}</td><td>${r.stages || '—'}</td><td>${r.grades || '—'}</td>
        <td>${r.sections || '—'}</td><td>${r.subject}</td>
        <td><button class="btn btn-danger btn-sm" onclick="deleteMatrixRow(${r.id})">حذف</button></td>
      </tr>
    `).join('');
  } catch (e) {
    body.innerHTML = `<tr><td colspan="6" class="empty-state">تعذّر التحميل: ${e.message}</td></tr>`;
  }
}

async function addMatrixRow() {
  const data = {
    branch: document.getElementById('mx_branch').value || null,
    stages: document.getElementById('mx_stages').value || null,
    grades: document.getElementById('mx_grades').value || null,
    sections: document.getElementById('mx_sections').value || null,
    subject: document.getElementById('mx_subject').value
  };
  if (!data.subject) { alert('اختر المادة'); return; }
  try {
    await mirqatApi('settings', 'saveSubjectMatrixRow', { data }, { cache: false });
    loadMatrix();
  } catch (e) {
    alert('تعذّر الإضافة: ' + e.message);
  }
}

async function deleteMatrixRow(id) {
  try {
    await mirqatApi('settings', 'deleteSubjectMatrixRow', { id }, { cache: false });
    loadMatrix();
  } catch (e) {
    alert('تعذّر الحذف: ' + e.message);
  }
}

/* ================= توزيع الدرجات ================= */
async function loadDistribution() {
  const body = document.getElementById('distTableBody');
  body.innerHTML = '<tr><td colspan="4" class="loading-row">جارٍ التحميل...</td></tr>';
  try {
    const rows = await mirqatApi('settings', 'getGradeDistributionRows');
    if (!rows.length) { body.innerHTML = '<tr><td colspan="4" class="empty-state">لا يوجد صفوف</td></tr>'; return; }
    body.innerHTML = rows.map(r => `
      <tr>
        <td>${r.subject}</td><td>${r.eval_type}</td><td>${r.percentage}%</td>
        <td><button class="btn btn-danger btn-sm" onclick="deleteDistRow(${r.id})">حذف</button></td>
      </tr>
    `).join('');
  } catch (e) {
    body.innerHTML = `<tr><td colspan="4" class="empty-state">تعذّر التحميل: ${e.message}</td></tr>`;
  }
}

async function addDistRow() {
  const data = {
    subject: document.getElementById('gd_subject').value,
    eval_type: document.getElementById('gd_eval_type').value,
    percentage: document.getElementById('gd_percentage').value
  };
  if (!data.subject || !data.eval_type || !data.percentage) { alert('عبّي كل الحقول'); return; }
  try {
    await mirqatApi('settings', 'saveGradeDistRow', { data }, { cache: false });
    document.getElementById('gd_percentage').value = '';
    loadDistribution();
  } catch (e) {
    alert('تعذّر الإضافة: ' + e.message);
  }
}

async function deleteDistRow(id) {
  try {
    await mirqatApi('settings', 'deleteGradeDistRow', { id }, { cache: false });
    loadDistribution();
  } catch (e) {
    alert('تعذّر الحذف: ' + e.message);
  }
}

/* ================= الظهور ================= */
async function loadVisibility() {
  try {
    const settings = await mirqatApi('settings', 'getVisibilitySettings');
    checkValues('vis_results', settings.results_control || []);
    checkValues('vis_grades', settings.grades_control || []);
    document.getElementById('vis_manual_date').checked = (settings.manual_date_entry || []).includes('نعم');
  } catch { /* silent */ }
}

function checkValues(containerId, values) {
  document.querySelectorAll(`#${containerId} input`).forEach(i => {
    i.checked = values.includes(i.value) || values.includes('الكل');
  });
}

function getCheckedValues(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} input:checked`)).map(i => i.value);
}

async function saveVisibility() {
  const errorEl = document.getElementById('visibilityError');
  errorEl.textContent = '';
  try {
    await mirqatApi('settings', 'setVisibilitySettings', { key: 'results_control', values: getCheckedValues('vis_results') }, { cache: false });
    await mirqatApi('settings', 'setVisibilitySettings', { key: 'grades_control', values: getCheckedValues('vis_grades') }, { cache: false });
    await mirqatApi('settings', 'setVisibilitySettings', { key: 'manual_date_entry', values: [document.getElementById('vis_manual_date').checked ? 'نعم' : 'لا'] }, { cache: false });
  } catch (e) {
    errorEl.textContent = e.message;
  }
}
