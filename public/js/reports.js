const user = mirqatInitShell('reports');
let allLists = {};
let selectedStudent = null;
let selectedEmployee = null;

if (user) {
  if (user.role !== 'admin') {
    document.getElementById('reportsBody').style.display = 'none';
    document.getElementById('accessDenied').style.display = 'block';
  } else {
    init();
  }
}

async function init() {
  try { allLists = await mirqatApi('settings', 'getSettingsLists'); } catch { allLists = {}; }

  fillSelect('rs_term', allLists.terms, 'كل الترمات');
  fillSelect('ra_branch', allLists.branches, 'كل الفروع');
  fillSelect('ra_term', allLists.terms, 'كل الترمات');
  fillSelect('rg_branch', allLists.branches, 'كل الفروع');
  fillSelect('rg_term', allLists.terms, 'كل الترمات');
  fillSelect('rg_subject', allLists.subject, 'كل المواد');
  fillSelect('rg_grades', allLists.grades, 'كل الصفوف');

  document.getElementById('ra_term').addEventListener('change', () => populateWeeks('ra_term', 'ra_week'));
  document.getElementById('rg_term').addEventListener('change', () => populateWeeks('rg_term', 'rg_week'));

  setupReportTypeTabs();

  document.getElementById('rs_search').addEventListener('input', debounce(searchStudentsForReport, 300));
  document.getElementById('rs_generateBtn').addEventListener('click', generateStudentReport);

  document.getElementById('re_search').addEventListener('input', debounce(searchEmployeesForReport, 300));
  document.getElementById('re_generateBtn').addEventListener('click', generateEmployeeReport);

  document.getElementById('ra_generateBtn').addEventListener('click', generateAttendanceReport);
  document.getElementById('rg_generateBtn').addEventListener('click', generateGradingReport);

  document.getElementById('printReportBtn').addEventListener('click', () => window.print());
  document.getElementById('closeReportBtn').addEventListener('click', () => {
    document.getElementById('reportPreviewWrap').style.display = 'none';
  });
}

function fillSelect(id, options = [], placeholder = null) {
  const el = document.getElementById(id);
  el.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : '') + (options || []).map(o => `<option value="${o}">${o}</option>`).join('');
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

async function populateWeeks(termSelectId, weekSelectId) {
  const term = document.getElementById(termSelectId).value;
  const weekSelect = document.getElementById(weekSelectId);
  if (!term) { weekSelect.innerHTML = '<option value="">كل الأسابيع</option>'; return; }
  weekSelect.innerHTML = '<option value="">جارٍ التحميل...</option>';
  const weeks = await mirqatGetWeeksForTerm(term);
  weekSelect.innerHTML = '<option value="">كل الأسابيع</option>' + weeks.map(w => `<option value="${w}">${w}</option>`).join('');
}

function setupReportTypeTabs() {
  document.querySelectorAll('#reportTypeTabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#reportTypeTabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ['student', 'employee', 'attendance', 'grading'].forEach(t => {
        document.getElementById('filters-' + t).hidden = t !== btn.dataset.rtype;
      });
      document.getElementById('reportPreviewWrap').style.display = 'none';
    });
  });
}

/* ================= تقرير طالب ================= */
async function searchStudentsForReport() {
  const q = document.getElementById('rs_search').value.trim();
  const box = document.getElementById('rs_results');
  if (q.length < 2) { box.innerHTML = ''; return; }
  try {
    const res = await mirqatApi('students', 'list', { filters: { search: q }, page: 1, pageSize: 8 });
    box.innerHTML = res.rows.map(s =>
      `<span class="chip" style="cursor:pointer" onclick='pickStudent(${JSON.stringify(s).replace(/'/g, "&apos;")})'>${s.name_ar}</span>`
    ).join('') || '<span class="chip">لا نتائج</span>';
  } catch { /* صامت */ }
}

function pickStudent(s) {
  selectedStudent = s;
  document.getElementById('rs_search').value = s.name_ar;
  document.getElementById('rs_results').innerHTML = '';
  document.getElementById('rs_generateBtn').disabled = false;
}

async function generateStudentReport() {
  if (!selectedStudent) return;
  const term = document.getElementById('rs_term').value || undefined;

  let data;
  try {
    data = await mirqatApi('reports', 'getStudentReportCard', { studentId: selectedStudent.id, term });
  } catch (e) { alert('تعذّر إنشاء التقرير: ' + e.message); return; }

  const s = data.student;
  const gradesRows = data.grades.map(g => `
    <tr>
      <td>${g.subject || '—'}</td>
      <td>${g.term || '—'}</td>
      <td>${g.total ?? '—'}</td>
      <td>${g.is_visible ? 'ظاهرة لولي الأمر' : 'غير ظاهرة'}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="text-align:center;">لا يوجد درجات مسجّلة</td></tr>';

  const behaviorRows = data.behavior.slice(0, 10).map(b => `
    <tr><td>${b.status || '—'}</td><td>${b.score ?? '—'}</td><td>${b.note || '—'}</td><td>${b.term || '—'}</td></tr>
  `).join('') || '<tr><td colspan="4" style="text-align:center;">لا يوجد سجلات سلوك</td></tr>';

  renderReport(`
    ${reportHeaderHtml('تقرير أداء طالب')}
    <div class="report-section">
      <h3>بيانات الطالب</h3>
      <div class="report-stat-row">
        <div class="report-stat-box"><div class="rs-value">${s.name_ar}</div><div class="rs-label">الاسم</div></div>
        <div class="report-stat-box"><div class="rs-value">${s.id}</div><div class="rs-label">المعرّف</div></div>
        <div class="report-stat-box"><div class="rs-value">${s.branch || '—'}</div><div class="rs-label">الفرع</div></div>
        <div class="report-stat-box"><div class="rs-value">${s.grades || '—'} ${s.sections || ''}</div><div class="rs-label">الصف/الشعبة</div></div>
      </div>
    </div>
    <div class="report-section">
      <h3>الدرجات المجمّعة${term ? ' — ' + term : ''}</h3>
      <table class="report-table"><thead><tr><th>المادة</th><th>الترم</th><th>المجموع</th><th>الحالة</th></tr></thead><tbody>${gradesRows}</tbody></table>
    </div>
    <div class="report-section">
      <h3>آخر سجلات السلوك</h3>
      <table class="report-table"><thead><tr><th>الحالة</th><th>الدرجة</th><th>ملاحظة</th><th>الترم</th></tr></thead><tbody>${behaviorRows}</tbody></table>
    </div>
    ${reportFooterHtml()}
  `);
}

/* ================= تقرير موظف ================= */
async function searchEmployeesForReport() {
  const q = document.getElementById('re_search').value.trim();
  const box = document.getElementById('re_results');
  if (q.length < 2) { box.innerHTML = ''; return; }
  try {
    const res = await mirqatApi('employees', 'list', { filters: { search: q }, page: 1, pageSize: 8 });
    box.innerHTML = res.rows.map(e =>
      `<span class="chip" style="cursor:pointer" onclick='pickEmployee(${JSON.stringify(e).replace(/'/g, "&apos;")})'>${e.name_ar}</span>`
    ).join('') || '<span class="chip">لا نتائج</span>';
  } catch { /* صامت */ }
}

function pickEmployee(e) {
  selectedEmployee = e;
  document.getElementById('re_search').value = e.name_ar;
  document.getElementById('re_results').innerHTML = '';
  document.getElementById('re_generateBtn').disabled = false;
}

async function generateEmployeeReport() {
  if (!selectedEmployee) return;
  let summary;
  try {
    summary = await mirqatApi('audit', 'getTeacherActivitySummary', { employeeId: selectedEmployee.id });
  } catch (e) { alert('تعذّر إنشاء التقرير: ' + e.message); return; }

  const e = selectedEmployee;
  renderReport(`
    ${reportHeaderHtml('تقرير نشاط موظف')}
    <div class="report-section">
      <h3>بيانات الموظف</h3>
      <div class="report-stat-row">
        <div class="report-stat-box"><div class="rs-value">${e.name_ar}</div><div class="rs-label">الاسم</div></div>
        <div class="report-stat-box"><div class="rs-value">${e.role || '—'}</div><div class="rs-label">الدور</div></div>
        <div class="report-stat-box"><div class="rs-value">${e.branch || '—'}</div><div class="rs-label">الفرع</div></div>
        <div class="report-stat-box"><div class="rs-value">${e.subject || '—'}</div><div class="rs-label">المادة</div></div>
      </div>
    </div>
    <div class="report-section">
      <h3>ملخص النشاط (إجمالي منذ بداية استخدام النظام)</h3>
      <div class="report-stat-row">
        <div class="report-stat-box"><div class="rs-value">${summary.attendanceRecords}</div><div class="rs-label">سجلات تحضير</div></div>
        <div class="report-stat-box"><div class="rs-value">${summary.gradingRecords}</div><div class="rs-label">سجلات رصد</div></div>
        <div class="report-stat-box"><div class="rs-value">${summary.tasks}</div><div class="rs-label">تكاليف</div></div>
        <div class="report-stat-box"><div class="rs-value">${summary.enrichments}</div><div class="rs-label">إثراءات</div></div>
        <div class="report-stat-box"><div class="rs-value">${summary.behaviorRecords}</div><div class="rs-label">سجلات سلوك</div></div>
      </div>
    </div>
    ${reportFooterHtml()}
  `);
}

/* ================= تقرير تحضير ================= */
async function generateAttendanceReport() {
  const filters = {
    branch: document.getElementById('ra_branch').value || undefined,
    term: document.getElementById('ra_term').value || undefined,
    week: document.getElementById('ra_week').value || undefined,
    day: document.getElementById('ra_day').value || undefined
  };

  let data;
  try { data = await mirqatApi('attendance', 'getFilteredStats', filters); } catch (e) { alert('تعذّر إنشاء التقرير: ' + e.message); return; }

  const rows = data.byStatus.map(s => `
    <tr><td>${s.label}</td><td>${s.count}</td><td>${data.total ? Math.round((s.count / data.total) * 1000) / 10 : 0}%</td></tr>
  `).join('');

  renderReport(`
    ${reportHeaderHtml('تقرير التحضير والغياب')}
    <div class="report-meta">${filterSummaryLine(filters)}</div>
    <div class="report-section">
      <div class="report-stat-row">
        <div class="report-stat-box"><div class="rs-value">${data.total}</div><div class="rs-label">إجمالي السجلات</div></div>
      </div>
    </div>
    <div class="report-section">
      <h3>توزيع الحالات</h3>
      <table class="report-table"><thead><tr><th>الحالة</th><th>العدد</th><th>النسبة</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
    ${reportFooterHtml()}
  `);
}

/* ================= تقرير أداء (رصد) ================= */
async function generateGradingReport() {
  const filters = {
    branch: document.getElementById('rg_branch').value || undefined,
    term: document.getElementById('rg_term').value || undefined,
    week: document.getElementById('rg_week').value || undefined,
    subject: document.getElementById('rg_subject').value || undefined,
    grades: document.getElementById('rg_grades').value || undefined
  };

  let data;
  try { data = await mirqatApi('grading', 'getFilteredStats', filters); } catch (e) { alert('تعذّر إنشاء التقرير: ' + e.message); return; }

  const rows = data.byEvalType.map(t => `<tr><td>${t.label}</td><td>${t.count}</td></tr>`).join('') ||
    '<tr><td colspan="2" style="text-align:center;">لا يوجد بيانات</td></tr>';

  renderReport(`
    ${reportHeaderHtml('تقرير أداء الطلاب — الرصد')}
    <div class="report-meta">${filterSummaryLine(filters)}</div>
    <div class="report-section">
      <div class="report-stat-row">
        <div class="report-stat-box"><div class="rs-value">${data.total}</div><div class="rs-label">إجمالي سجلات الرصد</div></div>
        <div class="report-stat-box"><div class="rs-value">${data.avgPct}%</div><div class="rs-label">متوسط نسبة الأداء</div></div>
      </div>
    </div>
    <div class="report-section">
      <h3>توزيع نوع التقييم</h3>
      <table class="report-table"><thead><tr><th>النوع</th><th>العدد</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
    ${reportFooterHtml()}
  `);
}

/* ================= أجزاء مشتركة ================= */
function reportHeaderHtml(title) {
  const logo = document.getElementById('schoolLogo');
  const logoSrc = logo && logo.style.display !== 'none' ? logo.src : '';
  const schoolName = document.getElementById('schoolName').textContent;
  return `
    <div class="report-header">
      <div>
        <div class="rh-school">${schoolName}</div>
        <div class="report-title">${title}</div>
      </div>
      ${logoSrc ? `<img src="${logoSrc}" alt="">` : ''}
    </div>
    <div class="report-meta">تاريخ الإصدار: ${new Date().toLocaleDateString('ar-SA')} — أُنشئ بواسطة: ${user.name}</div>
  `;
}

function reportFooterHtml() {
  return `<div class="report-footer"><span>نظام مِرقاة الإداري</span><span>تقرير مُولَّد آليًا</span></div>`;
}

function filterSummaryLine(filters) {
  const parts = Object.entries(filters).filter(([, v]) => v).map(([k, v]) => v);
  return parts.length ? 'الفلاتر المطبّقة: ' + parts.join(' — ') : 'كل البيانات (بدون فلاتر)';
}

function renderReport(html) {
  document.getElementById('reportPreview').innerHTML = html;
  document.getElementById('reportPreviewWrap').style.display = 'block';
  document.getElementById('reportPreviewWrap').scrollIntoView({ behavior: 'smooth' });
}
