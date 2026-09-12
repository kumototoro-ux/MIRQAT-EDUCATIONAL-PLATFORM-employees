const user = mirqatInitShell('audit');

if (user) {
  if (user.role !== 'admin') {
    document.getElementById('mainContent').innerHTML = '<p class="empty-state">هذه الصفحة تتطلب صلاحية أدمن</p>';
  } else {
    init();
  }
}

async function init() {
  try {
    const types = await mirqatApi('audit', 'getAuditActionTypes');
    document.getElementById('filterAction').innerHTML =
      '<option value="">كل الإجراءات</option>' + types.map(t => `<option value="${t}">${t}</option>`).join('');
  } catch { /* silent */ }

  document.getElementById('applyFiltersBtn').addEventListener('click', loadAuditLog);
  document.getElementById('loadSummaryBtn').addEventListener('click', loadSummary);

  loadAuditLog();
}

async function loadAuditLog() {
  const body = document.getElementById('auditTableBody');
  body.innerHTML = '<tr><td colspan="5" class="loading-row">جارٍ التحميل...</td></tr>';

  const filters = {
    action: document.getElementById('filterAction').value || undefined,
    empId: document.getElementById('filterEmpId').value.trim() || undefined,
    dateFrom: document.getElementById('filterFrom').value || undefined,
    dateTo: document.getElementById('filterTo').value || undefined
  };

  try {
    const rows = await mirqatApi('audit', 'getAuditLog', { filters });
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="5" class="empty-state">لا يوجد حركات ضمن هذا النطاق</td></tr>';
      return;
    }
    body.innerHTML = rows.map(r => `
      <tr>
        <td data-label="الوقت">${new Date(r.ts).toLocaleString('ar-SA')}</td>
        <td data-label="الموظف">${r.emp_name || r.emp_id || '—'}</td>
        <td data-label="الدور">${r.role || '—'}</td>
        <td data-label="الإجراء">${r.action || '—'}</td>
        <td data-label="التفاصيل">${r.details || '—'}</td>
      </tr>
    `).join('');
  } catch (e) {
    body.innerHTML = `<tr><td colspan="5" class="empty-state">تعذّر التحميل: ${e.message}</td></tr>`;
  }
}

async function loadSummary() {
  const empId = document.getElementById('empIdInput').value.trim();
  const cardsEl = document.getElementById('summaryCards');
  cardsEl.innerHTML = '<div class="card skeleton"></div>';

  try {
    const s = await mirqatApi('audit', 'getTeacherActivitySummary', { employeeId: empId || undefined });
    const cards = [
      { label: 'تكاليف أضافها', value: s.tasks, tone: 'primary' },
      { label: 'إثراءات أضافها', value: s.enrichments, tone: 'gold' },
      { label: 'درجات رصدها', value: s.gradingRecords, tone: 'info' },
      { label: 'سجلات حضور', value: s.attendanceRecords, tone: 'muted' },
      { label: 'سجلات سلوك', value: s.behaviorRecords, tone: 'warn' }
    ];
    cardsEl.innerHTML = cards.map(c => `
      <div class="card" data-tone="${c.tone}">
        <div class="card-value">${c.value}</div>
        <div class="card-label">${c.label}</div>
      </div>
    `).join('');
  } catch (e) {
    cardsEl.innerHTML = `<p class="form-error">تعذّر تحميل الملخص: ${e.message}</p>`;
  }
}
