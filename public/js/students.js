const user = mirqatInitShell('students');
let allLists = {};
let editingId = null;
let deleteTargetId = null;
let currentPage = 1;
let studentsCache = [];
let gradesChartInstance = null;

if (user) init();

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
    document.getElementById(id).addEventListener('input', debounce(handleFiltersChanged, 350));
  });

  document.getElementById('addStudentBtn').addEventListener('click', () => openStudentModal());
  document.getElementById('closeStudentModal').addEventListener('click', closeStudentModal);
  document.getElementById('cancelStudentBtn').addEventListener('click', closeStudentModal);
  document.getElementById('studentForm').addEventListener('submit', submitStudentForm);

  document.getElementById('closeConfirmModal').addEventListener('click', closeConfirmModal);
  document.getElementById('cancelConfirmBtn').addEventListener('click', closeConfirmModal);
  document.getElementById('confirmDeleteBtn').addEventListener('click', performDelete);

  loadOverview();
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

function getFilters() {
  return {
    search: document.getElementById('searchInput').value.trim() || undefined,
    branch: document.getElementById('filterBranch').value || undefined,
    stages: document.getElementById('filterStage').value || undefined,
    grades: document.getElementById('filterGrade').value || undefined,
    sections: document.getElementById('filterSection').value || undefined
  };
}

function hasActiveFilter(filters) {
  return Object.values(filters).some(v => v !== undefined && v !== '');
}

function handleFiltersChanged() {
  const filters = getFilters();
  if (hasActiveFilter(filters)) {
    document.getElementById('overviewSection').style.display = 'none';
    document.getElementById('resultsTableWrap').style.display = 'block';
    loadStudents(1);
  } else {
    document.getElementById('resultsTableWrap').style.display = 'none';
    document.getElementById('paginationBar').innerHTML = '';
    document.getElementById('overviewSection').style.display = 'block';
  }
}

/* ---------------- النظرة العامة (إحصائيات + رسم بياني + آخر 10) ---------------- */
async function loadOverview() {
  try {
    const stats = await mirqatApi('students', 'getStats', {});
    renderStatsCards(stats);
    renderGradesChart(stats.byGrade);
  } catch (e) {
    document.getElementById('statsCards').innerHTML = `<p class="empty-state">تعذّر تحميل الإحصائيات: ${e.message}</p>`;
  }

  try {
    const recent = await mirqatApi('students', 'getRecent', { limit: 10 });
    renderRecentTable(recent);
  } catch (e) {
    document.getElementById('recentTableBody').innerHTML = `<tr><td colspan="4" class="empty-state">تعذّر التحميل</td></tr>`;
  }
}

function renderStatsCards(stats) {
  const topBranch = [...stats.byBranch].sort((a, b) => b.count - a.count)[0];
  const cards = [
    { label: 'إجمالي الطلاب', value: stats.total, tone: 'primary' },
    { label: 'عدد الفروع', value: stats.byBranch.length, tone: 'gold' },
    { label: 'أكبر فرع', value: topBranch ? `${topBranch.label} (${topBranch.count})` : '—', tone: 'info' }
  ];
  document.getElementById('statsCards').innerHTML = cards.map(c => `
    <div class="card" data-tone="${c.tone}">
      <div class="card-value" style="font-size:${typeof c.value === 'string' && c.value.length > 8 ? '18px' : '28px'}">${c.value}</div>
      <div class="card-label">${c.label}</div>
    </div>
  `).join('');
}

function renderGradesChart(byGrade) {
  const ctx = document.getElementById('gradesChart');
  if (gradesChartInstance) gradesChartInstance.destroy();

  gradesChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: byGrade.map(g => g.label),
      datasets: [{
        label: 'عدد الطلاب',
        data: byGrade.map(g => g.count),
        backgroundColor: '#2F6B52',
        borderRadius: 3
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

function renderRecentTable(students) {
  const body = document.getElementById('recentTableBody');
  if (!students.length) {
    body.innerHTML = '<tr><td colspan="4" class="empty-state">لا يوجد طلاب بعد</td></tr>';
    return;
  }
  body.innerHTML = students.map(s => `
    <tr class="clickable" onclick="openStudentDrawerFromRecent('${s.id}')">
      <td data-label="المعرّف">${s.id}</td>
      <td data-label="الاسم">${s.name_ar}</td>
      <td data-label="الفرع">${s.branch || '—'}</td>
      <td data-label="الصف">${s.grades || '—'}</td>
    </tr>
  `).join('');
  window.__recentCache = students;
}

function openStudentDrawerFromRecent(id) {
  const s = (window.__recentCache || []).find(x => x.id === id);
  if (s) { studentsCache = window.__recentCache; openStudentDrawer(id); }
}

/* ---------------- نتائج الفلترة (مُرقَّمة) ---------------- */
async function loadStudents(page = currentPage) {
  currentPage = page;
  const body = document.getElementById('studentsTableBody');
  body.innerHTML = '<tr><td colspan="7" class="loading-row">جارٍ التحميل...</td></tr>';

  const filters = getFilters();

  try {
    const result = await mirqatApi('students', 'list', { filters, page, pageSize: 25 });
    studentsCache = result.rows;
    renderTable(result.rows);
    mirqatRenderPagination('paginationBar', result, (p) => loadStudents(p));
  } catch (e) {
    body.innerHTML = `<tr><td colspan="7" class="empty-state">تعذّر تحميل الطلاب: ${e.message}</td></tr>`;
  }
}

function renderTable(students) {
  const body = document.getElementById('studentsTableBody');
  if (!students.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty-state">لا يوجد طلاب مطابقون</td></tr>';
    return;
  }
  body.innerHTML = students.map(s => `
    <tr class="clickable" onclick="openStudentDrawer('${s.id}')">
      <td data-label="المعرّف">${s.id}</td>
      <td data-label="الاسم">${s.name_ar}</td>
      <td data-label="الفرع">${s.branch || '—'}</td>
      <td data-label="المرحلة">${s.stages || '—'}</td>
      <td data-label="الصف">${s.grades || '—'}</td>
      <td data-label="الشعبة">${s.sections || '—'}</td>
      <td data-label="حالة الرسوم">${s.fees_status || '—'}</td>
    </tr>
  `).join('');
}

/* ---------------- نافذة التفاصيل ---------------- */
function openStudentDrawer(id) {
  const s = studentsCache.find(x => x.id === id);
  if (!s) return;

  const bodyHtml = [
    mirqatDrawerField('المعرّف', s.id),
    mirqatDrawerField('الاسم بالعربي', s.name_ar),
    mirqatDrawerField('الاسم بالإنجليزي', s.name_en),
    mirqatDrawerField('رقم الهوية', s.national_id),
    mirqatDrawerField('الجنسية', s.nationality),
    mirqatDrawerField('تاريخ الميلاد', s.dob),
    mirqatDrawerField('الجنس', s.gender),
    mirqatDrawerField('الفرع', s.branch),
    mirqatDrawerField('المرحلة', s.stages),
    mirqatDrawerField('الصف', s.grades),
    mirqatDrawerField('الشعبة', s.sections),
    mirqatDrawerField('حالة الرسوم', s.fees_status)
  ].join('');

  const footerHtml = user.role === 'admin' ? `
    <button class="btn btn-outline" onclick="mirqatCloseDrawer(); editStudent('${s.id}')">تعديل</button>
    <button class="btn btn-danger" onclick="mirqatCloseDrawer(); askDeleteStudent('${s.id}', '${s.name_ar.replace(/'/g, "\\'")}')">حذف</button>
  ` : '';

  mirqatOpenDrawer({ title: s.name_ar, bodyHtml, footerHtml });
}

/* ---------------- إضافة/تعديل ---------------- */
function editStudent(id) {
  const s = studentsCache.find(x => x.id === id);
  if (s) openStudentModal(s);
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
      await mirqatApi('students', 'update', { id: editingId, data }, { cache: false });
    } else {
      await mirqatApi('students', 'create', { data }, { cache: false });
    }
    closeStudentModal();
    handleFiltersChanged();
    loadOverview();
  } catch (e) {
    errorEl.textContent = e.message;
  } finally {
    saveBtn.disabled = false;
  }
}

/* ---------------- حذف ---------------- */
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
    await mirqatApi('students', 'delete', { id: deleteTargetId }, { cache: false });
    closeConfirmModal();
    handleFiltersChanged();
    loadOverview();
  } catch (e) {
    alert('تعذّر حذف الطالب: ' + e.message);
  }
}
