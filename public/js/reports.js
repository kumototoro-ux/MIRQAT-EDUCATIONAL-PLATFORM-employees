const user = mirqatInitShell('reports');
let allLists = {};
let currentStudentId = null;
let currentGrades = [];

if (user) init();

async function init() {
  try {
    allLists = await mirqatApi('settings', 'getSettingsLists');
  } catch {
    allLists = {};
  }

  document.getElementById('termSelect').innerHTML =
    (allLists.terms || []).map(t => `<option value="${t}">${t}</option>`).join('');

  document.getElementById('studentSearch').addEventListener('input', debounce(searchStudents, 300));
  document.getElementById('termSelect').addEventListener('change', () => {
    if (currentStudentId) loadReportCard(currentStudentId);
  });
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function searchStudents() {
  const q = document.getElementById('studentSearch').value.trim();
  const results = document.getElementById('searchResults');
  if (q.length < 2) { results.innerHTML = ''; return; }

  try {
    const students = await mirqatApi('reports', 'searchStudentsForReport', { query: q });
    results.innerHTML = students.map(s =>
      `<span class="chip" style="cursor:pointer" onclick="selectStudent('${s.id}', '${s.name_ar.replace(/'/g, "\\'")}')">${s.name_ar}</span>`
    ).join('') || '<span class="chip">لا نتائج</span>';
  } catch { /* silent */ }
}

function selectStudent(id, name) {
  currentStudentId = id;
  document.getElementById('studentSearch').value = name;
  document.getElementById('searchResults').innerHTML = '';
  document.getElementById('comparisonResult').style.display = 'none';
  loadReportCard(id);
}

async function loadReportCard(studentId) {
  const term = document.getElementById('termSelect').value || undefined;

  try {
    const data = await mirqatApi('reports', 'getStudentReportCard', { studentId, term });
    currentGrades = data.grades;

    document.getElementById('rc_name').textContent = data.student.name_ar;
    document.getElementById('rc_meta').textContent =
      `${data.student.branch || ''} · ${data.student.stages || ''} · ${data.student.grades || ''} · ${data.student.sections || ''}`;

    renderGrades(data.grades);
    renderBehavior(data.behavior);

    document.getElementById('reportSection').style.display = 'block';
  } catch (e) {
    alert('تعذّر تحميل التقرير: ' + e.message);
  }
}

function renderGrades(grades) {
  const body = document.getElementById('gradesTableBody');
  if (!grades.length) {
    body.innerHTML = '<tr><td colspan="4" class="empty-state">لا يوجد درجات مسجّلة لهذا الترم</td></tr>';
    return;
  }
  body.innerHTML = grades.map(g => `
    <tr>
      <td>${g.subject}</td>
      <td>${g.total}</td>
      <td>${g.is_visible ? 'نعم' : 'لا'}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn-outline btn-sm" onclick="toggleVisibility(${g.id}, ${!g.is_visible})">${g.is_visible ? 'إخفاء' : 'إظهار'}</button>
          <button class="btn btn-outline btn-sm" onclick="compareSubject('${g.subject}')">مقارنة الشعبة</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderBehavior(behavior) {
  const body = document.getElementById('behaviorTableBody');
  if (!behavior.length) {
    body.innerHTML = '<tr><td colspan="4" class="empty-state">لا يوجد سجلات سلوك</td></tr>';
    return;
  }
  body.innerHTML = behavior.slice(0, 10).map(b => `
    <tr>
      <td>${b.created_at ? new Date(b.created_at).toLocaleDateString('ar-SA') : '—'}</td>
      <td>${b.status || '—'}</td>
      <td>${b.score ?? '—'}</td>
      <td>${b.note || '—'}</td>
    </tr>
  `).join('');
}

async function toggleVisibility(id, visible) {
  try {
    await mirqatApi('reports', 'toggleGradeVisibility', { id, visible });
    loadReportCard(currentStudentId);
  } catch (e) {
    alert('تعذّر تغيير حالة الظهور: ' + e.message);
  }
}

async function compareSubject(subject) {
  const term = document.getElementById('termSelect').value;
  if (!term) { alert('حدد الترم أولًا'); return; }

  const panel = document.getElementById('comparisonResult');
  panel.style.display = 'block';
  panel.innerHTML = '<div class="loading-row">جارٍ المقارنة...</div>';

  try {
    const data = await mirqatApi('reports', 'getClassComparison', { studentId: currentStudentId, term, subject });
    const studentTotal = data.student[0]?.total ?? '—';
    panel.innerHTML = `
      <table class="data-table">
        <thead><tr><th>المادة</th><th>درجة الطالب</th><th>متوسط الشعبة</th><th>عدد الطلاب</th></tr></thead>
        <tbody>
          <tr>
            <td>${subject}</td>
            <td>${studentTotal}</td>
            <td>${data.classAverage.total ?? '—'}</td>
            <td>${data.classSize}</td>
          </tr>
        </tbody>
      </table>
    `;
  } catch (e) {
    panel.innerHTML = `<p class="form-error">تعذّر إجراء المقارنة: ${e.message}</p>`;
  }
}
