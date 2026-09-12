const user = mirqatInitShell('grading');
let allLists = {};
let evalTypes = [];
let mySubjects = [];
let currentSubject = null;
let currentSubTab = 'fromTask';
let selectedTeacher = null; // { id, name, subject, branch, stages, grades, sections }
let currentRoster = [];
let currentLogPage = 1;
let editTargetId = null;
let deleteTargetId = null;
let evalChartInstance = null;
let trendChartInstance = null;
let currentWeekInfo = null;

function splitList(v) { return (v || '').split(',').map(s => s.trim()).filter(Boolean); }

if (user) init();

async function init() {
  try {
    [allLists, evalTypes] = await Promise.all([
      mirqatApi('settings', 'getSettingsLists'),
      mirqatApi('settings', 'getEvalTypes')
    ]);
  } catch { allLists = {}; evalTypes = []; }

  try { currentWeekInfo = await mirqatApi('schedule', 'getCurrentTermInfo', {}); } catch { currentWeekInfo = null; }

  if (user.role === 'admin') {
    document.getElementById('adminPicker').style.display = 'flex';
    fillSelect('admin_branch', allLists.branches, 'اختر الفرع');
    document.getElementById('admin_branch').addEventListener('change', loadTeachersForBranch);
    document.getElementById('admin_teacher').addEventListener('change', () => {
      const opt = document.getElementById('admin_teacher').selectedOptions[0];
      if (opt && opt.value) selectTeacher(JSON.parse(opt.dataset.teacher));
    });
  } else {
    mySubjects = splitList(user.subject);
    renderSubjectTabs();
  }

  document.querySelectorAll('.sub-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSubTab = btn.dataset.sub;
      renderSubTabContent();
    });
  });

  document.getElementById('closeEditModal').addEventListener('click', () => { document.getElementById('editModal').hidden = true; });
  document.getElementById('cancelEditBtn').addEventListener('click', () => { document.getElementById('editModal').hidden = true; });
  document.getElementById('saveEditBtn').addEventListener('click', submitEdit);
  document.getElementById('closeConfirmModal').addEventListener('click', closeConfirmModal);
  document.getElementById('cancelConfirmBtn').addEventListener('click', closeConfirmModal);
  document.getElementById('confirmDeleteBtn').addEventListener('click', performDelete);

  document.getElementById('closeManualModal').addEventListener('click', () => { document.getElementById('manualModal').hidden = true; });
  document.getElementById('cancelManualBtn').addEventListener('click', () => { document.getElementById('manualModal').hidden = true; });
  document.getElementById('manualForm').addEventListener('submit', submitManualMeta);

  document.getElementById('closeParticipationModal').addEventListener('click', () => { document.getElementById('participationModal').hidden = true; });
  document.getElementById('cancelParticipationBtn').addEventListener('click', () => { document.getElementById('participationModal').hidden = true; });
  document.getElementById('participationForm').addEventListener('submit', submitParticipationMeta);

  document.querySelectorAll('#mainTabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#mainTabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('mainPanel-stats').hidden = btn.dataset.main !== 'stats';
      document.getElementById('mainPanel-grading').hidden = btn.dataset.main !== 'grading';
    });
  });

  // الإحصائيات العامة مقيّدة على الأدمن فقط
  if (user.role === 'admin') {
    loadStats();
    loadOverview();
    setupCustomFilters();
  } else {
    document.querySelector('#mainTabs .tab-btn[data-main="stats"]').style.display = 'none';
    document.getElementById('mainPanel-stats').hidden = true;
    document.querySelector('#mainTabs .tab-btn[data-main="grading"]').classList.add('active');
    document.getElementById('mainPanel-grading').hidden = false;
  }
}

/* ---------------- نظرة عامة على أداء الفروع ---------------- */
let branchAvgChartInstance = null;
let branchTotalChartInstance = null;
let branchTrendChartInstance = null;

async function loadOverview() {
  try {
    const data = await mirqatApi('grading', 'getOverview', {});
    if (!data.branches.length) return;

    const palette = ['#2F6B52', '#A9813F', '#3D6B7A', '#B03A2E', '#74796F'];

    document.getElementById('branchAvgCard').style.display = 'block';
    if (branchAvgChartInstance) branchAvgChartInstance.destroy();
    branchAvgChartInstance = new Chart(document.getElementById('branchAvgChart'), {
      type: 'bar',
      data: {
        labels: data.perBranch.map(b => b.branch),
        datasets: [{
          data: data.perBranch.map(b => b.avgPct),
          backgroundColor: data.perBranch.map((_, i) => palette[i % palette.length]),
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.raw + '%' } } },
        scales: { y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } }
      }
    });

    document.getElementById('branchTotalCard').style.display = 'block';
    if (branchTotalChartInstance) branchTotalChartInstance.destroy();
    branchTotalChartInstance = new Chart(document.getElementById('branchTotalChart'), {
      type: 'pie',
      data: {
        labels: data.perBranch.map(b => b.branch),
        datasets: [{ data: data.perBranch.map(b => b.total), backgroundColor: palette }]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });

    document.getElementById('branchTrendCard').style.display = 'block';
    if (branchTrendChartInstance) branchTrendChartInstance.destroy();
    const labels = data.trendByBranch[0]?.series.map(s => s.label) || [];
    branchTrendChartInstance = new Chart(document.getElementById('branchTrendChart'), {
      type: 'line',
      data: {
        labels,
        datasets: data.trendByBranch.map((b, i) => ({
          label: b.branch,
          data: b.series.map(s => s.count),
          borderColor: palette[i % palette.length],
          backgroundColor: palette[i % palette.length] + '22',
          fill: true,
          tension: 0.4,
          pointRadius: 3
        }))
      },
      options: { responsive: true, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
  } catch (e) { /* صامت — قسم ثانوي */ }
}

/* ---------------- إحصائيات مخصصة بفلتر ---------------- */
let customBarChartInstance = null;

function setupCustomFilters() {
  fillSelect('cf_branch', allLists.branches, 'كل الفروع');
  fillSelect('cf_term', allLists.terms, 'كل الترمات');
  fillSelect('cf_subject', allLists.subject, 'كل المواد');
  fillSelect('cf_grades', allLists.grades, 'كل الصفوف');

  document.getElementById('cf_term').addEventListener('change', async () => {
    const term = document.getElementById('cf_term').value;
    const weekSelect = document.getElementById('cf_week');
    if (!term) { weekSelect.innerHTML = '<option value="">كل الأسابيع</option>'; return; }
    weekSelect.innerHTML = '<option value="">جارٍ التحميل...</option>';
    const weeks = await mirqatGetWeeksForTerm(term);
    weekSelect.innerHTML = '<option value="">كل الأسابيع</option>' + weeks.map(w => `<option value="${w}">${w}</option>`).join('');
  });

  document.getElementById('applyCustomFilterBtn').addEventListener('click', applyCustomFilter);
}

async function applyCustomFilter() {
  const filters = {
    branch: document.getElementById('cf_branch').value || undefined,
    term: document.getElementById('cf_term').value || undefined,
    week: document.getElementById('cf_week').value || undefined,
    subject: document.getElementById('cf_subject').value || undefined,
    grades: document.getElementById('cf_grades').value || undefined
  };

  try {
    const result = await mirqatApi('grading', 'getFilteredStats', filters);

    document.getElementById('customStatsCards').style.display = 'grid';
    document.getElementById('customStatsCards').innerHTML = `
      <div class="card" data-tone="primary"><div class="card-value">${result.total}</div><div class="card-label">إجمالي سجلات الرصد</div></div>
      <div class="card" data-tone="gold"><div class="card-value">${result.avgPct}%</div><div class="card-label">متوسط نسبة الأداء</div></div>
    `;

    if (result.byEvalType.length) {
      document.getElementById('customBarCard').style.display = 'block';
      if (customBarChartInstance) customBarChartInstance.destroy();
      customBarChartInstance = new Chart(document.getElementById('customBarChart'), {
        type: 'bar',
        data: {
          labels: result.byEvalType.map(e => e.label),
          datasets: [{ data: result.byEvalType.map(e => e.count), backgroundColor: '#A9813F', borderRadius: 8 }]
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
      });
    } else {
      document.getElementById('customBarCard').style.display = 'none';
    }
  } catch (e) {
    alert('تعذّر تطبيق الفلتر: ' + e.message);
  }
}

/* ---------------- إحصائيات فورية (تظهر قبل اختيار أي معلم أو مادة) ---------------- */
async function loadStats() {
  try {
    const stats = await mirqatApi('grading', 'getStats', {});

    document.getElementById('statsCards').innerHTML = `
      <div class="card" data-tone="primary">
        <div class="card-value">${stats.totalThisWeek}</div>
        <div class="card-label">رصد هذا الأسبوع</div>
        ${mirqatTrendBadge(stats.totalThisWeek, stats.totalPreviousWeek)}
      </div>
      <div class="card" data-tone="gold">
        <div class="card-value">${stats.totalAllTime}</div>
        <div class="card-label">إجمالي كل الرصد</div>
      </div>
    `;

    if (stats.weeklyTrend && stats.weeklyTrend.length) {
      document.getElementById('trendChartCard').style.display = 'block';
      const trendCtx = document.getElementById('trendChart');
      if (trendChartInstance) trendChartInstance.destroy();
      trendChartInstance = new Chart(trendCtx, {
        type: 'line',
        data: {
          labels: stats.weeklyTrend.map(w => w.label),
          datasets: [{
            label: 'عدد الرصد',
            data: stats.weeklyTrend.map(w => w.count),
            borderColor: '#A9813F',
            backgroundColor: 'rgba(169,129,63,0.12)',
            fill: true,
            tension: 0.4,
            pointBackgroundColor: '#A9813F',
            pointRadius: 4
          }]
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
      });
    }

    if (stats.byEvalType && stats.byEvalType.length) {
      document.getElementById('evalChartCard').style.display = 'block';
      const ctx = document.getElementById('evalChart');
      if (evalChartInstance) evalChartInstance.destroy();
      evalChartInstance = new Chart(ctx, {
        type: 'polarArea',
        data: {
          labels: stats.byEvalType.map(e => e.label),
          datasets: [{
            data: stats.byEvalType.map(e => e.count),
            backgroundColor: ['#2F6B52', '#A9813F', '#3D6B7A', '#B03A2E', '#74796F', '#5C8A73']
          }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
      });
    }
  } catch (e) {
    document.getElementById('statsCards').innerHTML = `<p class="empty-state">تعذّر تحميل الإحصائيات: ${e.message}</p>`;
  }
}

function fillSelect(id, options = [], placeholder = null) {
  const el = document.getElementById(id);
  el.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : '') + (options || []).map(o => `<option value="${o}">${o}</option>`).join('');
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

/* ---------------- أدمن: اختيار الفرع ثم المعلم من قائمة حقيقية ---------------- */
async function loadTeachersForBranch() {
  const branch = document.getElementById('admin_branch').value;
  const teacherSelect = document.getElementById('admin_teacher');
  if (!branch) { teacherSelect.disabled = true; teacherSelect.innerHTML = '<option value="">اختر الفرع أولًا</option>'; return; }

  teacherSelect.disabled = false;
  teacherSelect.innerHTML = '<option value="">جارٍ التحميل...</option>';
  try {
    const res = await mirqatApi('employees', 'list', { filters: { branch, role: 'teacher' }, page: 1, pageSize: 100 });
    if (!res.rows.length) {
      teacherSelect.innerHTML = '<option value="">لا يوجد معلمون بهذا الفرع</option>';
      return;
    }
    teacherSelect.innerHTML = '<option value="">اختر المعلم</option>' +
      res.rows.map(t => `<option value="${t.id}" data-teacher='${JSON.stringify(t).replace(/'/g, "&apos;")}'>${t.name_ar}</option>`).join('');
  } catch (e) {
    teacherSelect.innerHTML = '<option value="">تعذّر التحميل</option>';
  }
}

function selectTeacher(teacher) {
  selectedTeacher = teacher;
  document.getElementById('adminSelectedTeacher').style.display = 'block';
  document.getElementById('adminSelectedTeacher').textContent = `تعرض الآن مواد: ${teacher.name_ar}`;
  mySubjects = splitList(teacher.subject);
  renderSubjectTabs();
}

/* ---------------- تبويبات المواد ---------------- */
function renderSubjectTabs() {
  const container = document.getElementById('subjectTabs');
  if (!mySubjects.length) {
    container.innerHTML = '<p class="empty-state">لا توجد مواد مسندة</p>';
    document.getElementById('subTabs').style.display = 'none';
    document.getElementById('subjectContent').innerHTML = '';
    return;
  }

  container.innerHTML = mySubjects.map((s, i) =>
    `<button class="tab-btn${i === 0 ? ' active' : ''}" data-subject="${s}">${s}</button>`
  ).join('');

  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSubject = btn.dataset.subject;
      renderSubTabContent();
    });
  });

  currentSubject = mySubjects[0];
  document.getElementById('subTabs').style.display = 'flex';
  renderSubTabContent();
}

/* ---------------- توجيه التبويب الفرعي ---------------- */
function renderSubTabContent() {
  const el = document.getElementById('subjectContent');
  if (!currentSubject) { el.innerHTML = ''; return; }

  if (currentSubTab === 'fromTask') renderFromTask(el);
  else if (currentSubTab === 'manual') renderManual(el);
  else if (currentSubTab === 'participation') renderParticipation(el);
  else if (currentSubTab === 'log') renderLog(el);
  else if (currentSubTab === 'finished') renderFinished(el);
}

function scopeFields() {
  const isAdmin = user.role === 'admin';
  return {
    branches: isAdmin ? allLists.branches : splitList(user.branch),
    stages: isAdmin ? allLists.stages : splitList(user.stages),
    grades: isAdmin ? allLists.grades : splitList(user.grades),
    sections: isAdmin ? allLists.sections : splitList(user.sections)
  };
}

/* ============ 1) رصد من تكليف ============ */
async function renderFromTask(el) {
  el.innerHTML = `<p class="loading-row">جارٍ تحميل التكاليف غير المرصودة...</p>`;
  try {
    const tasks = await mirqatApi('tasks', 'getPendingTasks', { filters: { subject: currentSubject } });
    if (!tasks.length) {
      el.innerHTML = `<p class="empty-state">لا يوجد تكاليف بانتظار الرصد لمادة ${currentSubject} هذا الأسبوع</p>`;
      return;
    }
    el.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>التكليف</th><th>النوع</th><th>الصف</th><th>الاستحقاق</th><th>الدرجة العظمى</th><th></th></tr></thead>
          <tbody>
            ${tasks.map(t => `
              <tr>
                <td data-label="التكليف">${t.task_name}</td>
                <td data-label="النوع">${t.eval_type || '—'}</td>
                <td data-label="الصف">${t.grades || '—'}</td>
                <td data-label="الاستحقاق">${t.due_date || '—'}</td>
                <td data-label="الدرجة العظمى">${t.max_score ?? '—'}</td>
                <td><button class="btn btn-primary btn-sm" onclick='openTaskRoster(${JSON.stringify(t).replace(/'/g, "&apos;")})'>رصد الآن</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div id="taskRosterArea" style="margin-top:18px;"></div>
    `;
  } catch (e) {
    el.innerHTML = `<p class="empty-state">تعذّر التحميل: ${e.message}</p>`;
  }
}

async function openTaskRoster(task) {
  const area = document.getElementById('taskRosterArea');
  area.innerHTML = '<p class="loading-row">جارٍ تحميل الطلاب...</p>';

  try {
    currentRoster = await mirqatApi('grading', 'getRoster', {
      filters: { branch: task.branch, stages: task.stages, grades: task.grades, sections: task.sections }
    }, { cache: false });
  } catch (e) {
    area.innerHTML = `<p class="empty-state">تعذّر تحميل الطلاب: ${e.message}</p>`;
    return;
  }

  area.innerHTML = `
    <h3 style="font-size:14px; color:var(--primary-dark);">رصد: ${task.task_name} (من ${task.max_score ?? 0})</h3>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>الطالب</th><th>الدرجة</th></tr></thead>
        <tbody>
          ${currentRoster.map(s => `
            <tr data-student-id="${s.id}">
              <td data-label="الطالب">${s.name_ar}</td>
              <td data-label="الدرجة"><input type="number" class="score-input" min="0" max="${task.max_score || ''}" style="width:100px"></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <button class="btn btn-primary" id="saveTaskRosterBtn" style="margin-top:12px;">حفظ الدرجات</button>
    <p class="form-error" id="taskRosterError"></p>
  `;

  document.getElementById('saveTaskRosterBtn').addEventListener('click', async () => {
    const errorEl = document.getElementById('taskRosterError');
    const rows = Array.from(document.querySelectorAll('#taskRosterArea tr[data-student-id]'));
    const records = rows.map(row => {
      const scoreVal = row.querySelector('.score-input').value;
      if (scoreVal === '') return null;
      const studentId = row.dataset.studentId;
      const student = currentRoster.find(s => s.id === studentId);
      return {
        student_id: studentId, student_name: student?.name_ar,
        branch: task.branch, stages: task.stages, grades: task.grades, sections: task.sections,
        subject: currentSubject, term: task.term, week: currentWeekInfo?.week || null, eval_type: task.eval_type, task_name: task.task_name,
        earned_score: Number(scoreVal), max_score: Number(task.max_score)
      };
    }).filter(Boolean);

    if (!records.length) { errorEl.textContent = 'أدخل درجة طالب واحد على الأقل'; return; }

    try {
      await mirqatApi('grading', 'saveRoster', { records }, { cache: false });
      await mirqatApi('tasks', 'saveTask', { id: task.id, data: { is_graded: true, graded_at: new Date().toISOString() } }, { cache: false });
      area.innerHTML = '<p class="overview-hint">تم الحفظ ✓</p>';
      renderFromTask(document.getElementById('subjectContent'));
    } catch (e) {
      errorEl.textContent = e.message;
    }
  });
}

/* ============ 2) رصد يدوي ============ */
function renderManual(el) {
  el.innerHTML = `
    <button class="btn btn-primary" id="openManualBtn">+ إضافة رصد جديد</button>
    <p class="overview-hint" style="margin-top:14px;">الأسبوع الدراسي يُسجَّل تلقائيًا من التقويم: ${currentWeekInfo ? currentWeekInfo.term + ' — ' + currentWeekInfo.week : 'لا يوجد أسبوع مطابق لتاريخ اليوم'}</p>
    <div id="manualRosterArea" style="margin-top:18px;"></div>
  `;

  document.getElementById('openManualBtn').addEventListener('click', () => {
    const sf = scopeFields();
    fillSelect('mm_branch', sf.branches);
    fillSelect('mm_stages', sf.stages);
    fillSelect('mm_grades', sf.grades);
    fillSelect('mm_sections', sf.sections);
    mirqatLockSingleValueFields(['mm_branch', 'mm_stages', 'mm_grades', 'mm_sections']);
    fillSelect('mm_eval_type', evalTypes);
    document.getElementById('mm_task_name').value = '';
    document.getElementById('mm_max_score').value = '';
    document.getElementById('manualFormError').textContent = '';
    document.getElementById('mm_autoDateBanner').textContent = currentWeekInfo
      ? `التاريخ محدَّد تلقائيًا: ${currentWeekInfo.term} — ${currentWeekInfo.week}`
      : 'لا يوجد أسبوع دراسي مطابق لتاريخ اليوم — راجع الأدمن';
    document.getElementById('manualModal').hidden = false;
  });
}

async function submitManualMeta(e) {
  e.preventDefault();
  const errorEl = document.getElementById('manualFormError');
  errorEl.textContent = '';

  if (!currentWeekInfo) { errorEl.textContent = 'لا يوجد أسبوع دراسي حالي — راجع الأدمن'; return; }

  const meta = {
    branch: document.getElementById('mm_branch').value,
    stages: document.getElementById('mm_stages').value,
    grades: document.getElementById('mm_grades').value,
    sections: document.getElementById('mm_sections').value,
    term: currentWeekInfo.term,
    eval_type: document.getElementById('mm_eval_type').value,
    task_name: document.getElementById('mm_task_name').value.trim(),
    max_score: document.getElementById('mm_max_score').value
  };
  if (!meta.grades || !meta.eval_type || !meta.task_name || !meta.max_score) {
    errorEl.textContent = 'عبّي كل الحقول المطلوبة';
    return;
  }

  let roster;
  try {
    roster = await mirqatApi('grading', 'getRoster', { filters: meta }, { cache: false });
  } catch (err) { errorEl.textContent = 'تعذّر تحميل الطلاب: ' + err.message; return; }

  document.getElementById('manualModal').hidden = true;
  currentRoster = roster;

  const area = document.getElementById('manualRosterArea');
  area.innerHTML = `
    <h3 style="font-size:14px; color:var(--primary-dark);">${meta.task_name} — من ${meta.max_score} (${meta.eval_type})</h3>
    <div class="table-wrap">
      <table class="data-table"><thead><tr><th>الطالب</th><th>الدرجة</th></tr></thead>
        <tbody>${roster.map(s => `
          <tr data-student-id="${s.id}">
            <td data-label="الطالب">${s.name_ar}</td>
            <td data-label="الدرجة"><input type="number" class="score-input" min="0" max="${meta.max_score}" style="width:100px"></td>
          </tr>`).join('') || '<tr><td colspan="2" class="empty-state">لا يوجد طلاب</td></tr>'}
        </tbody>
      </table>
    </div>
    <button class="btn btn-primary" id="saveManualBtn" style="margin-top:12px;">حفظ الدرجات</button>
    <p class="form-error" id="manualRosterError"></p>
  `;

  document.getElementById('saveManualBtn').addEventListener('click', async () => {
    const rErrorEl = document.getElementById('manualRosterError');
    const rows = Array.from(document.querySelectorAll('#manualRosterArea tr[data-student-id]'));
    const records = rows.map(row => {
      const val = row.querySelector('.score-input').value;
      if (val === '') return null;
      const studentId = row.dataset.studentId;
      const student = currentRoster.find(s => s.id === studentId);
      return {
        student_id: studentId, student_name: student?.name_ar,
        branch: meta.branch, stages: meta.stages, grades: meta.grades, sections: meta.sections,
        subject: currentSubject, term: meta.term, week: currentWeekInfo?.week || null,
        eval_type: meta.eval_type, task_name: meta.task_name,
        earned_score: Number(val), max_score: Number(meta.max_score)
      };
    }).filter(Boolean);

    if (!records.length) { rErrorEl.textContent = 'أدخل درجة طالب واحد على الأقل'; return; }

    try {
      await mirqatApi('grading', 'saveRoster', { records }, { cache: false });
      area.innerHTML = '<p class="overview-hint">تم الحفظ ✓</p>';
      if (user.role === 'admin') loadStats();
    } catch (err) { rErrorEl.textContent = err.message; }
  });
}

/* ============ 3) مشاركة وتفاعل فوري ============ */
function renderParticipation(el) {
  el.innerHTML = `
    <button class="btn btn-primary" id="openParticipationBtn">+ رصد مشاركة الآن</button>
    <div id="participationRosterArea" style="margin-top:18px;"></div>
  `;

  document.getElementById('openParticipationBtn').addEventListener('click', () => {
    const sf = scopeFields();
    fillSelect('pm_branch', sf.branches);
    fillSelect('pm_stages', sf.stages);
    fillSelect('pm_grades', sf.grades);
    fillSelect('pm_sections', sf.sections);
    mirqatLockSingleValueFields(['pm_branch', 'pm_stages', 'pm_grades', 'pm_sections']);
    document.getElementById('pm_name').value = '';
    document.getElementById('pm_details').value = '';
    document.getElementById('pm_max').value = 5;
    document.getElementById('participationFormError').textContent = '';
    document.getElementById('pm_autoDateBanner').textContent = currentWeekInfo
      ? `تاريخ الرصد = اليوم تلقائيًا: ${currentWeekInfo.term} — ${currentWeekInfo.week}`
      : 'لا يوجد أسبوع دراسي مطابق لتاريخ اليوم — راجع الأدمن';
    document.getElementById('participationModal').hidden = false;
  });
}

async function submitParticipationMeta(e) {
  e.preventDefault();
  const errorEl = document.getElementById('participationFormError');
  errorEl.textContent = '';

  if (!currentWeekInfo) { errorEl.textContent = 'لا يوجد أسبوع دراسي حالي — راجع الأدمن'; return; }

  const meta = {
    branch: document.getElementById('pm_branch').value,
    stages: document.getElementById('pm_stages').value,
    grades: document.getElementById('pm_grades').value,
    sections: document.getElementById('pm_sections').value,
    term: currentWeekInfo.term,
    name: document.getElementById('pm_name').value.trim(),
    details: document.getElementById('pm_details').value.trim(),
    max: document.getElementById('pm_max').value
  };
  if (!meta.grades || !meta.name || !meta.max) { errorEl.textContent = 'عبّي كل الحقول المطلوبة'; return; }

  let roster;
  try {
    roster = await mirqatApi('grading', 'getRoster', { filters: meta }, { cache: false });
  } catch (err) { errorEl.textContent = 'تعذّر تحميل الطلاب: ' + err.message; return; }

  document.getElementById('participationModal').hidden = true;
  currentRoster = roster;

  const area = document.getElementById('participationRosterArea');
  area.innerHTML = `
    <h3 style="font-size:14px; color:var(--primary-dark);">${meta.name} — من ${meta.max}</h3>
    <div class="table-wrap">
      <table class="data-table"><thead><tr><th>الطالب</th><th>الدرجة</th></tr></thead>
        <tbody>${roster.map(s => `
          <tr data-student-id="${s.id}">
            <td data-label="الطالب">${s.name_ar}</td>
            <td data-label="الدرجة"><input type="number" class="score-input" min="0" max="${meta.max}" style="width:100px"></td>
          </tr>`).join('') || '<tr><td colspan="2" class="empty-state">لا يوجد طلاب</td></tr>'}
        </tbody>
      </table>
    </div>
    <button class="btn btn-primary" id="saveParticipationBtn" style="margin-top:12px;">حفظ المشاركة (تاريخ اليوم)</button>
    <p class="form-error" id="participationRosterError"></p>
  `;

  document.getElementById('saveParticipationBtn').addEventListener('click', async () => {
    const rErrorEl = document.getElementById('participationRosterError');
    const rows = Array.from(document.querySelectorAll('#participationRosterArea tr[data-student-id]'));
    const records = rows.map(row => {
      const val = row.querySelector('.score-input').value;
      if (val === '') return null;
      const studentId = row.dataset.studentId;
      const student = currentRoster.find(s => s.id === studentId);
      return {
        student_id: studentId, student_name: student?.name_ar,
        branch: meta.branch, stages: meta.stages, grades: meta.grades, sections: meta.sections,
        subject: currentSubject, term: meta.term, week: currentWeekInfo?.week || null,
        eval_type: 'المشاركة و تفاعل',
        task_name: meta.name + (meta.details ? ' — ' + meta.details : ''),
        earned_score: Number(val), max_score: Number(meta.max),
        recorded_date: new Date().toISOString().slice(0, 10)
      };
    }).filter(Boolean);

    if (!records.length) { rErrorEl.textContent = 'أدخل درجة طالب واحد على الأقل'; return; }

    try {
      await mirqatApi('grading', 'saveRoster', { records }, { cache: false });
      area.innerHTML = '<p class="overview-hint">تم الحفظ ✓</p>';
      if (user.role === 'admin') loadStats();
    } catch (err) { rErrorEl.textContent = err.message; }
  });
}

/* ============ 4) سجل الرصد ============ */
function renderLog(el) {
  el.innerHTML = `
    <div class="toolbar">
      <select id="l_term"><option value="">اختر الترم</option>${(allLists.terms || []).map(t => `<option value="${t}">${t}</option>`).join('')}</select>
      <select id="l_week"><option value="">اختر الترم أولًا</option></select>
      <input type="date" id="l_date" title="تاريخ الرصد">
      <button class="btn btn-outline" id="l_filterBtn">بحث</button>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>الطالب</th><th>النوع</th><th>التكليف</th><th>الدرجة</th><th>التاريخ</th><th></th></tr></thead>
        <tbody id="l_body"><tr><td colspan="6" class="empty-state">اختر الترم والأسبوع ثم اضغط بحث</td></tr></tbody>
      </table>
    </div>
    <div class="pagination-bar" id="l_pagination"></div>
  `;

  document.getElementById('l_term').addEventListener('change', async () => {
    const term = document.getElementById('l_term').value;
    const weekSelect = document.getElementById('l_week');
    weekSelect.innerHTML = '<option value="">جارٍ التحميل...</option>';
    const weeks = term ? await mirqatGetWeeksForTerm(term) : [];
    weekSelect.innerHTML = '<option value="">اختر الأسبوع</option>' + weeks.map(w => `<option value="${w}">${w}</option>`).join('');
  });

  document.getElementById('l_filterBtn').addEventListener('click', () => loadLog(1));
}

async function loadLog(page = currentLogPage) {
  currentLogPage = page;
  const term = document.getElementById('l_term').value;
  const week = document.getElementById('l_week').value;
  const date = document.getElementById('l_date').value;
  const body = document.getElementById('l_body');

  if (!term || !week) { body.innerHTML = '<tr><td colspan="6" class="empty-state">اختر الترم والأسبوع أولًا</td></tr>'; return; }

  body.innerHTML = '<tr><td colspan="6" class="loading-row">جارٍ التحميل...</td></tr>';
  const filters = { subject: currentSubject, term, week };
  if (date) filters.recordedDate = date;
  if (user.role === 'admin' && selectedTeacher) filters.employeeId = selectedTeacher.id;

  try {
    const result = await mirqatApi('grading', 'getGradingRecords', { filters, page, pageSize: 25 });
    if (!result.rows.length) {
      body.innerHTML = '<tr><td colspan="6" class="empty-state">لا يوجد سجلات مطابقة</td></tr>';
    } else {
      body.innerHTML = result.rows.map(r => `
        <tr>
          <td data-label="الطالب">${r.student_name || r.student_id}</td>
          <td data-label="النوع">${r.eval_type || '—'}</td>
          <td data-label="التكليف">${r.task_name || '—'}</td>
          <td data-label="الدرجة">${r.earned_score ?? '—'} / ${r.max_score ?? '—'}</td>
          <td data-label="التاريخ">${r.recorded_date || '—'}</td>
          <td>
            <div class="row-actions">
              <button class="btn btn-outline btn-sm" ${r.can_edit ? '' : 'disabled title="انتهت مهلة التعديل (6 أيام)"'} onclick="openEditScore('${r.id}', ${r.earned_score})">تعديل</button>
              <button class="btn btn-danger btn-sm" ${r.can_delete ? '' : 'disabled title="انتهت مهلة الحذف (6 ساعات)"'} onclick="askDelete('${r.id}')">حذف</button>
            </div>
          </td>
        </tr>
      `).join('');
    }
    mirqatRenderPagination('l_pagination', result, (p) => loadLog(p));
  } catch (e) {
    body.innerHTML = `<tr><td colspan="6" class="empty-state">تعذّر التحميل: ${e.message}</td></tr>`;
  }
}

function openEditScore(id, currentScore) {
  editTargetId = id;
  document.getElementById('ef_score').value = currentScore ?? '';
  document.getElementById('editFormError').textContent = '';
  document.getElementById('editModal').hidden = false;
}

async function submitEdit() {
  const errorEl = document.getElementById('editFormError');
  const val = document.getElementById('ef_score').value;
  if (val === '') { errorEl.textContent = 'أدخل الدرجة'; return; }

  try {
    const result = await mirqatApi('grading', 'updateRosterRecords', {
      updates: [{ id: editTargetId, data: { earned_score: Number(val) } }]
    }, { cache: false });
    if (result.failed && result.failed.length) { errorEl.textContent = result.failed[0].reason; return; }
    document.getElementById('editModal').hidden = true;
    loadLog();
  } catch (e) { errorEl.textContent = e.message; }
}

function askDelete(id) { deleteTargetId = id; document.getElementById('confirmModal').hidden = false; }
function closeConfirmModal() { document.getElementById('confirmModal').hidden = true; deleteTargetId = null; }

async function performDelete() {
  if (!deleteTargetId) return;
  try {
    const result = await mirqatApi('grading', 'deleteRosterRecords', { ids: [deleteTargetId] }, { cache: false });
    closeConfirmModal();
    if (result.note) alert(result.note);
    loadLog();
  } catch (e) { alert('تعذّر الحذف: ' + e.message); }
}

/* ============ 5) آخر أسبوع منتهٍ ============ */
async function renderFinished(el) {
  el.innerHTML = '<p class="loading-row">جارٍ التحميل...</p>';
  try {
    const params = { subject: currentSubject };
    if (user.role === 'admin' && selectedTeacher) params.employeeId = selectedTeacher.id;
    const result = await mirqatApi('grading', 'getFinishedWeekRecords', params);

    if (!result.week) {
      el.innerHTML = '<p class="empty-state">لا يوجد أسبوع دراسي منتهٍ في التقويم بعد</p>';
      return;
    }
    el.innerHTML = `
      <p class="overview-hint">آخر أسبوع منتهٍ: ${result.week.term} — ${result.week.week} (انتهى ${result.week.week_end_date})</p>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>الطالب</th><th>النوع</th><th>التكليف</th><th>الدرجة</th></tr></thead>
          <tbody>
            ${result.records.length ? result.records.map(r => `
              <tr>
                <td data-label="الطالب">${r.student_name || r.student_id}</td>
                <td data-label="النوع">${r.eval_type || '—'}</td>
                <td data-label="التكليف">${r.task_name || '—'}</td>
                <td data-label="الدرجة">${r.earned_score ?? '—'} / ${r.max_score ?? '—'}</td>
              </tr>
            `).join('') : '<tr><td colspan="4" class="empty-state">لا يوجد سجلات لهذا الأسبوع</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    el.innerHTML = `<p class="empty-state">تعذّر التحميل: ${e.message}</p>`;
  }
}
