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

/* ---------------- قائمة الحسابات (بطاقات) ---------------- */
let accountsCache = [];

async function loadAccounts() {
  const grid = document.getElementById('accountsGrid');
  grid.innerHTML = '<p class="loading-row">جارٍ التحميل...</p>';

  try {
    await buildOwnerDirectory();
    accountsCache = await mirqatApi('auth', 'listAccounts', { kind: currentKind });

    if (!accountsCache.length) {
      grid.innerHTML = '<p class="empty-state">لا يوجد حسابات بعد</p>';
      return;
    }

    grid.innerHTML = accountsCache.map(a => {
      const ownerId = currentKind === 'staff' ? a.employee_id : a.student_id;
      const owner = ownerDirectory.get(ownerId);
      const ownerName = owner?.name_ar || ownerId || '—';
      const isActive = a.status === 'active';
      return `
        <div class="account-card" onclick="openAccountDetail('${a.user_id}')">
          <div class="ac-top">
            <div>
              <div class="ac-username">${ownerName}</div>
              <div class="ac-owner">@${a.username}${owner?.role ? ' — ' + owner.role : ''}</div>
            </div>
            <span class="ac-status ${isActive ? 'active' : 'suspended'}">${isActive ? 'نشط' : 'موقوف'}</span>
          </div>
          <div class="ac-date">أُنشئ: ${a.created_at ? new Date(a.created_at).toLocaleDateString('ar-SA') : '—'}</div>
        </div>
      `;
    }).join('');
  } catch (e) {
    grid.innerHTML = `<p class="empty-state">تعذّر تحميل الحسابات: ${e.message}</p>`;
  }
}

/** يفتح لوحة التفاصيل الكاملة (بيانات صاحب الحساب + الصلاحيات + إجراءات) */
function openAccountDetail(userId) {
  const account = accountsCache.find(a => a.user_id === userId);
  if (!account) return;
  const ownerId = currentKind === 'staff' ? account.employee_id : account.student_id;
  const owner = ownerDirectory.get(ownerId) || {};
  const isActive = account.status === 'active';

  let bodyHtml = `
    <div class="drawer-field"><span class="label">اسم المستخدم</span><span class="value">${account.username}</span></div>
    <div class="drawer-field"><span class="label">الحالة</span><span class="value">${isActive ? 'نشط' : 'موقوف'}</span></div>
    <div class="drawer-field"><span class="label">تاريخ الإنشاء</span><span class="value">${account.created_at ? new Date(account.created_at).toLocaleDateString('ar-SA') : '—'}</span></div>
  `;

  if (currentKind === 'staff') {
    bodyHtml += `
      <div class="drawer-field"><span class="label">الاسم</span><span class="value">${owner.name_ar || '—'}</span></div>
      <div class="drawer-field"><span class="label">الدور / الصلاحية</span><span class="value">${owner.role === 'admin' ? 'أدمن' : owner.role || '—'}</span></div>
      <div class="drawer-field"><span class="label">الفرع</span><span class="value">${owner.branch || '—'}</span></div>
      <div class="drawer-field"><span class="label">المراحل</span><span class="value">${owner.stages || '—'}</span></div>
      <div class="drawer-field"><span class="label">الصفوف</span><span class="value">${owner.grades || '—'}</span></div>
      <div class="drawer-field"><span class="label">الشعب</span><span class="value">${owner.sections || '—'}</span></div>
      <div class="drawer-field"><span class="label">المواد</span><span class="value">${owner.subject || '—'}</span></div>
      <div class="drawer-field"><span class="label">حالة الموظف نفسه</span><span class="value">${owner.is_active === false ? 'غير نشط' : 'نشط'}</span></div>
    `;
  } else {
    bodyHtml += `
      <div class="drawer-field"><span class="label">اسم الطالب</span><span class="value">${owner.name_ar || '—'}</span></div>
      <div class="drawer-field"><span class="label">الفرع</span><span class="value">${owner.branch || '—'}</span></div>
      <div class="drawer-field"><span class="label">الصف / الشعبة</span><span class="value">${owner.grades || '—'} ${owner.sections || ''}</span></div>
    `;
  }

  const footerHtml = `
    <button class="btn btn-outline" onclick="toggleStatus('${account.user_id}', ${!isActive}); mirqatCloseDrawer();">${isActive ? 'تعليق الحساب' : 'تفعيل الحساب'}</button>
    <button class="btn btn-primary" onclick="mirqatCloseDrawer(); openEditModal('${account.user_id}');">تعديل</button>
    <button class="btn btn-danger" onclick="mirqatCloseDrawer(); askDelete('${account.user_id}');">حذف</button>
  `;

  mirqatOpenDrawer({ title: owner.name_ar || account.username, bodyHtml, footerHtml });
}

/** يبني فهرس id -> بيانات كاملة للموظفين أو الطلاب حسب التبويب الحالي */
async function buildOwnerDirectory() {
  ownerDirectory = new Map();
  try {
    if (currentKind === 'staff') {
      const employees = await mirqatApi('employees', 'list', { filters: {}, page: 1, pageSize: 100 });
      employees.rows.forEach(e => ownerDirectory.set(e.id, e));
    } else {
      const res = await mirqatApi('students', 'list', { filters: {}, page: 1, pageSize: 100 });
      res.rows.forEach(s => ownerDirectory.set(s.id, s));
    }
  } catch { /* يبقى فارغًا */ }
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
