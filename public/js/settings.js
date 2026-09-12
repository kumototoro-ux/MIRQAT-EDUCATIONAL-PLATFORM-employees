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
}

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => p.hidden = true);
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
