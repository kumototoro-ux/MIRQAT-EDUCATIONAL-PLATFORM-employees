const user = mirqatInitShell('grading');
let allLists = {};
let evalTypes = [];
let mySubjects = [];
let currentSubject = null;
let currentSubTab = 'fromTask';
let selectedTeacher = null; // { id, name, subject, branch, stages, grades, sections }
let currentRoster = [];
let currentLogPage = 1;
let editTargetId = null;
let deleteTargetId = null;

function splitList(v) { return (v || '').split(',').map(s => s.trim()).filter(Boolean); }

if (user) init();

async function init() {
  try {
    [allLists, evalTypes] = await Promise.all([
      mirqatApi('settings', 'getSettingsLists'),
      mirqatApi('settings', 'getEvalTypes')
    ]);
  } catch { allLists = {}; evalTypes = []; }

  if (user.role === 'admin') {
    document.getElementById('adminPicker').style.display = 'flex';
    fillSelect('admin_branch', allLists.branches, 'اختر الفرع');
    document.getElementById('admin_teacherSearch').addEventListener('input', debounce(searchTeachers, 300));
  } else {
    mySubjects = splitList(user.subject);
    renderSubjectTabs();
  }

  document.querySelectorAll('.sub-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSubTab = btn.dataset.sub;
      renderSubTabContent();
    });
  });

  document.getElementById('closeEditModal').addEventListener('click', () => { document.getElementById('editModal').hidden = true; });
  document.getElementById('cancelEditBtn').addEventListener('click', () => { document.getElementById('editModal').hidden = true; });
  document.getElementById('saveEditBtn').addEventListener('click', submitEdit);
  document.getElementById('closeConfirmModal').addEventListener('click', closeConfirmModal);
  document.getElementById('cancelConfirmBtn').addEventListener('click', closeConfirmModal);
  document.getElementById('confirmDeleteBtn').addEventListener('click', performDelete);
}

function fillSelect(id, options = [], placeholder = null) {
  const el = document.getElementById(id);
  el.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : '') + (options || []).map(o => `<option value="${o}">${o}</option>`).join('');
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

/* ---------------- أدمن: اختيار الفرع ثم المعلم ---------------- */
async function searchTeachers() {
  const branch = document.getElementById('admin_branch').value;
  const q = document.getElementById('admin_teacherSearch').value.trim();
  const results = document.getElementById('admin_teacherResults');
  if (q.length < 2) { results.innerHTML = ''; return; }

  try {
    const res = await mirqatApi('employees', 'list', { filters: { search: q, branch: branch || undefined, role: 'teacher' } });
    results.innerHTML = res.rows.slice(0, 8).map(t =>
      `<span class="chip" style="cursor:pointer" onclick='selectTeacher(${JSON.stringify(t).replace(/'/g, "&apos;")})'>${t.name_ar}</span>`
    ).join('') || '<span class="chip">لا نتائج</span>';
  } catch { /* silent */ }
}

function selectTeacher(teacher) {
  selectedTeacher = teacher;
  document.getElementById('admin_teacherResults').innerHTML = '';
  document.getElementById('admin_teacherSearch').value = teacher.name_ar;
  document.getElementById('adminSelectedTeacher').style.display = 'block';
  document.getElementById('adminSelectedTeacher').textContent = `تعرض الآن مواد: ${teacher.name_ar}`;
  mySubjects = splitList(teacher.subject);
  renderSubjectTabs();
}

/* ---------------- تبويبات المواد ---------------- */
function renderSubjectTabs() {
  const container = document.getElementById('subjectTabs');
  if (!mySubjects.length) {
    container.innerHTML = '<p class="empty-state">لا توجد مواد مسندة</p>';
    document.getElementById('subTabs').style.display = 'none';
    document.getElementById('subjectContent').innerHTML = '';
    return;
  }

  container.innerHTML = mySubjects.map((s, i) =>
    `<button class="tab-btn${i === 0 ? ' active' : ''}" data-subject="${s}">${s}</button>`
  ).join('');

  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSubject = btn.dataset.subject;
      renderSubTabContent();
    });
  });

  currentSubject = mySubjects[0];
  document.getElementById('subTabs').style.display = 'flex';
  renderSubTabContent();
}

/* ---------------- توجيه التبويب الفرعي ---------------- */
function renderSubTabContent() {
  const el = document.getElementById('subjectContent');
  if (!currentSubject) { el.innerHTML = ''; return; }

  if (currentSubTab === 'fromTask') renderFromTask(el);
  else if (currentSubTab === 'manual') renderManual(el);
  else if (currentSubTab === 'participation') renderParticipation(el);
  else if (currentSubTab === 'log') renderLog(el);
  else if (currentSubTab === 'finished') renderFinished(el);
}

function scopeFields() {
  const isAdmin = user.role === 'admin';
  return {
    branches: isAdmin ? allLists.branches : splitList(user.branch),
    stages: isAdmin ? allLists.stages : splitList(user.stages),
    grades: isAdmin ? allLists.grades : splitList(user.grades),
    sections: isAdmin ? allLists.sections : splitList(user.sections)
  };
}

/* ============ 1) رصد من تكليف ============ */
async function renderFromTask(el) {
  el.innerHTML = `<p class="loading-row">جارٍ تحميل التكاليف غير المرصودة...</p>`;
  try {
    const tasks = await mirqatApi('tasks', 'getPendingTasks', { filters: { subject: currentSubject } });
    if (!tasks.length) {
      el.innerHTML = `<p class="empty-state">لا يوجد تكاليف بانتظار الرصد لمادة ${currentSubject} هذا الأسبوع</p>`;
      return;
    }
    el.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>التكليف</th><th>النوع</th><th>الصف</th><th>الاستحقاق</th><th>الدرجة العظمى</th><th></th></tr></thead>
          <tbody>
            ${tasks.map(t => `
              <tr>
                <td data-label="التكليف">${t.task_name}</td>
                <td data-label="النوع">${t.eval_type || '—'}</td>
                <td data-label="الصف">${t.grades || '—'}</td>
                <td data-label="الاستحقاق">${t.due_date || '—'}</td>
                <td data-label="الدرجة العظمى">${t.max_score ?? '—'}</td>
                <td><button class="btn btn-primary btn-sm" onclick='openTaskRoster(${JSON.stringify(t).replace(/'/g, "&apos;")})'>رصد الآن</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div id="taskRosterArea" style="margin-top:18px;"></div>
    `;
  } catch (e) {
    el.innerHTML = `<p class="empty-state">تعذّر التحميل: ${e.message}</p>`;
  }
}

async function openTaskRoster(task) {
  const area = document.getElementById('taskRosterArea');
  area.innerHTML = '<p class="loading-row">جارٍ تحميل الطلاب...</p>';

  try {
    currentRoster = await mirqatApi('grading', 'getRoster', {
      filters: { branch: task.branch, stages: task.stages, grades: task.grades, sections: task.sections }
    }, { cache: false });
  } catch (e) {
    area.innerHTML = `<p class="empty-state">تعذّر تحميل الطلاب: ${e.message}</p>`;
    return;
  }

  area.innerHTML = `
    <h3 style="font-size:14px; color:var(--primary-dark);">رصد: ${task.task_name} (من ${task.max_score ?? 0})</h3>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>الطالب</th><th>الدرجة</th></tr></thead>
        <tbody>
          ${currentRoster.map(s => `
            <tr data-student-id="${s.id}">
              <td data-label="الطالب">${s.name_ar}</td>
              <td data-label="الدرجة"><input type="number" class="score-input" min="0" max="${task.max_score || ''}" style="width:100px"></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <button class="btn btn-primary" id="saveTaskRosterBtn" style="margin-top:12px;">حفظ الدرجات</button>
    <p class="form-error" id="taskRosterError"></p>
  `;

  document.getElementById('saveTaskRosterBtn').addEventListener('click', async () => {
    const errorEl = document.getElementById('taskRosterError');
    const rows = Array.from(document.querySelectorAll('#taskRosterArea tr[data-student-id]'));
    const records = rows.map(row => {
      const scoreVal = row.querySelector('.score-input').value;
      if (scoreVal === '') return null;
      const studentId = row.dataset.studentId;
      const student = currentRoster.find(s => s.id === studentId);
      return {
        student_id: studentId, student_name: student?.name_ar,
        branch: task.branch, stages: task.stages, grades: task.grades, sections: task.sections,
        subject: currentSubject, term: task.term, eval_type: task.eval_type, task_name: task.task_name,
        earned_score: Number(scoreVal), max_score: Number(task.max_score)
      };
    }).filter(Boolean);

    if (!records.length) { errorEl.textContent = 'أدخل درجة طالب واحد على الأقل'; return; }

    try {
      await mirqatApi('grading', 'saveRoster', { records }, { cache: false });
      await mirqatApi('tasks', 'saveTask', { id: task.id, data: { is_graded: true, graded_at: new Date().toISOString() } }, { cache: false });
      area.innerHTML = '<p class="overview-hint">تم الحفظ ✓</p>';
      renderFromTask(document.getElementById('subjectContent'));
    } catch (e) {
      errorEl.textContent = e.message;
    }
  });
}

/* ============ 2) رصد يدوي ============ */
function renderManual(el) {
  const sf = scopeFields();
  el.innerHTML = `
    <div class="toolbar">
      <select id="m_branch">${sf.branches.map(b => `<option value="${b}">${b}</option>`).join('')}</select>
      <select id="m_stages">${sf.stages.map(b => `<option value="${b}">${b}</option>`).join('')}</select>
      <select id="m_grades">${sf.grades.map(b => `<option value="${b}">${b}</option>`).join('')}</select>
      <select id="m_sections">${sf.sections.map(b => `<option value="${b}">${b}</option>`).join('')}</select>
      <select id="m_term">${(allLists.terms || []).map(t => `<option value="${t}">${t}</option>`).join('')}</select>
      <select id="m_eval_type">${evalTypes.map(t => `<option value="${t}">${t}</option>`).join('')}</select>
      <input type="text" id="m_task_name" placeholder="اسم التكليف/الجلسة">
      <input type="number" id="m_max_score" placeholder="الدرجة العظمى" style="max-width:110px" min="0">
      <button class="btn btn-primary" id="m_loadBtn">عرض الشعبة</button>
    </div>
    <div class="table-wrap" id="m_rosterWrap" style="display:none">
      <table class="data-table"><thead><tr><th>الطالب</th><th>الدرجة</th></tr></thead><tbody id="m_rosterBody"></tbody></table>
    </div>
    <div id="m_actions" style="display:none; margin-top:14px;">
      <button class="btn btn-primary" id="m_saveBtn">حفظ الدرجات</button>
      <p class="form-error" id="m_error"></p>
    </div>
  `;

  document.getElementById('m_loadBtn').addEventListener('click', async () => {
    const branch = document.getElementById('m_branch').value, stages = document.getElementById('m_stages').value;
    const grades = document.getElementById('m_grades').value, sections = document.getElementById('m_sections').value;
    if (!grades) { alert('اختر الصف'); return; }

    try {
      currentRoster = await mirqatApi('grading', 'getRoster', { filters: { branch, stages, grades, sections } }, { cache: false });
    } catch (e) { alert('تعذّر تحميل الطلاب: ' + e.message); return; }

    document.getElementById('m_rosterBody').innerHTML = currentRoster.map(s => `
      <tr data-student-id="${s.id}">
        <td data-label="الطالب">${s.name_ar}</td>
        <td data-label="الدرجة"><input type="number" class="score-input" min="0" style="width:100px"></td>
      </tr>
    `).join('') || '<tr><td colspan="2" class="empty-state">لا يوجد طلاب</td></tr>';
    document.getElementById('m_rosterWrap').style.display = 'block';
    document.getElementById('m_actions').style.display = currentRoster.length ? 'block' : 'none';
  });

  document.getElementById('m_saveBtn').addEventListener('click', async () => {
    const errorEl = document.getElementById('m_error');
    errorEl.textContent = '';
    const maxScore = document.getElementById('m_max_score').value;
    const evalType = document.getElementById('m_eval_type').value;
    const taskName = document.getElementById('m_task_name').value.trim();
    if (!maxScore || !evalType || !taskName) { errorEl.textContent = 'عبّي نوع التقييم واسم التكليف والدرجة العظمى'; return; }

    const rows = Array.from(document.querySelectorAll('#m_rosterBody tr[data-student-id]'));
    const records = rows.map(row => {
      const val = row.querySelector('.score-input').value;
      if (val === '') return null;
      const studentId = row.dataset.studentId;
      const student = currentRoster.find(s => s.id === studentId);
      return {
        student_id: studentId, student_name: student?.name_ar,
        branch: document.getElementById('m_branch').value, stages: document.getElementById('m_stages').value,
        grades: document.getElementById('m_grades').value, sections: document.getElementById('m_sections').value,
        subject: currentSubject, term: document.getElementById('m_term').value, eval_type: evalType,
        task_name: taskName, earned_score: Number(val), max_score: Number(maxScore)
      };
    }).filter(Boolean);

    if (!records.length) { errorEl.textContent = 'أدخل درجة طالب واحد على الأقل'; return; }

    try {
      await mirqatApi('grading', 'saveRoster', { records }, { cache: false });
      document.getElementById('m_rosterWrap').style.display = 'none';
      document.getElementById('m_actions').style.display = 'none';
    } catch (e) { errorEl.textContent = e.message; }
  });
}

/* ============ 3) مشاركة وتفاعل فوري ============ */
function renderParticipation(el) {
  const sf = scopeFields();
  el.innerHTML = `
    <div class="form-group"><label>اسم المشاركة</label><input type="text" id="p_name" placeholder="مثال: مشاركة الحصة، سؤال شفهي..."></div>
    <div class="form-row">
      <div class="form-group"><label>التفاصيل (اختياري)</label><input type="text" id="p_details"></div>
      <div class="form-group"><label>الدرجة العظمى</label><input type="number" id="p_max" min="0" value="5"></div>
    </div>
    <div class="toolbar">
      <select id="p_branch">${sf.branches.map(b => `<option value="${b}">${b}</option>`).join('')}</select>
      <select id="p_stages">${sf.stages.map(b => `<option value="${b}">${b}</option>`).join('')}</select>
      <select id="p_grades">${sf.grades.map(b => `<option value="${b}">${b}</option>`).join('')}</select>
      <select id="p_sections">${sf.sections.map(b => `<option value="${b}">${b}</option>`).join('')}</select>
      <select id="p_term">${(allLists.terms || []).map(t => `<option value="${t}">${t}</option>`).join('')}</select>
      <button class="btn btn-outline" id="p_loadBtn">تحميل الصف</button>
    </div>
    <div class="table-wrap" id="p_rosterWrap" style="display:none">
      <table class="data-table"><thead><tr><th>الطالب</th><th>الدرجة</th></tr></thead><tbody id="p_rosterBody"></tbody></table>
    </div>
    <div id="p_actions" style="display:none; margin-top:14px;">
      <button class="btn btn-primary" id="p_saveBtn">حفظ المشاركة (تاريخ اليوم)</button>
      <p class="form-error" id="p_error"></p>
    </div>
  `;

  document.getElementById('p_loadBtn').addEventListener('click', async () => {
    const branch = document.getElementById('p_branch').value, stages = document.getElementById('p_stages').value;
    const grades = document.getElementById('p_grades').value, sections = document.getElementById('p_sections').value;
    if (!grades) { alert('اختر الصف'); return; }
    try {
      currentRoster = await mirqatApi('grading', 'getRoster', { filters: { branch, stages, grades, sections } }, { cache: false });
    } catch (e) { alert('تعذّر التحميل: ' + e.message); return; }

    document.getElementById('p_rosterBody').innerHTML = currentRoster.map(s => `
      <tr data-student-id="${s.id}">
        <td data-label="الطالب">${s.name_ar}</td>
        <td data-label="الدرجة"><input type="number" class="score-input" min="0" style="width:100px"></td>
      </tr>
    `).join('') || '<tr><td colspan="2" class="empty-state">لا يوجد طلاب</td></tr>';
    document.getElementById('p_rosterWrap').style.display = 'block';
    document.getElementById('p_actions').style.display = currentRoster.length ? 'block' : 'none';
  });

  document.getElementById('p_saveBtn').addEventListener('click', async () => {
    const errorEl = document.getElementById('p_error');
    errorEl.textContent = '';
    const name = document.getElementById('p_name').value.trim();
    const max = document.getElementById('p_max').value;
    if (!name || !max) { errorEl.textContent = 'اسم المشاركة والدرجة العظمى مطلوبان'; return; }

    const rows = Array.from(document.querySelectorAll('#p_rosterBody tr[data-student-id]'));
    const records = rows.map(row => {
      const val = row.querySelector('.score-input').value;
      if (val === '') return null;
      const studentId = row.dataset.studentId;
      const student = currentRoster.find(s => s.id === studentId);
      return {
        student_id: studentId, student_name: student?.name_ar,
        branch: document.getElementById('p_branch').value, stages: document.getElementById('p_stages').value,
        grades: document.getElementById('p_grades').value, sections: document.getElementById('p_sections').value,
        subject: currentSubject, term: document.getElementById('p_term').value, eval_type: 'المشاركة و تفاعل',
        task_name: name + (document.getElementById('p_details').value.trim() ? ' — ' + document.getElementById('p_details').value.trim() : ''),
        earned_score: Number(val), max_score: Number(max),
        recorded_date: new Date().toISOString().slice(0, 10)
      };
    }).filter(Boolean);

    if (!records.length) { errorEl.textContent = 'أدخل درجة طالب واحد على الأقل'; return; }

    try {
      await mirqatApi('grading', 'saveRoster', { records }, { cache: false });
      document.getElementById('p_rosterWrap').style.display = 'none';
      document.getElementById('p_actions').style.display = 'none';
    } catch (e) { errorEl.textContent = e.message; }
  });
}

/* ============ 4) سجل الرصد ============ */
function renderLog(el) {
  el.innerHTML = `
    <div class="toolbar">
      <select id="l_term"><option value="">اختر الترم</option>${(allLists.terms || []).map(t => `<option value="${t}">${t}</option>`).join('')}</select>
      <select id="l_week"><option value="">اختر الأسبوع</option>${Array.from({length:20},(_,i)=>i+1).map(i => `<option value="${i}">أسبوع ${i}</option>`).join('')}</select>
      <input type="date" id="l_date" title="تاريخ الرصد">
      <button class="btn btn-outline" id="l_filterBtn">بحث</button>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>الطالب</th><th>النوع</th><th>التكليف</th><th>الدرجة</th><th>التاريخ</th><th></th></tr></thead>
        <tbody id="l_body"><tr><td colspan="6" class="empty-state">اختر الترم والأسبوع ثم اضغط بحث</td></tr></tbody>
      </table>
    </div>
    <div class="pagination-bar" id="l_pagination"></div>
  `;

  document.getElementById('l_filterBtn').addEventListener('click', () => loadLog(1));
}

async function loadLog(page = currentLogPage) {
  currentLogPage = page;
  const term = document.getElementById('l_term').value;
  const week = document.getElementById('l_week').value;
  const date = document.getElementById('l_date').value;
  const body = document.getElementById('l_body');

  if (!term || !week) { body.innerHTML = '<tr><td colspan="6" class="empty-state">اختر الترم والأسبوع أولًا</td></tr>'; return; }

  body.innerHTML = '<tr><td colspan="6" class="loading-row">جارٍ التحميل...</td></tr>';
  const filters = { subject: currentSubject, term, week };
  if (date) filters.recordedDate = date;
  if (user.role === 'admin' && selectedTeacher) filters.employeeId = selectedTeacher.id;

  try {
    const result = await mirqatApi('grading', 'getGradingRecords', { filters, page, pageSize: 25 });
    if (!result.rows.length) {
      body.innerHTML = '<tr><td colspan="6" class="empty-state">لا يوجد سجلات مطابقة</td></tr>';
    } else {
      body.innerHTML = result.rows.map(r => `
        <tr>
          <td data-label="الطالب">${r.student_name || r.student_id}</td>
          <td data-label="النوع">${r.eval_type || '—'}</td>
          <td data-label="التكليف">${r.task_name || '—'}</td>
          <td data-label="الدرجة">${r.earned_score ?? '—'} / ${r.max_score ?? '—'}</td>
          <td data-label="التاريخ">${r.recorded_date || '—'}</td>
          <td>
            <div class="row-actions">
              <button class="btn btn-outline btn-sm" ${r.can_edit ? '' : 'disabled title="انتهت مهلة التعديل (6 أيام)"'} onclick="openEditScore('${r.id}', ${r.earned_score})">تعديل</button>
              <button class="btn btn-danger btn-sm" ${r.can_delete ? '' : 'disabled title="انتهت مهلة الحذف (6 ساعات)"'} onclick="askDelete('${r.id}')">حذف</button>
            </div>
          </td>
        </tr>
      `).join('');
    }
    mirqatRenderPagination('l_pagination', result, (p) => loadLog(p));
  } catch (e) {
    body.innerHTML = `<tr><td colspan="6" class="empty-state">تعذّر التحميل: ${e.message}</td></tr>`;
  }
}

function openEditScore(id, currentScore) {
  editTargetId = id;
  document.getElementById('ef_score').value = currentScore ?? '';
  document.getElementById('editFormError').textContent = '';
  document.getElementById('editModal').hidden = false;
}

async function submitEdit() {
  const errorEl = document.getElementById('editFormError');
  const val = document.getElementById('ef_score').value;
  if (val === '') { errorEl.textContent = 'أدخل الدرجة'; return; }

  try {
    const result = await mirqatApi('grading', 'updateRosterRecords', {
      updates: [{ id: editTargetId, data: { earned_score: Number(val) } }]
    }, { cache: false });
    if (result.failed && result.failed.length) { errorEl.textContent = result.failed[0].reason; return; }
    document.getElementById('editModal').hidden = true;
    loadLog();
  } catch (e) { errorEl.textContent = e.message; }
}

function askDelete(id) { deleteTargetId = id; document.getElementById('confirmModal').hidden = false; }
function closeConfirmModal() { document.getElementById('confirmModal').hidden = true; deleteTargetId = null; }

async function performDelete() {
  if (!deleteTargetId) return;
  try {
    const result = await mirqatApi('grading', 'deleteRosterRecords', { ids: [deleteTargetId] }, { cache: false });
    closeConfirmModal();
    if (result.note) alert(result.note);
    loadLog();
  } catch (e) { alert('تعذّر الحذف: ' + e.message); }
}

/* ============ 5) آخر أسبوع منتهٍ ============ */
async function renderFinished(el) {
  el.innerHTML = '<p class="loading-row">جارٍ التحميل...</p>';
  try {
    const params = { subject: currentSubject };
    if (user.role === 'admin' && selectedTeacher) params.employeeId = selectedTeacher.id;
    const result = await mirqatApi('grading', 'getFinishedWeekRecords', params);

    if (!result.week) {
      el.innerHTML = '<p class="empty-state">لا يوجد أسبوع دراسي منتهٍ في التقويم بعد</p>';
      return;
    }
    el.innerHTML = `
      <p class="overview-hint">آخر أسبوع منتهٍ: ${result.week.term} — ${result.week.week} (انتهى ${result.week.week_end_date})</p>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>الطالب</th><th>النوع</th><th>التكليف</th><th>الدرجة</th></tr></thead>
          <tbody>
            ${result.records.length ? result.records.map(r => `
              <tr>
                <td data-label="الطالب">${r.student_name || r.student_id}</td>
                <td data-label="النوع">${r.eval_type || '—'}</td>
                <td data-label="التكليف">${r.task_name || '—'}</td>
                <td data-label="الدرجة">${r.earned_score ?? '—'} / ${r.max_score ?? '—'}</td>
              </tr>
            `).join('') : '<tr><td colspan="4" class="empty-state">لا يوجد سجلات لهذا الأسبوع</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    el.innerHTML = `<p class="empty-state">تعذّر التحميل: ${e.message}</p>`;
  }
}
