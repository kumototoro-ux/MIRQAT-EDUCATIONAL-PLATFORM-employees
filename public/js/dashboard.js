const user = mirqatInitShell('dashboard');

if (user) {
  mirqatApi('audit', 'getDashboardSummary')
    .then(renderSummaryCards)
    .catch(() => {
      document.getElementById('summaryCards').innerHTML =
        '<p class="error-msg">تعذّر تحميل ملخص لوحة التحكم</p>';
    });
}

function renderSummaryCards(summary) {
  const cards = [
    { label: 'عدد الطلاب', value: summary.studentsCount },
    { label: 'تكاليف بانتظار الرصد', value: summary.pendingTasksCount },
    { label: 'تحضير اليوم', value: summary.todayAttendanceCount }
  ];

  if (summary.employeesCount !== undefined) {
    cards.push({ label: 'عدد الموظفين', value: summary.employeesCount });
  }
  if (summary.recentAuditCount !== undefined) {
    cards.push({ label: 'حركات آخر 7 أيام', value: summary.recentAuditCount });
  }

  document.getElementById('summaryCards').innerHTML = cards
    .map(c => `
      <div class="card">
        <div class="card-value">${c.value}</div>
        <div class="card-label">${c.label}</div>
      </div>
    `)
    .join('');
}
