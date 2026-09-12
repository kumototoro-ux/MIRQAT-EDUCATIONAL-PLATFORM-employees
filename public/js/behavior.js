const user = mirqatInitShell('behavior');
let allLists = {};
let deleteTargetId = null;
let selectedStudentForForm = null;

if (user) init();

async function init() {
  try {
    allLists = await mirqatApi('settings', 'getSettingsLists');
  } catch {
    allLists = {};
  }

  fillSelect('bf_status', allLists.behavior_statuses);
  fillSelect('bf_branch', allLists.branches);
  fillSelect('bf_term', allLists.terms);

  document.getElementById('studentSearch').addEventListener('input', debounce(searchStudentsForRecord, 300));
  document.getElementById('addBehaviorBtn').addEventListener('click', openBehaviorModal);
  document.getElementById('closeBehaviorModal').addEventListener('click', closeBehaviorModal);
  document.getElementById('cancelBehaviorBtn').addEventListener('click', closeBehaviorModal);
  document.getElementById('behaviorForm').addEventListener('submit', submitBehaviorForm);
  document.getElementById('bf_student_search').addEventListener('input', debounce(searchStudentsForForm, 300));

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

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ---------------- بحث لعرض سجل طالب كامل ---------------- */
async function searchStudentsForRecord() {
  const q = document.getElementById('studentSearch').value.trim();
  const results = document.getElementById('searchResults');
  if (q.length < 2) { results.innerHTML = ''; return; }

  try {
    const students = await mirqatApi('students', 'list', { filters: { search: q } });
    results.innerHTML = students.slice(0, 8).map(s =>
      `<span class="chip" style="cursor:pointer" onclick="loadStudentRecord('${s.id}', '${s.name_ar.replace(/'/g, "\\'")}')">${s.name_ar}</span>`
    ).join('') || '<span class="chip">لا نتائج</span>';
  } catch { /* silent */ }
}

async function loadStudentRecord(studentId, name) {
  document.getElementById('searchResults').innerHTML = '';
  document.getElementById('studentSearch').value = name;
  document.getElementById('studentRecordSection').style.display = 'block';
  document.getElementById('studentRecordTitle').textContent = `سجل السلوك التراكمي: ${name}`;
  const body = document.getElementById('studentRecordBody');
  body.innerHTML = '<tr><td colspan="5" class="loading-row">جارٍ التحميل...</td></tr>';

  try {
    const records = await mirqatApi('behavior', 'getBehaviorRecords', { studentId });
    if (!records.length) {
      body.innerHTML = '<tr><td colspan="5" class="empty-state">لا يوجد سجلات لهذا الطالب</td></tr>';
      return;
    }
    body.innerHTML = records.map(r => `
      <tr>
        <td>${r.created_at ? new Date(r.created_at).toLocaleDateString('ar-SA') : '—'}</td>
        <td>${r.status || '—'}</td>
        <td>${r.score ?? '—'}</td>
        <td>${r.note || '—'}</td>
        <td>${r.employee_name || '—'}</td>
      </tr>
    `).join('');
  } catch (e) {
    body.innerHTML = `<tr><td colspan="5" class="empty-state">تعذّر التحميل: ${e.message}</td></tr>`;
  }
}

/* ---------------- سجلاتي الأخيرة ---------------- */
async function loadRecords() {
  const body = document.getElementById('recordsTableBody');
  body.innerHTML = '<tr><td colspan="6" class="loading-row">جارٍ التحميل...</td></tr>';

  try {
    const records = await mirqatApi('behavior', 'getBehaviorRecords', {});
    if (!records.length) {
      body.innerHTML = '<tr><td colspan="6" class="empty-state">لا يوجد سجلات بعد</td></tr>';
      return;
    }
    body.innerHTML = records.slice(0, 50).map(r => `
      <tr>
        <td>${r.student_name || r.student_id}</td>
        <td>${r.status || '—'}</td>
        <td>${r.score ?? '—'}</td>
        <td>${r.note || '—'}</td>
        <td>${r.created_at ? new Date(r.created_at).toLocaleDateString('ar-SA') : '—'}</td>
        <td><button class="btn btn-danger btn-sm" onclick="askDelete('${r.id}')">حذف</button></td>
      </tr>
    `).join('');
  } catch (e) {
    body.innerHTML = `<tr><td colspan="6" class="empty-state">تعذّر التحميل: ${e.message}</td></tr>`;
  }
}

/* ---------------- نافذة إضافة سلوك ---------------- */
function openBehaviorModal() {
  selectedStudentForForm = null;
  document.getElementById('bf_student_search').value = '';
  document.getElementById('bf_student_id').value = '';
  document.getElementById('bf_selected_student').textContent = '';
  document.getElementById('bf_student_results').innerHTML = '';
  document.getElementById('bf_score').value = '';
  document.getElementById('bf_week').value = '';
  document.getElementById('bf_note').value = '';
  document.getElementById('behaviorFormError').textContent = '';
  document.getElementById('behaviorModal').hidden = false;
}

function closeBehaviorModal() { document.getElementById('behaviorModal').hidden = true; }

async function searchStudentsForForm() {
  const q = document.getElementById('bf_student_search').value.trim();
  const results = document.getElementById('bf_student_results');
  if (q.length < 2) { results.innerHTML = ''; return; }

  try {
    const students = await mirqatApi('students', 'list', { filters: { search: q } });
    results.innerHTML = students.slice(0, 8).map(s =>
      `<span class="chip" style="cursor:pointer" onclick="selectStudentForForm('${s.id}', '${s.name_ar.replace(/'/g, "\\'")}')">${s.name_ar}</span>`
    ).join('') || '<span class="chip">لا نتائج</span>';
  } catch { /* silent */ }
}

function selectStudentForForm(id, name) {
  selectedStudentForForm = { id, name };
  document.getElementById('bf_student_id').value = id;
  document.getElementById('bf_selected_student').textContent = `الطالب المحدد: ${name}`;
  document.getElementById('bf_student_results').innerHTML = '';
  document.getElementById('bf_student_search').value = name;
}

async function submitBehaviorForm(e) {
  e.preventDefault();
  const errorEl = document.getElementById('behaviorFormError');
  errorEl.textContent = '';

  const studentId = document.getElementById('bf_student_id').value;
  if (!studentId) { errorEl.textContent = 'اختر الطالب من نتائج البحث'; return; }

  const status = document.getElementById('bf_status').value;
  if (!status) { errorEl.textContent = 'حدد حالة السلوك'; return; }

  const data = {
    student_id: studentId,
    student_name: selectedStudentForForm?.name,
    status,
    score: document.getElementById('bf_score').value || null,
    branch: document.getElementById('bf_branch').value || null,
    term: document.getElementById('bf_term').value || null,
    week: document.getElementById('bf_week').value.trim() || null,
    day: document.getElementById('bf_day').value,
    note: document.getElementById('bf_note').value.trim() || null
  };

  const saveBtn = document.getElementById('saveBehaviorBtn');
  saveBtn.disabled = true;

  try {
    await mirqatApi('behavior', 'saveBehaviorRow', { data });
    closeBehaviorModal();
    loadRecords();
  } catch (e) {
    errorEl.textContent = e.message;
  } finally {
    saveBtn.disabled = false;
  }
}

/* ---------------- حذف ---------------- */
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
    await mirqatApi('behavior', 'deleteBehaviorRow', { id: deleteTargetId });
    closeConfirmModal();
    loadRecords();
  } catch (e) {
    alert('تعذّر حذف السجل: ' + e.message);
  }
}
