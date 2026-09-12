const user = mirqatInitShell('accounts');
let currentKind = 'staff';
let ownerDirectory = new Map(); // id -> name (للربط بين الحساب وصاحبه)
let selectedOwnerId = null;
let editTargetId = null;
let deleteTargetId = null;

if (user) {
  if (user.role !== 'admin') {
    document.getElementById('mainContent').innerHTML = '<p class="empty-state">هذه الصفحة تتطلب صلاحية أدمن</p>';
  } else {
    init();
  }
}

function init() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentKind = btn.dataset.kind;
      resetCreateForm();
      updateLabels();
      loadAccounts();
    });
  });

  document.getElementById('ownerSearch').addEventListener('input', debounce(searchOwners, 300));
  document.getElementById('createAccountBtn').addEventListener('click', createAccount);

  document.getElementById('closeEditModal').addEventListener('click', closeEditModal);
  document.getElementById('cancelEditBtn').addEventListener('click', closeEditModal);
  document.getElementById('editForm').addEventListener('submit', submitEdit);

  document.getElementById('closeConfirmModal').addEventListener('click', closeConfirmModal);
  document.getElementById('cancelConfirmBtn').addEventListener('click', closeConfirmModal);
  document.getElementById('confirmDeleteBtn').addEventListener('click', performDelete);

  updateLabels();
  loadAccounts();
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function updateLabels() {
  const isStaff = currentKind === 'staff';
  document.getElementById('createTitle').textContent = isStaff ? 'إنشاء حساب موظف جديد' : 'إنشاء حساب طالب جديد';
  document.getElementById('ownerSearchLabel').textContent = isStaff
    ? 'ابحث عن الموظف المراد إنشاء حساب له'
    : 'ابحث عن الطالب المراد إنشاء حساب له';
}

/* ---------------- بحث عن صاحب الحساب (موظف/طالب) ---------------- */
async function searchOwners() {
  const q = document.getElementById('ownerSearch').value.trim();
  const results = document.getElementById('ownerResults');
  if (q.length < 2) { results.innerHTML = ''; return; }

  try {
    let list;
    if (currentKind === 'staff') {
      const res = await mirqatApi('employees', 'list', { filters: { search: q } });
      list = res.rows;
    } else {
      const res = await mirqatApi('students', 'list', { filters: { search: q }, page: 1, pageSize: 10 });
      list = res.rows;
    }
    results.innerHTML = list.slice(0, 8).map(o =>
      `<span class="chip" style="cursor:pointer" onclick="selectOwner('${o.id}', '${o.name_ar.replace(/'/g, "\\'")}')">${o.name_ar} (${o.id})</span>`
    ).join('') || '<span class="chip">لا نتائج</span>';
  } catch { /* silent */ }
}

function selectOwner(id, name) {
  selectedOwnerId = id;
  document.getElementById('ownerId').value = id;
  document.getElementById('selectedOwner').textContent = `المحدد: ${name} (${id})`;
  document.getElementById('ownerResults').innerHTML = '';
  document.getElementById('ownerSearch').value = name;
}

function resetCreateForm() {
  selectedOwnerId = null;
  document.getElementById('ownerId').value = '';
  document.getElementById('ownerSearch').value = '';
  document.getElementById('selectedOwner').textContent = '';
  document.getElementById('ownerResults').innerHTML = '';
  document.getElementById('newUsername').value = '';
  document.getElementById('newPassword').value = '';
  document.getElementById('createError').textContent = '';
}

async function createAccount() {
  const errorEl = document.getElementById('createError');
  errorEl.textContent = '';

  const ownerId = document.getElementById('ownerId').value;
  const username = document.getElementById('newUsername').value.trim();
  const password = document.getElementById('newPassword').value;

  if (!ownerId) { errorEl.textContent = 'اختر الموظف/الطالب من نتائج البحث أولًا'; return; }
  if (!username || !password) { errorEl.textContent = 'اسم المستخدم وكلمة المرور مطلوبان'; return; }
  if (password.length < 6) { errorEl.textContent = 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'; return; }

  const btn = document.getElementById('createAccountBtn');
  btn.disabled = true;

  try {
    await mirqatApi('auth', 'createAccount', { kind: currentKind, ownerId, username, password }, { cache: false });
    resetCreateForm();
    loadAccounts();
  } catch (e) {
    errorEl.textContent = e.message;
  } finally {
    btn.disabled = false;
  }
}

/* ---------------- قائمة الحسابات ---------------- */
async function loadAccounts() {
  const body = document.getElementById('accountsTableBody');
  body.innerHTML = '<tr><td colspan="5" class="loading-row">جارٍ التحميل...</td></tr>';

  try {
    await buildOwnerDirectory();
    const accounts = await mirqatApi('auth', 'listAccounts', { kind: currentKind });

    if (!accounts.length) {
      body.innerHTML = '<tr><td colspan="5" class="empty-state">لا يوجد حسابات بعد</td></tr>';
      return;
    }

    body.innerHTML = accounts.map(a => {
      const ownerId = currentKind === 'staff' ? a.employee_id : a.student_id;
      const ownerName = ownerDirectory.get(ownerId) || ownerId || '—';
      const isActive = a.status === 'active';
      return `
        <tr>
          <td data-label="اسم المستخدم">${a.username}</td>
          <td data-label="الاسم المرتبط">${ownerName}</td>
          <td data-label="الحالة">${isActive ? 'نشط' : 'موقوف'}</td>
          <td data-label="تاريخ الإنشاء">${a.created_at ? new Date(a.created_at).toLocaleDateString('ar-SA') : '—'}</td>
          <td>
            <div class="row-actions">
              <button class="btn btn-outline btn-sm" onclick="toggleStatus('${a.user_id}', ${!isActive})">${isActive ? 'تعليق' : 'تفعيل'}</button>
              <button class="btn btn-outline btn-sm" onclick="openEditModal('${a.user_id}')">تعديل</button>
              <button class="btn btn-danger btn-sm" onclick="askDelete('${a.user_id}')">حذف</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    body.innerHTML = `<tr><td colspan="5" class="empty-state">تعذّر تحميل الحسابات: ${e.message}</td></tr>`;
  }
}

/** يبني فهرس id -> اسم للموظفين أو الطلاب حسب التبويب الحالي، لعرض الاسم بدل المعرّف فقط */
async function buildOwnerDirectory() {
  ownerDirectory = new Map();
  try {
    if (currentKind === 'staff') {
      const employees = await mirqatApi('employees', 'list', { filters: {}, page: 1, pageSize: 100 });
      employees.rows.forEach(e => ownerDirectory.set(e.id, e.name_ar));
    } else {
      const res = await mirqatApi('students', 'list', { filters: {}, page: 1, pageSize: 100 });
      res.rows.forEach(s => ownerDirectory.set(s.id, s.name_ar));
    }
  } catch { /* يبقى فارغًا، سيُعرض المعرّف فقط */ }
}

/* ---------------- تعديل ---------------- */
function openEditModal(userId) {
  editTargetId = userId;
  document.getElementById('ef_username').value = '';
  document.getElementById('ef_password').value = '';
  document.getElementById('editFormError').textContent = '';
  document.getElementById('editModal').hidden = false;
}

function closeEditModal() { document.getElementById('editModal').hidden = true; editTargetId = null; }

async function submitEdit(e) {
  e.preventDefault();
  const errorEl = document.getElementById('editFormError');
  errorEl.textContent = '';

  const username = document.getElementById('ef_username').value.trim();
  const password = document.getElementById('ef_password').value;

  if (!username && !password) { errorEl.textContent = 'أدخل اسم مستخدم جديد أو كلمة مرور جديدة على الأقل'; return; }
  if (password && password.length < 6) { errorEl.textContent = 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'; return; }

  const btn = document.getElementById('saveEditBtn');
  btn.disabled = true;

  try {
    await mirqatApi('auth', 'updateAccount', {
      kind: currentKind,
      userId: editTargetId,
      username: username || undefined,
      password: password || undefined
    }, { cache: false });
    closeEditModal();
    loadAccounts();
  } catch (e) {
    errorEl.textContent = e.message;
  } finally {
    btn.disabled = false;
  }
}

/* ---------------- تفعيل/تعليق ---------------- */
async function toggleStatus(userId, activate) {
  try {
    await mirqatApi('auth', 'toggleAccountStatus', {
      kind: currentKind,
      userId,
      newStatus: activate ? 'active' : 'suspended'
    }, { cache: false });
    loadAccounts();
  } catch (e) {
    alert('تعذّر تغيير حالة الحساب: ' + e.message);
  }
}

/* ---------------- حذف ---------------- */
function askDelete(userId) {
  deleteTargetId = userId;
  document.getElementById('confirmModal').hidden = false;
}

function closeConfirmModal() {
  document.getElementById('confirmModal').hidden = true;
  deleteTargetId = null;
}

async function performDelete() {
  if (!deleteTargetId) return;
  try {
    await mirqatApi('auth', 'deleteAccount', { kind: currentKind, userId: deleteTargetId }, { cache: false });
    closeConfirmModal();
    loadAccounts();
  } catch (e) {
    alert('تعذّر حذف الحساب: ' + e.message);
  }
}
