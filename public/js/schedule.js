const user = mirqatInitShell('schedule');
let allLists = {};
let calendarCache = [];
let timetableCache = [];
let editingCalendarId = null;
let editingTimetableId = null;
let deleteTarget = null; // { kind: 'calendar'|'timetable', id }

if (user) init();

async function init() {
  try {
    allLists = await mirqatApi('settings', 'getSettingsLists');
  } catch {
    allLists = {};
  }

  setupTabs();

  fillSelect('cal_termFilter', allLists.terms, 'كل الترمات');
  fillSelect('cf_term', allLists.terms);

  fillSelect('tt_branch', allLists.branches, 'الفرع');
  fillSelect('tt_stage', allLists.stages, 'المرحلة');
  fillSelect('tt_grade', allLists.grades, 'الصف');
  fillSelect('tt_section', allLists.sections, 'الشعبة');

  fillSelect('ttf_branch', allLists.branches);
  fillSelect('ttf_stage', allLists.stages);
  fillSelect('ttf_grade', allLists.grades);
  fillSelect('ttf_section', allLists.sections);
  fillSelect('ttf_subject', allLists.subject);

  if (user.role !== 'admin') {
    document.getElementById('addCalendarBtn').style.display = 'none';
    document.getElementById('addTimetableBtn').style.display = 'none';
  }

  document.getElementById('cal_termFilter').addEventListener('change', loadCalendar);
  document.getElementById('addCalendarBtn').addEventListener('click', () => openCalendarModal());
  document.getElementById('closeCalendarModal').addEventListener('click', closeCalendarModal);
  document.getElementById('cancelCalendarBtn').addEventListener('click', closeCalendarModal);
  document.getElementById('calendarForm').addEventListener('submit', submitCalendarForm);

  document.getElementById('filterTimetableBtn').addEventListener('click', loadTimetable);
  document.getElementById('addTimetableBtn').addEventListener('click', () => openTimetableModal());
  document.getElementById('closeTimetableModal').addEventListener('click', closeTimetableModal);
  document.getElementById('cancelTimetableBtn').addEventListener('click', closeTimetableModal);
  document.getElementById('timetableForm').addEventListener('submit', submitTimetableForm);

  document.getElementById('closeConfirmModal').addEventListener('click', closeConfirmModal);
  document.getElementById('cancelConfirmBtn').addEventListener('click', closeConfirmModal);
  document.getElementById('confirmDeleteBtn').addEventListener('click', performDelete);

  loadCalendar();
  loadTimetable();
}

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('panel-calendar').hidden = btn.dataset.tab !== 'calendar';
      document.getElementById('panel-timetable').hidden = btn.dataset.tab !== 'timetable';
    });
  });
}

function fillSelect(id, options = [], placeholder = null) {
  const el = document.getElementById(id);
  el.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : '') +
    (options || []).map(o => `<option value="${o}">${o}</option>`).join('');
}

/* ================= التقويم ================= */
async function loadCalendar() {
  const body = document.getElementById('calendarTableBody');
  body.innerHTML = '<tr><td colspan="7" class="loading-row">جارٍ التحميل...</td></tr>';

  const term = document.getElementById('cal_termFilter').value || undefined;

  try {
    calendarCache = await mirqatApi('schedule', 'getCalendar', { term });
    if (!calendarCache.length) {
      body.innerHTML = '<tr><td colspan="7" class="empty-state">لا يوجد أسابيع مضافة</td></tr>';
      return;
    }
    body.innerHTML = calendarCache.map(c => `
      <tr>
        <td data-label="الترم">${c.term || '—'}</td><td data-label="الفترة">${c.period || '—'}</td><td data-label="الأسبوع">${c.week || '—'}</td>
        <td data-label="البداية">${c.week_start_date || '—'}</td><td data-label="النهاية">${c.week_end_date || '—'}</td><td data-label="الحدث">${c.event || '—'}</td>
        <td>
          ${user.role === 'admin' ? `
            <div class="row-actions">
              <button class="btn btn-outline btn-sm" onclick="editCalendarRow(${c.id})">تعديل</button>
              <button class="btn btn-danger btn-sm" onclick="askDelete('calendar', ${c.id}, 'أسبوع ${c.week || ''}')">حذف</button>
            </div>` : ''}
        </td>
      </tr>
    `).join('');
  } catch (e) {
    body.innerHTML = `<tr><td colspan="7" class="empty-state">تعذّر التحميل: ${e.message}</td></tr>`;
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
  document.getElementById('calendarFormError').textContent = '';
  document.getElementById('calendarModal').hidden = false;
}

function closeCalendarModal() { document.getElementById('calendarModal').hidden = true; }

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
    event: document.getElementById('cf_event').value.trim() || null
  };

  const saveBtn = document.getElementById('saveCalendarBtn');
  saveBtn.disabled = true;
  try {
    await mirqatApi('schedule', 'saveCalendarEvent', editingCalendarId ? { id: editingCalendarId, data } : { data });
    closeCalendarModal();
    loadCalendar();
  } catch (e) {
    errorEl.textContent = e.message;
  } finally {
    saveBtn.disabled = false;
  }
}

/* ================= الجدول ================= */
async function loadTimetable() {
  const body = document.getElementById('timetableTableBody');
  body.innerHTML = '<tr><td colspan="7" class="loading-row">جارٍ التحميل...</td></tr>';

  const type = document.getElementById('tt_type').value || undefined;
  const filters = {
    branch: document.getElementById('tt_branch').value || undefined,
    stage: document.getElementById('tt_stage').value || undefined,
    grade: document.getElementById('tt_grade').value || undefined,
    section: document.getElementById('tt_section').value || undefined
  };

  try {
    timetableCache = await mirqatApi('schedule', 'getTimetable', { type, filters });
    if (!timetableCache.length) {
      body.innerHTML = '<tr><td colspan="7" class="empty-state">لا يوجد حصص/اختبارات مطابقة</td></tr>';
      return;
    }
    body.innerHTML = timetableCache.map(t => `
      <tr>
        <td data-label="النوع">${t.entry_type || '—'}</td><td data-label="اليوم">${t.day || '—'}</td>
        <td data-label="الوقت">${t.exam_date ? (t.exam_date + ' — ' + (t.exam_time || '')) : (t.exam_time || '—')}</td>
        <td data-label="المادة">${t.subject || '—'}</td><td data-label="الصف">${t.grade || '—'}</td><td data-label="المعلم">${t.employee_name || '—'}</td>
        <td>
          ${user.role === 'admin' ? `
            <div class="row-actions">
              <button class="btn btn-outline btn-sm" onclick="editTimetableRow(${t.id})">تعديل</button>
              <button class="btn btn-danger btn-sm" onclick="askDelete('timetable', ${t.id}, '${(t.subject || 'حصة').replace(/'/g, "\\'")}')">حذف</button>
            </div>` : ''}
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
  document.getElementById('timetableModalTitle').textContent = row ? 'تعديل حصة/اختبار' : 'إضافة حصة/اختبار';
  document.getElementById('ttf_entry_type').value = row?.entry_type || 'جدول حصص';
  document.getElementById('ttf_branch').value = row?.branch || '';
  document.getElementById('ttf_stage').value = row?.stage || '';
  document.getElementById('ttf_grade').value = row?.grade || '';
  document.getElementById('ttf_section').value = row?.section || '';
  document.getElementById('ttf_day').value = row?.day || 'الأحد';
  document.getElementById('ttf_time').value = row?.exam_time || '';
  document.getElementById('ttf_exam_date').value = row?.exam_date || '';
  document.getElementById('ttf_exam_period').value = row?.exam_period || '';
  document.getElementById('ttf_subject').value = row?.subject || '';
  document.getElementById('timetableFormError').textContent = '';
  document.getElementById('timetableModal').hidden = false;
}

function closeTimetableModal() { document.getElementById('timetableModal').hidden = true; }

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
    exam_time: document.getElementById('ttf_time').value.trim() || null,
    exam_date: document.getElementById('ttf_exam_date').value || null,
    exam_period: document.getElementById('ttf_exam_period').value.trim() || null,
    subject: document.getElementById('ttf_subject').value || null,
    employee_id: user.employeeId,
    employee_name: user.name
  };

  const saveBtn = document.getElementById('saveTimetableBtn');
  saveBtn.disabled = true;
  try {
    await mirqatApi('schedule', 'saveTimetableEntry', editingTimetableId ? { id: editingTimetableId, data } : { data });
    closeTimetableModal();
    loadTimetable();
  } catch (e) {
    errorEl.textContent = e.message;
  } finally {
    saveBtn.disabled = false;
  }
}

/* ================= حذف مشترك ================= */
function askDelete(kind, id, label) {
  deleteTarget = { kind, id };
  document.getElementById('confirmMessage').textContent = `سيتم حذف "${label}" نهائيًا.`;
  document.getElementById('confirmModal').hidden = false;
}

function closeConfirmModal() {
  document.getElementById('confirmModal').hidden = true;
  deleteTarget = null;
}

async function performDelete() {
  if (!deleteTarget) return;
  try {
    if (deleteTarget.kind === 'calendar') {
      await mirqatApi('schedule', 'deleteCalendarEvent', { id: deleteTarget.id });
      closeConfirmModal();
      loadCalendar();
    } else {
      await mirqatApi('schedule', 'deleteTimetableEntry', { id: deleteTarget.id });
      closeConfirmModal();
      loadTimetable();
    }
  } catch (e) {
    alert('تعذّر الحذف: ' + e.message);
  }
}
