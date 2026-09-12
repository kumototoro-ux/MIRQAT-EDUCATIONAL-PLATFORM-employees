const user = mirqatInitShell('employees');
let allLists = {};
let editingId = null;
let deleteTargetId = null;

if (user) {
  if (user.role !== 'admin') {
    document.querySelector('.content').innerHTML = '<p class="empty-state">هذه الصفحة تتطلب صلاحية أدمن</p>';
  } else {
    init();
  }
}

async function init() {
  try {
    allLists = await mirqatApi('settings', 'getSettingsLists');
  } catch {
    allLists = { branches: [], stages: [], grades: [], sections: [], subject: [] };
  }

  fillSelect('filterBranch', allLists.branches, 'كل الفروع');
  buildCheckboxGroup('cg_branch', allLists.branches);
  buildCheckboxGroup('cg_stages', allLists.stages);
  buildCheckboxGroup('cg_grades', allLists.grades);
  buildCheckboxGroup('cg_sections', allLists.sections);
  buildCheckboxGroup('cg_subject', allLists.subject);

  ['searchInput', 'filterBranch', 'filterRole'].forEach(id => {
    document.getElementById(id).addEventListener('input', debounce(loadEmployees, 300));
  });

  document.getElementById('addEmployeeBtn').addEventListener('click', () => openEmployeeModal());
  document.getElementById('closeEmployeeModal').addEventListener('click', closeEmployeeModal);
  document.getElementById('cancelEmployeeBtn').addEventListener('click', closeEmployeeModal);
  document.getElementById('employeeForm').addEventListener('submit', submitEmployeeForm);

  document.getElementById('closeConfirmModal').addEventListener('click', closeConfirmModal);
  document.getElementById('cancelConfirmBtn').addEventListener('click', closeConfirmModal);
  document.getElementById('confirmDeleteBtn').addEventListener('click', performDelete);

  loadEmployees();
}

function fillSelect(id, options = [], placeholder = null) {
  const el = document.getElementById(id);
  el.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : '') +
    options.map(o => `<option value="${o}">${o}</option>`).join('');
}

function buildCheckboxGroup(containerId, options = []) {
  const el = document.getElementById(containerId);
  el.innerHTML = options.map(o => `
    <label><input type="checkbox" value="${o}"> ${o}</label>
  `).join('');
}

function getCheckedValues(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} input:checked`)).map(i => i.value);
}

function setCheckedValues(containerId, commaString) {
  const values = (commaString || '').split(',').map(v => v.trim()).filter(Boolean);
  document.querySelectorAll(`#${containerId} input`).forEach(i => {
    i.checked = values.includes(i.value);
  });
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function loadEmployees() {
  const body = document.getElementById('employeesTableBody');
  body.innerHTML = '<tr><td colspan="7" class="loading-row">جارٍ التحميل...</td></tr>';

  const filters = {
    search: document.getElementById('searchInput').value.trim() || undefined,
    branch: document.getElementById('filterBranch').value || undefined,
    role: document.getElementById('filterRole').value || undefined
  };

  try {
    const employees = await mirqatApi('employees', 'list', { filters });
    window.__employeesCache = employees;
    renderTable(employees);
  } catch (e) {
    body.innerHTML = `<tr><td colspan="7" class="empty-state">تعذّر تحميل الموظفين: ${e.message}</td></tr>`;
  }
}

function renderTable(employees) {
  const body = document.getElementById('employeesTableBody');

  if (!employees.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty-state">لا يوجد موظفون مطابقون</td></tr>';
    return;
  }

  body.innerHTML = employees.map(e => `
    <tr>
      <td data-label="المعرّف">${e.id}</td>
      <td data-label="الاسم">${e.name_ar}</td>
      <td data-label="الدور">${e.role === 'admin' ? 'أدمن' : 'معلم'}</td>
      <td data-label="الفرع">${e.branch || '—'}</td>
      <td data-label="الصفوف">${e.grades || '—'}</td>
      <td data-label="المواد">${e.subject || '—'}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn-outline btn-sm" onclick="editEmployee('${e.id}')">تعديل</button>
          <button class="btn btn-danger btn-sm" onclick="askDeleteEmployee('${e.id}', '${e.name_ar.replace(/'/g, "\\'")}')">حذف</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function editEmployee(id) {
  const e = (window.__employeesCache || []).find(x => x.id === id);
  if (!e) return;
  openEmployeeModal(e);
}

function openEmployeeModal(employee = null) {
  editingId = employee ? employee.id : null;
  document.getElementById('employeeModalTitle').textContent = employee ? 'تعديل بيانات موظف' : 'إضافة موظف';
  document.getElementById('f_name_ar').value = employee?.name_ar || '';
  document.getElementById('f_role').value = employee?.role || 'teacher';
  document.getElementById('f_national_id').value = employee?.national_id || '';

  setCheckedValues('cg_branch', employee?.branch);
  setCheckedValues('cg_stages', employee?.stages);
  setCheckedValues('cg_grades', employee?.grades);
  setCheckedValues('cg_sections', employee?.sections);
  setCheckedValues('cg_subject', employee?.subject);

  document.getElementById('employeeFormError').textContent = '';
  document.getElementById('employeeModal').hidden = false;
}

function closeEmployeeModal() {
  document.getElementById('employeeModal').hidden = true;
}

async function submitEmployeeForm(e) {
  e.preventDefault();
  const errorEl = document.getElementById('employeeFormError');
  errorEl.textContent = '';

  const data = {
    name_ar: document.getElementById('f_name_ar').value.trim(),
    role: document.getElementById('f_role').value,
    branch: getCheckedValues('cg_branch').join(', ') || null,
    stages: getCheckedValues('cg_stages').join(', ') || null,
    grades: getCheckedValues('cg_grades').join(', ') || null,
    sections: getCheckedValues('cg_sections').join(', ') || null,
    subject: getCheckedValues('cg_subject').join(', ') || null,
    national_id: document.getElementById('f_national_id').value.trim() || null
  };

  if (!data.name_ar) {
    errorEl.textContent = 'اسم الموظف مطلوب';
    return;
  }

  const saveBtn = document.getElementById('saveEmployeeBtn');
  saveBtn.disabled = true;

  try {
    if (editingId) {
      await mirqatApi('employees', 'update', { id: editingId, data });
    } else {
      await mirqatApi('employees', 'create', { data });
    }
    closeEmployeeModal();
    loadEmployees();
  } catch (e) {
    errorEl.textContent = e.message;
  } finally {
    saveBtn.disabled = false;
  }
}

function askDeleteEmployee(id, name) {
  deleteTargetId = id;
  document.getElementById('confirmMessage').textContent = `سيتم حذف الموظف "${name}" نهائيًا. هذا الإجراء لا يمكن التراجع عنه.`;
  document.getElementById('confirmModal').hidden = false;
}

function closeConfirmModal() {
  document.getElementById('confirmModal').hidden = true;
  deleteTargetId = null;
}

async function performDelete() {
  if (!deleteTargetId) return;
  try {
    await mirqatApi('employees', 'delete', { id: deleteTargetId });
    closeConfirmModal();
    loadEmployees();
  } catch (e) {
    alert('تعذّر حذف الموظف: ' + e.message);
  }
}
