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
    { label: 'عدد الطلاب', value: summary.studentsCount, tone: 'primary' },
    { label: 'تكاليف بانتظار الرصد', value: summary.pendingTasksCount, tone: 'warn' },
    { label: 'تحضير اليوم', value: summary.todayAttendanceCount, tone: 'info' }
  ];

  if (summary.employeesCount !== undefined) {
    cards.push({ label: 'عدد الموظفين', value: summary.employeesCount, tone: 'gold' });
  }
  if (summary.recentAuditCount !== undefined) {
    cards.push({ label: 'حركات آخر 7 أيام', value: summary.recentAuditCount, tone: 'muted' });
  }

  document.getElementById('summaryCards').innerHTML = cards
    .map(c => `
      <div class="card" data-tone="${c.tone}">
        <div class="card-value">${c.value}</div>
        <div class="card-label">${c.label}</div>
      </div>
    `)
    .join('');
}
