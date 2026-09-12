const user = mirqatInitShell('students');
let allLists = {};
let editingId = null;
let deleteTargetId = null;

if (user) {
  init();
}

async function init() {
  if (user.role === 'admin') {
    document.getElementById('addStudentBtn').style.display = 'inline-flex';
  }

  try {
    allLists = await mirqatApi('settings', 'getSettingsLists');
  } catch {
    allLists = { branches: [], stages: [], grades: [], sections: [] };
  }

  fillSelect('filterBranch', allLists.branches, 'كل الفروع');
  fillSelect('filterStage', allLists.stages, 'كل المراحل');
  fillSelect('filterGrade', allLists.grades, 'كل الصفوف');
  fillSelect('filterSection', allLists.sections, 'كل الشعب');

  fillSelect('f_branch', allLists.branches);
  fillSelect('f_stages', allLists.stages);
  fillSelect('f_grades', allLists.grades);
  fillSelect('f_sections', allLists.sections);

  ['searchInput', 'filterBranch', 'filterStage', 'filterGrade', 'filterSection'].forEach(id => {
    document.getElementById(id).addEventListener('input', debounce(loadStudents, 300));
  });

  document.getElementById('addStudentBtn').addEventListener('click', () => openStudentModal());
  document.getElementById('closeStudentModal').addEventListener('click', closeStudentModal);
  document.getElementById('cancelStudentBtn').addEventListener('click', closeStudentModal);
  document.getElementById('studentForm').addEventListener('submit', submitStudentForm);

  document.getElementById('closeConfirmModal').addEventListener('click', closeConfirmModal);
  document.getElementById('cancelConfirmBtn').addEventListener('click', closeConfirmModal);
  document.getElementById('confirmDeleteBtn').addEventListener('click', performDelete);

  loadStudents();
}

function fillSelect(id, options = [], placeholder = null) {
  const el = document.getElementById(id);
  el.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : '') +
    options.map(o => `<option value="${o}">${o}</option>`).join('');
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function loadStudents() {
  const body = document.getElementById('studentsTableBody');
  body.innerHTML = '<tr><td colspan="8" class="loading-row">جارٍ التحميل...</td></tr>';

  const filters = {
    search: document.getElementById('searchInput').value.trim() || undefined,
    branch: document.getElementById('filterBranch').value || undefined,
    stages: document.getElementById('filterStage').value || undefined,
    grades: document.getElementById('filterGrade').value || undefined,
    sections: document.getElementById('filterSection').value || undefined
  };

  try {
    const students = await mirqatApi('students', 'list', { filters });
    renderTable(students);
  } catch (e) {
    body.innerHTML = `<tr><td colspan="8" class="empty-state">تعذّر تحميل الطلاب: ${e.message}</td></tr>`;
  }
}

function renderTable(students) {
  const body = document.getElementById('studentsTableBody');

  if (!students.length) {
    body.innerHTML = '<tr><td colspan="8" class="empty-state">لا يوجد طلاب مطابقون</td></tr>';
    return;
  }

  body.innerHTML = students.map(s => `
    <tr>
      <td>${s.id}</td>
      <td>${s.name_ar}</td>
      <td>${s.branch || '—'}</td>
      <td>${s.stages || '—'}</td>
      <td>${s.grades || '—'}</td>
      <td>${s.sections || '—'}</td>
      <td>${s.fees_status || '—'}</td>
      <td>
        ${user.role === 'admin' ? `
          <div class="row-actions">
            <button class="btn btn-outline btn-sm" onclick="editStudent('${s.id}')">تعديل</button>
            <button class="btn btn-danger btn-sm" onclick="askDeleteStudent('${s.id}', '${s.name_ar.replace(/'/g, "\\'")}')">حذف</button>
          </div>
        ` : ''}
      </td>
    </tr>
  `).join('');
}

let studentsCache = [];

async function editStudent(id) {
  try {
    const students = await mirqatApi('students', 'list', { filters: {} });
    studentsCache = students;
    const s = students.find(x => x.id === id);
    if (!s) return;
    openStudentModal(s);
  } catch (e) {
    alert('تعذّر تحميل بيانات الطالب: ' + e.message);
  }
}

function openStudentModal(student = null) {
  editingId = student ? student.id : null;
  document.getElementById('studentModalTitle').textContent = student ? 'تعديل بيانات طالب' : 'إضافة طالب';
  document.getElementById('f_name_ar').value = student?.name_ar || '';
  document.getElementById('f_branch').value = student?.branch || '';
  document.getElementById('f_stages').value = student?.stages || '';
  document.getElementById('f_grades').value = student?.grades || '';
  document.getElementById('f_sections').value = student?.sections || '';
  document.getElementById('f_national_id').value = student?.national_id || '';
  document.getElementById('studentFormError').textContent = '';
  document.getElementById('studentModal').hidden = false;
}

function closeStudentModal() {
  document.getElementById('studentModal').hidden = true;
}

async function submitStudentForm(e) {
  e.preventDefault();
  const errorEl = document.getElementById('studentFormError');
  errorEl.textContent = '';

  const data = {
    name_ar: document.getElementById('f_name_ar').value.trim(),
    branch: document.getElementById('f_branch').value || null,
    stages: document.getElementById('f_stages').value || null,
    grades: document.getElementById('f_grades').value || null,
    sections: document.getElementById('f_sections').value || null,
    national_id: document.getElementById('f_national_id').value.trim() || null
  };

  if (!data.name_ar) {
    errorEl.textContent = 'اسم الطالب مطلوب';
    return;
  }

  const saveBtn = document.getElementById('saveStudentBtn');
  saveBtn.disabled = true;

  try {
    if (editingId) {
      await mirqatApi('students', 'update', { id: editingId, data });
    } else {
      await mirqatApi('students', 'create', { data });
    }
    closeStudentModal();
    loadStudents();
  } catch (e) {
    errorEl.textContent = e.message;
  } finally {
    saveBtn.disabled = false;
  }
}

function askDeleteStudent(id, name) {
  deleteTargetId = id;
  document.getElementById('confirmMessage').textContent = `سيتم حذف الطالب "${name}" نهائيًا. هذا الإجراء لا يمكن التراجع عنه.`;
  document.getElementById('confirmModal').hidden = false;
}

function closeConfirmModal() {
  document.getElementById('confirmModal').hidden = true;
  deleteTargetId = null;
}

async function performDelete() {
  if (!deleteTargetId) return;
  try {
    await mirqatApi('students', 'delete', { id: deleteTargetId });
    closeConfirmModal();
    loadStudents();
  } catch (e) {
    alert('تعذّر حذف الطالب: ' + e.message);
  }
}
