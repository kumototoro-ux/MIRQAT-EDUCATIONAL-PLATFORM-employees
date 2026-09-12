const user = mirqatInitShell('grading');
let allLists = {};
let evalTypes = [];
let currentRoster = [];
let deleteTargetId = null;

if (user) init();

async function init() {
  try {
    [allLists, evalTypes] = await Promise.all([
      mirqatApi('settings', 'getSettingsLists'),
      mirqatApi('settings', 'getEvalTypes')
    ]);
  } catch {
    allLists = {}; evalTypes = [];
  }

  fillSelect('f_branch', allLists.branches, 'الفرع');
  fillSelect('f_stages', allLists.stages, 'المرحلة');
  fillSelect('f_grades', allLists.grades, 'الصف');
  fillSelect('f_sections', allLists.sections, 'الشعبة');
  fillSelect('f_subject', allLists.subject, 'المادة');
  fillSelect('f_term', allLists.terms, 'الترم');
  fillSelect('f_eval_type', evalTypes, 'نوع التقييم');

  document.getElementById('loadRosterBtn').addEventListener('click', loadRoster);
  document.getElementById('saveRosterBtn').addEventListener('click', saveRoster);
  document.getElementById('closeConfirmModal').addEventListener('click', closeConfirmModal);
  document.getElementById('cancelConfirmBtn').addEventListener('click', closeConfirmModal);
  document.getElementById('confirmDeleteBtn').addEventListener('click', performDelete);

  loadRecords();
}

function fillSelect(id, options = [], placeholder = null) {
  const el = document.getElementById(id);
  el.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : '') +
    (options || []).map(o => `<option value="${o}">${o}</option>`).join('');
}

function getFilters() {
  return {
    branch: document.getElementById('f_branch').value,
    stages: document.getElementById('f_stages').value,
    grades: document.getElementById('f_grades').value,
    sections: document.getElementById('f_sections').value,
    subject: document.getElementById('f_subject').value,
    term: document.getElementById('f_term').value,
    eval_type: document.getElementById('f_eval_type').value,
    task_name: document.getElementById('f_task_name').value.trim(),
    max_score: document.getElementById('f_max_score').value
  };
}

async function loadRoster() {
  const f = getFilters();
  if (!f.branch || !f.grades || !f.subject || !f.eval_type || !f.task_name) {
    alert('اختر الفرع والصف والمادة ونوع التقييم واسم التكليف على الأقل');
    return;
  }

  try {
    currentRoster = await mirqatApi('grading', 'getRoster', {
      filters: { branch: f.branch, stages: f.stages || undefined, grades: f.grades, sections: f.sections || undefined }
    });
  } catch (e) {
    alert('تعذّر تحميل الطلاب: ' + e.message);
    return;
  }

  const body = document.getElementById('rosterTableBody');
  if (!currentRoster.length) {
    body.innerHTML = '<tr><td colspan="2" class="empty-state">لا يوجد طلاب في هذه الشعبة</td></tr>';
  } else {
    body.innerHTML = currentRoster.map(s => `
      <tr data-student-id="${s.id}">
        <td data-label="الطالب">${s.name_ar}</td>
        <td data-label="الدرجة"><input type="number" class="score-input" min="0" max="${f.max_score || ''}" style="width:100px"></td>
      </tr>
    `).join('');
  }

  document.getElementById('rosterWrap').style.display = 'block';
  document.getElementById('rosterActions').style.display = currentRoster.length ? 'block' : 'none';
}

async function saveRoster() {
  const f = getFilters();
  const errorEl = document.getElementById('rosterError');
  errorEl.textContent = '';

  if (!f.max_score) {
    errorEl.textContent = 'حدد الدرجة العظمى قبل الحفظ';
    return;
  }

  const rows = Array.from(document.querySelectorAll('#rosterTableBody tr[data-student-id]'));
  const records = rows
    .map(row => {
      const scoreVal = row.querySelector('.score-input').value;
      if (scoreVal === '') return null;
      const studentId = row.dataset.studentId;
      const student = currentRoster.find(s => s.id === studentId);
      return {
        student_id: studentId,
        student_name: student?.name_ar,
        branch: f.branch,
        stages: f.stages || null,
        grades: f.grades,
        sections: f.sections || null,
        subject: f.subject,
        term: f.term || null,
        eval_type: f.eval_type,
        task_name: f.task_name,
        earned_score: Number(scoreVal),
        max_score: Number(f.max_score)
      };
    })
    .filter(Boolean);

  if (!records.length) {
    errorEl.textContent = 'أدخل درجة طالب واحد على الأقل';
    return;
  }

  const saveBtn = document.getElementById('saveRosterBtn');
  saveBtn.disabled = true;

  try {
    await mirqatApi('grading', 'saveRoster', { records });
    document.getElementById('rosterWrap').style.display = 'none';
    document.getElementById('rosterActions').style.display = 'none';
    loadRecords();
  } catch (e) {
    errorEl.textContent = e.message;
  } finally {
    saveBtn.disabled = false;
  }
}

let currentRecordsPage = 1;

async function loadRecords(page = currentRecordsPage) {
  currentRecordsPage = page;
  const body = document.getElementById('recordsTableBody');
  body.innerHTML = '<tr><td colspan="7" class="loading-row">جارٍ التحميل...</td></tr>';

  try {
    const result = await mirqatApi('grading', 'getGradingRecords', { page, pageSize: 25 });
    if (!result.rows.length) {
      body.innerHTML = '<tr><td colspan="7" class="empty-state">لا يوجد سجلات بعد</td></tr>';
    } else {
      body.innerHTML = result.rows.map(r => `
      <tr>
        <td data-label="الطالب">${r.student_name || r.student_id}</td>
        <td data-label="المادة">${r.subject || '—'}</td>
        <td data-label="النوع">${r.eval_type || '—'}</td>
        <td data-label="التكليف">${r.task_name || '—'}</td>
        <td data-label="الدرجة">${r.earned_score ?? '—'} / ${r.max_score ?? '—'}</td>
        <td data-label="التاريخ">${r.recorded_date || '—'}</td>
        <td><button class="btn btn-danger btn-sm" onclick="askDelete('${r.id}')">حذف</button></td>
      </tr>
    `).join('');
    }
    mirqatRenderPagination('recordsPaginationBar', result, (p) => loadRecords(p));
  } catch (e) {
    body.innerHTML = `<tr><td colspan="7" class="empty-state">تعذّر تحميل السجلات: ${e.message}</td></tr>`;
  }
}

function askDelete(id) {
  deleteTargetId = id;
  document.getElementById('confirmModal').hidden = false;
}

function closeConfirmModal() {
  document.getElementById('confirmModal').hidden = true;
  deleteTargetId = null;
}

async function performDelete() {
  if (!deleteTargetId) return;
  try {
    await mirqatApi('grading', 'deleteRosterRecords', { ids: [deleteTargetId] });
    closeConfirmModal();
    loadRecords();
  } catch (e) {
    alert('تعذّر حذف السجل: ' + e.message);
  }
}
