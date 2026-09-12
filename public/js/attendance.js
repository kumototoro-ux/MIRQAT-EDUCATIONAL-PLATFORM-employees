const user = mirqatInitShell('attendance');
let allLists = {};
let currentRoster = [];
let deleteTargetId = null;
let editTargetId = null;
let statusChartInstance = null;
let statusBarChartInstance = null;
let trendChartInstance = null;
let currentLogPage = 1;
let manualDateAllowed = false;

if (user) init();

function splitOwn(value) {
  return (value || '').split(',').map(v => v.trim()).filter(Boolean);
}

async function init() {
  try {
    allLists = await mirqatApi('settings', 'getSettingsLists');
  } catch { allLists = {}; }

  let visSettings = {};
  try { visSettings = await mirqatApi('settings', 'getVisibilitySettings'); } catch { /* ignore */ }
  manualDateAllowed = (visSettings.manual_date_entry || []).includes('نعم');

  const isAdmin = user.role === 'admin';
  fillSelect('f_branch', isAdmin ? allLists.branches : splitOwn(user.branch), isAdmin ? 'الفرع' : null);
  fillSelect('f_stages', isAdmin ? allLists.stages : splitOwn(user.stages), isAdmin ? 'المرحلة' : null);
  fillSelect('f_grades', isAdmin ? allLists.grades : splitOwn(user.grades), isAdmin ? 'الصف' : null);
  fillSelect('f_sections', isAdmin ? allLists.sections : splitOwn(user.sections), isAdmin ? 'الشعبة' : null);
  fillSelect('f_subject', isAdmin ? allLists.subject : splitOwn(user.subject), isAdmin ? 'المادة' : null);
  fillSelect('f_term', allLists.terms, 'الترم');

  if (isAdmin || manualDateAllowed) {
    await populateManualWeekSelect();
  } else {
    await loadCurrentWeek();
  }

  setupTabs();

  document.getElementById('openRecordBtn').addEventListener('click', () => {
    document.getElementById('recordFormError').textContent = '';
    document.getElementById('recordModal').hidden = false;
  });
  document.getElementById('closeRecordModal').addEventListener('click', () => { document.getElementById('recordModal').hidden = true; });
  document.getElementById('cancelRecordBtn').addEventListener('click', () => { document.getElementById('recordModal').hidden = true; });
  document.getElementById('recordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ok = await loadRoster();
    if (ok) document.getElementById('recordModal').hidden = true;
  });
  document.getElementById('saveRosterBtn').addEventListener('click', saveRoster);

  document.getElementById('filterLogBtn').addEventListener('click', () => loadLog(1));
  document.getElementById('closeEditModal').addEventListener('click', closeEditModal);
  document.getElementById('cancelEditBtn').addEventListener('click', closeEditModal);
  document.getElementById('saveEditBtn').addEventListener('click', submitEdit);
  document.getElementById('closeConfirmModal').addEventListener('click', closeConfirmModal);
  document.getElementById('cancelConfirmBtn').addEventListener('click', closeConfirmModal);
  document.getElementById('confirmDeleteBtn').addEventListener('click', performDelete);

  document.querySelectorAll('#mainTabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#mainTabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('mainPanel-stats').hidden = btn.dataset.main !== 'stats';
      document.getElementById('mainPanel-record').hidden = btn.dataset.main !== 'record';
    });
  });

  fillSelect('ef_status', allLists.attendance_statuses);

  if (isAdmin) {
    document.getElementById('log_employee').style.display = 'inline-block';
    try {
      const emps = await mirqatApi('employees', 'list', { filters: {}, page: 1, pageSize: 100 });
      emps.rows.forEach(e => {
        document.getElementById('log_employee').innerHTML += `<option value="${e.id}">${e.name_ar}</option>`;
      });
    } catch { /* ignore */ }
  }

  populateWeekOptions();
  loadStats();
}

function fillSelect(id, options = [], placeholder = null) {
  const el = document.getElementById(id);
  el.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : '') + (options || []).map(o => `<option value="${o}">${o}</option>`).join('');
}

function populateWeekOptions() {
  // الأسبوع في سجل التحضير يعتمد على الترم المختار — نبنيه ديناميكيًا من التقويم الفعلي
  fillSelect('log_term', allLists.terms, 'اختر الترم');
  document.getElementById('log_term').addEventListener('change', async () => {
    const term = document.getElementById('log_term').value;
    const weekSelect = document.getElementById('log_week');
    weekSelect.innerHTML = '<option value="">جارٍ التحميل...</option>';
    const weeks = term ? await mirqatGetWeeksForTerm(term) : [];
    weekSelect.innerHTML = '<option value="">اختر الأسبوع</option>' + weeks.map(w => `<option value="${w}">${w}</option>`).join('');
  });

  const daySelect = document.getElementById('log_day');
  daySelect.innerHTML = '<option value="">اختر اليوم</option>' +
    ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'].map(d => `<option value="${d}">${d}</option>`).join('');
}

async function loadCurrentWeek() {
  const hint = document.getElementById('calendarHint');
  const weekSelect = document.getElementById('f_week');
  try {
    const info = await mirqatApi('schedule', 'getCurrentTermInfo', {});
    if (info) {
      weekSelect.innerHTML = `<option value="${info.week}">${info.week}</option>`;
      document.getElementById('f_term').value = info.term || '';
      hint.style.display = 'block';
      hint.textContent = `الأسبوع محدَّد تلقائيًا من التقويم الدراسي: ${info.term || ''} - ${info.week || ''}`;
    } else {
      weekSelect.innerHTML = '<option value="">لا يوجد أسبوع</option>';
      hint.style.display = 'block';
      hint.textContent = 'لا يوجد أسبوع دراسي مطابق لتاريخ اليوم في التقويم — راجع الأدمن لإضافته، أو فعّل التاريخ اليدوي من الإعدادات.';
    }
  } catch { /* ignore */ }
}

/** للأدمن/عند تفعيل التاريخ اليدوي: قائمة أسابيع حقيقية من التقويم (لا كتابة حرة أبدًا) */
async function populateManualWeekSelect() {
  const weekSelect = document.getElementById('f_week');
  weekSelect.disabled = false;

  const refresh = async () => {
    const term = document.getElementById('f_term').value;
    weekSelect.innerHTML = '<option value="">جارٍ التحميل...</option>';
    const weeks = term ? await mirqatGetWeeksForTerm(term) : [];
    weekSelect.innerHTML = weeks.length
      ? weeks.map(w => `<option value="${w}">${w}</option>`).join('')
      : '<option value="">لا يوجد أسابيع لهذا الترم في التقويم</option>';
  };

  document.getElementById('f_term').addEventListener('change', refresh);
  await refresh();
}

function setupTabs() {
  document.querySelectorAll('#mainPanel-record .tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#mainPanel-record .tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ['record', 'log', 'finished'].forEach(t => {
        document.getElementById('panel-' + t).hidden = t !== btn.dataset.tab;
      });
      if (btn.dataset.tab === 'finished') loadFinished();
    });
  });
}

/* ---------------- إحصائيات ---------------- */
async function loadStats() {
  try {
    const stats = await mirqatApi('attendance', 'getStats', {});
    const counts = {};
    stats.byStatus.forEach(s => { counts[s.label] = s.count; });

    document.getElementById('statsCards').innerHTML = `
      <div class="card" data-tone="primary">
        <div class="card-value">${stats.total}</div>
        <div class="card-label">سجلات هذا الأسبوع</div>
        ${mirqatTrendBadge(stats.total, stats.totalPreviousWeek)}
      </div>
      <div class="card" data-tone="info">
        <div class="card-value">${counts['حاضر'] || 0}</div>
        <div class="card-label">حاضر</div>
      </div>
      <div class="card" data-tone="warn">
        <div class="card-value">${counts['غائب'] || 0}</div>
        <div class="card-label">غائب</div>
      </div>
    `;

    if (stats.total > 0) {
      document.getElementById('statusChartCard').style.display = 'block';
      const ctx = document.getElementById('statusChart');
      if (statusChartInstance) statusChartInstance.destroy();
      statusChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: stats.byStatus.map(s => s.label),
          datasets: [{ data: stats.byStatus.map(s => s.count), backgroundColor: ['#2F6B52', '#B03A2E', '#A9813F', '#3D6B7A'], borderWidth: 0 }]
        },
        plugins: [mirqatDonutCenterPlugin(String(stats.total))],
        options: { responsive: true, cutout: '72%', plugins: { legend: { position: 'bottom' } } }
      });

      document.getElementById('statusBarChartCard').style.display = 'block';
      const barCtx = document.getElementById('statusBarChart');
      if (statusBarChartInstance) statusBarChartInstance.destroy();
      statusBarChartInstance = new Chart(barCtx, {
        type: 'bar',
        data: {
          labels: stats.byStatus.map(s => s.label),
          datasets: [{ data: stats.byStatus.map(s => s.count), backgroundColor: '#2F6B52', borderRadius: 8, barThickness: 34 }]
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
      });
    }

    if (stats.weeklyTrend && stats.weeklyTrend.length) {
      document.getElementById('trendChartCard').style.display = 'block';
      const trendCtx = document.getElementById('trendChart');
      if (trendChartInstance) trendChartInstance.destroy();
      trendChartInstance = new Chart(trendCtx, {
        type: 'line',
        data: {
          labels: stats.weeklyTrend.map(w => w.label),
          datasets: [{
            label: 'عدد السجلات',
            data: stats.weeklyTrend.map(w => w.count),
            borderColor: '#2F6B52',
            backgroundColor: 'rgba(47,107,82,0.12)',
            fill: true,
            tension: 0.4,
            pointBackgroundColor: '#2F6B52',
            pointRadius: 4
          }]
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
      });
    }
  } catch (e) {
    document.getElementById('statsCards').innerHTML = `<p class="empty-state">تعذّر تحميل الإحصائيات: ${e.message}</p>`;
  }
}

/* ---------------- تسجيل تحضير ---------------- */
async function loadRoster() {
  const f = getRecordFilters();
  const errorEl = document.getElementById('recordFormError');
  errorEl.textContent = '';
  if (!f.branch || !f.grades) { errorEl.textContent = 'اختر الفرع والصف على الأقل'; return false; }

  try {
    currentRoster = await mirqatApi('attendance', 'getRoster', {
      filters: { branch: f.branch, stages: f.stages || undefined, grades: f.grades, sections: f.sections || undefined }
    }, { cache: false });
  } catch (e) {
    errorEl.textContent = 'تعذّر تحميل الطلاب: ' + e.message;
    return false;
  }

  const statuses = allLists.attendance_statuses || ['حاضر', 'غائب', 'متأخر', 'مستأذن'];
  const body = document.getElementById('rosterTableBody');
  const quickBar = document.getElementById('quickMarkBar');

  quickBar.innerHTML = `
    <span class="qm-label">تحديد الكل:</span>
    <div class="status-chip-group">
      ${statuses.map(st => `<button type="button" class="status-chip" data-status="${st}" onclick="markAll('${st}')">${st}</button>`).join('')}
    </div>
  `;

  if (!currentRoster.length) {
    body.innerHTML = '<tr><td colspan="2" class="empty-state">لا يوجد طلاب في هذه الشعبة ضمن نطاقك</td></tr>';
  } else {
    body.innerHTML = currentRoster.map(s => `
      <tr data-student-id="${s.id}">
        <td data-label="الطالب">${s.name_ar}</td>
        <td data-label="الحالة">
          <div class="status-chip-group">
            ${statuses.map(st => `<button type="button" class="status-chip${st === 'حاضر' ? ' selected' : ''}" data-status="${st}" onclick="setStudentStatus(this)">${st}</button>`).join('')}
          </div>
        </td>
      </tr>
    `).join('');
  }

  document.getElementById('rosterWrap').style.display = 'block';
  document.getElementById('rosterActions').style.display = currentRoster.length ? 'block' : 'none';
  return true;
}

/** يحدد نفس الحالة لكل الطلاب دفعة وحدة (تحضير سريع) */
function markAll(status) {
  document.querySelectorAll('#rosterTableBody tr[data-student-id]').forEach(row => {
    row.querySelectorAll('.status-chip').forEach(chip => {
      chip.classList.toggle('selected', chip.dataset.status === status);
    });
  });
}

/** يحدد حالة طالب واحد عند الضغط على شريحته */
function setStudentStatus(btn) {
  const row = btn.closest('tr');
  row.querySelectorAll('.status-chip').forEach(chip => chip.classList.remove('selected'));
  btn.classList.add('selected');
}

function getRecordFilters() {
  return {
    branch: document.getElementById('f_branch').value,
    stages: document.getElementById('f_stages').value,
    grades: document.getElementById('f_grades').value,
    sections: document.getElementById('f_sections').value,
    subject: document.getElementById('f_subject').value,
    term: document.getElementById('f_term').value,
    week: document.getElementById('f_week').value.trim(),
    day: document.getElementById('f_day').value,
    period: document.getElementById('f_period').value.trim()
  };
}

async function saveRoster() {
  const f = getRecordFilters();
  const errorEl = document.getElementById('rosterError');
  errorEl.textContent = '';

  const rows = Array.from(document.querySelectorAll('#rosterTableBody tr[data-student-id]'));
  const records = rows.map(row => {
    const studentId = row.dataset.studentId;
    const student = currentRoster.find(s => s.id === studentId);
    return {
      student_id: studentId,
      student_name: student?.name_ar,
      branch: f.branch,
      term: f.term || null,
      week: f.week || null,
      day: f.day || null,
      period: f.period || null,
      subject: f.subject || null,
      status: row.querySelector('.status-chip.selected')?.dataset.status || 'حاضر'
    };
  });

  const saveBtn = document.getElementById('saveRosterBtn');
  saveBtn.disabled = true;

  try {
    await mirqatApi('attendance', 'saveAttendanceRoster', { records }, { cache: false });
    document.getElementById('rosterWrap').style.display = 'none';
    document.getElementById('rosterActions').style.display = 'none';
    loadStats();
  } catch (e) {
    errorEl.textContent = e.message;
  } finally {
    saveBtn.disabled = false;
  }
}

/* ---------------- سجل التحضير ---------------- */
async function loadLog(page = currentLogPage) {
  currentLogPage = page;
  const term = document.getElementById('log_term').value;
  const week = document.getElementById('log_week').value;
  const day = document.getElementById('log_day').value;
  const body = document.getElementById('logTableBody');

  if (!term || !week || !day) {
    body.innerHTML = '<tr><td colspan="6" class="empty-state">اختر الترم والأسبوع واليوم أولًا</td></tr>';
    return;
  }

  body.innerHTML = '<tr><td colspan="6" class="loading-row">جارٍ التحميل...</td></tr>';

  const filters = { term, week, day };
  const empFilter = document.getElementById('log_employee').value;
  if (empFilter) filters.employeeId = empFilter;

  try {
    const result = await mirqatApi('attendance', 'getAttendanceRecords', { filters, page, pageSize: 25 });
    if (!result.rows.length) {
      body.innerHTML = '<tr><td colspan="6" class="empty-state">لا يوجد سجلات لهذا الأسبوع/اليوم</td></tr>';
    } else {
      body.innerHTML = result.rows.map(r => `
        <tr>
          <td data-label="الطالب">${r.student_name || r.student_id}</td>
          <td data-label="المادة">${r.subject || '—'}</td>
          <td data-label="الحصة">${r.period || '—'}</td>
          <td data-label="الحالة">${r.status || '—'}</td>
          <td data-label="وقت التسجيل">${r.recorded_at ? new Date(r.recorded_at).toLocaleString('ar-SA') : '—'}</td>
          <td>
            <div class="row-actions">
              <button class="btn btn-outline btn-sm" ${r.can_edit ? '' : 'disabled title="انتهت مهلة التعديل"'} onclick="openEditModal('${r.id}')">تعديل</button>
              <button class="btn btn-danger btn-sm" ${r.can_delete ? '' : 'disabled title="انتهت مهلة الحذف"'} onclick="askDelete('${r.id}')">حذف</button>
            </div>
          </td>
        </tr>
      `).join('');
    }
    mirqatRenderPagination('logPaginationBar', result, (p) => loadLog(p));
  } catch (e) {
    body.innerHTML = `<tr><td colspan="6" class="empty-state">تعذّر التحميل: ${e.message}</td></tr>`;
  }
}

function openEditModal(id) {
  editTargetId = id;
  document.getElementById('editFormError').textContent = '';
  document.getElementById('editModal').hidden = false;
}
function closeEditModal() { document.getElementById('editModal').hidden = true; editTargetId = null; }

async function submitEdit() {
  const errorEl = document.getElementById('editFormError');
  errorEl.textContent = '';
  const status = document.getElementById('ef_status').value;

  try {
    const result = await mirqatApi('attendance', 'updateAttendanceRecords', {
      updates: [{ id: editTargetId, data: { status } }]
    }, { cache: false });
    if (result.failed && result.failed.length) {
      errorEl.textContent = result.failed[0].reason || 'تعذّر التعديل';
      return;
    }
    closeEditModal();
    loadLog();
  } catch (e) {
    errorEl.textContent = e.message;
  }
}

function askDelete(id) { deleteTargetId = id; document.getElementById('confirmModal').hidden = false; }
function closeConfirmModal() { document.getElementById('confirmModal').hidden = true; deleteTargetId = null; }

async function performDelete() {
  if (!deleteTargetId) return;
  try {
    const result = await mirqatApi('attendance', 'deleteAttendanceRecords', { ids: [deleteTargetId] }, { cache: false });
    closeConfirmModal();
    if (result.note) alert(result.note);
    loadLog();
  } catch (e) {
    alert('تعذّر حذف السجل: ' + e.message);
  }
}

/* ---------------- سجلات الأسبوع المنتهي ---------------- */
async function loadFinished() {
  const label = document.getElementById('finishedWeekLabel');
  const body = document.getElementById('finishedTableBody');
  body.innerHTML = '<tr><td colspan="5" class="loading-row">جارٍ التحميل...</td></tr>';

  try {
    const result = await mirqatApi('attendance', 'getFinishedWeekRecords', {});
    if (!result.week) {
      label.textContent = 'لا يوجد أسبوع دراسي منتهٍ في التقويم بعد.';
      body.innerHTML = '<tr><td colspan="5" class="empty-state">لا يوجد بيانات</td></tr>';
      return;
    }
    label.textContent = `آخر أسبوع منتهٍ: ${result.week.term} — ${result.week.week} (انتهى ${result.week.week_end_date})`;

    if (!result.records.length) {
      body.innerHTML = '<tr><td colspan="5" class="empty-state">لا يوجد سجلات لهذا الأسبوع</td></tr>';
      return;
    }
    body.innerHTML = result.records.map(r => `
      <tr>
        <td data-label="الطالب">${r.student_name || r.student_id}</td>
        <td data-label="المادة">${r.subject || '—'}</td>
        <td data-label="اليوم">${r.day || '—'}</td>
        <td data-label="الحصة">${r.period || '—'}</td>
        <td data-label="الحالة">${r.status || '—'}</td>
      </tr>
    `).join('');
  } catch (e) {
    body.innerHTML = `<tr><td colspan="5" class="empty-state">تعذّر التحميل: ${e.message}</td></tr>`;
  }
}
