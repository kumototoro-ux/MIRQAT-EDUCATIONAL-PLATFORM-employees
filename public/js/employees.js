const user = mirqatInitShell('employees');
let allLists = {};
let editingId = null;
let deleteTargetId = null;
let currentPage = 1;
let employeesCache = [];

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
    document.getElementById(id).addEventListener('input', debounce(() => loadEmployees(1), 300));
  });

  document.getElementById('addEmployeeBtn').addEventListener('click', () => openEmployeeModal());
  document.getElementById('closeEmployeeModal').addEventListener('click', closeEmployeeModal);
  document.getElementById('cancelEmployeeBtn').addEventListener('click', closeEmployeeModal);
  document.getElementById('employeeForm').addEventListener('submit', submitEmployeeForm);

  document.getElementById('closeConfirmModal').addEventListener('click', closeConfirmModal);
  document.getElementById('cancelConfirmBtn').addEventListener('click', closeConfirmModal);
  document.getElementById('confirmDeleteBtn').addEventListener('click', performDelete);

  loadEmployees(1);
}

function fillSelect(id, options = [], placeholder = null) {
  const el = document.getElementById(id);
  el.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : '') +
    options.map(o => `<option value="${o}">${o}</option>`).join('');
}

function buildCheckboxGroup(containerId, options = []) {
  document.getElementById(containerId).innerHTML = options.map(o => `<label><input type="checkbox" value="${o}"> ${o}</label>`).join('');
}

function getCheckedValues(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} input:checked`)).map(i => i.value);
}

function setCheckedValues(containerId, commaString) {
  const values = (commaString || '').split(',').map(v => v.trim()).filter(Boolean);
  document.querySelectorAll(`#${containerId} input`).forEach(i => { i.checked = values.includes(i.value); });
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function loadEmployees(page = currentPage) {
  currentPage = page;
  const body = document.getElementById('employeesTableBody');
  body.innerHTML = '<tr><td colspan="6" class="loading-row">جارٍ التحميل...</td></tr>';

  const filters = {
    search: document.getElementById('searchInput').value.trim() || undefined,
    branch: document.getElementById('filterBranch').value || undefined,
    role: document.getElementById('filterRole').value || undefined
  };

  try {
    const result = await mirqatApi('employees', 'list', { filters, page, pageSize: 25 });
    employeesCache = result.rows;
    renderTable(result.rows);
    mirqatRenderPagination('paginationBar', result, (p) => loadEmployees(p));
  } catch (e) {
    body.innerHTML = `<tr><td colspan="6" class="empty-state">تعذّر تحميل الموظفين: ${e.message}</td></tr>`;
  }
}

function renderTable(employees) {
  const body = document.getElementById('employeesTableBody');
  if (!employees.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty-state">لا يوجد موظفون مطابقون</td></tr>';
    return;
  }
  body.innerHTML = employees.map(e => `
    <tr class="clickable" onclick="openEmployeeDrawer('${e.id}')">
      <td data-label="المعرّف">${e.id}</td>
      <td data-label="الاسم">${e.name_ar}</td>
      <td data-label="الدور">${e.role === 'admin' ? 'أدمن' : 'معلم'}</td>
      <td data-label="الفرع">${e.branch || '—'}</td>
      <td data-label="الصفوف">${e.grades || '—'}</td>
      <td data-label="المواد">${e.subject || '—'}</td>
    </tr>
  `).join('');
}

function openEmployeeDrawer(id) {
  const e = employeesCache.find(x => x.id === id);
  if (!e) return;

  const bodyHtml = [
    mirqatDrawerField('المعرّف', e.id),
    mirqatDrawerField('الاسم', e.name_ar),
    mirqatDrawerField('الدور', e.role === 'admin' ? 'أدمن' : 'معلم'),
    mirqatDrawerField('رقم الهوية', e.national_id),
    mirqatDrawerField('الفرع', e.branch),
    mirqatDrawerField('المرحلة', e.stages),
    mirqatDrawerField('الصفوف', e.grades),
    mirqatDrawerField('الشعب', e.sections),
    mirqatDrawerField('المواد', e.subject)
  ].join('');

  const footerHtml = `
    <button class="btn btn-outline" onclick="mirqatCloseDrawer(); editEmployee('${e.id}')">تعديل</button>
    <button class="btn btn-danger" onclick="mirqatCloseDrawer(); askDeleteEmployee('${e.id}', '${e.name_ar.replace(/'/g, "\\'")}')">حذف</button>
  `;

  mirqatOpenDrawer({ title: e.name_ar, bodyHtml, footerHtml });
}

function editEmployee(id) {
  const e = employeesCache.find(x => x.id === id);
  if (e) openEmployeeModal(e);
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

function closeEmployeeModal() { document.getElementById('employeeModal').hidden = true; }

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

  if (!data.name_ar) { errorEl.textContent = 'اسم الموظف مطلوب'; return; }

  const saveBtn = document.getElementById('saveEmployeeBtn');
  saveBtn.disabled = true;

  try {
    if (editingId) {
      await mirqatApi('employees', 'update', { id: editingId, data }, { cache: false });
    } else {
      await mirqatApi('employees', 'create', { data }, { cache: false });
    }
    closeEmployeeModal();
    loadEmployees(editingId ? currentPage : 1);
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
    await mirqatApi('employees', 'delete', { id: deleteTargetId }, { cache: false });
    closeConfirmModal();
    loadEmployees(currentPage);
  } catch (e) {
    alert('تعذّر حذف الموظف: ' + e.message);
  }
}
