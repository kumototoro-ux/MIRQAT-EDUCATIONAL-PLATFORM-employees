const user = mirqatInitShell('dashboard');
let attendanceTrendChartInstance = null;
let gradingTrendChartInstance = null;
let behaviorDonutChartInstance = null;

if (user) init();

async function init() {
  document.getElementById('welcomeTitle').textContent = `أهلًا، ${user.name || ''}`;

  loadSummaryCards();
  loadAttendanceTrend();
  loadGradingTrend();
  loadUpcomingExams();

  if (user.role === 'admin') {
    loadBehaviorOverview();
    loadRecentActivity();
  }
}

/* ================= بطاقات الملخص (من كل الوحدات) ================= */
async function loadSummaryCards() {
  try {
    const summary = await mirqatApi('audit', 'getDashboardSummary', {});

    const cards = [
      { label: 'الطلاب ضمن نطاقك', value: summary.studentsCount, tone: 'primary' },
      { label: 'تكاليف بانتظار الرصد', value: summary.pendingTasksCount, tone: 'gold' },
      { label: 'سجلات تحضير اليوم', value: summary.todayAttendanceCount, tone: 'info' }
    ];

    if (user.role === 'admin') {
      cards.push({ label: 'الموظفون', value: summary.employeesCount, tone: 'muted' });
      cards.push({ label: 'حركات آخر 7 أيام', value: summary.recentAuditCount, tone: 'warn' });
    }

    document.getElementById('summaryCards').innerHTML = cards.map(c =>
      `<div class="card" data-tone="${c.tone}"><div class="card-value">${c.value}</div><div class="card-label">${c.label}</div></div>`
    ).join('');
  } catch (e) {
    document.getElementById('summaryCards').innerHTML = `<p class="empty-state">تعذّر تحميل الملخص: ${e.message}</p>`;
  }
}

/* ================= اتجاه التحضير ================= */
async function loadAttendanceTrend() {
  try {
    const stats = await mirqatApi('attendance', 'getStats', {});
    if (!stats.weeklyTrend || !stats.weeklyTrend.length) return;

    document.getElementById('attendanceTrendCard').style.display = 'block';
    if (attendanceTrendChartInstance) attendanceTrendChartInstance.destroy();
    attendanceTrendChartInstance = new Chart(document.getElementById('attendanceTrendChart'), {
      type: 'line',
      data: {
        labels: stats.weeklyTrend.map(w => w.label),
        datasets: [{
          label: 'سجلات التحضير',
          data: stats.weeklyTrend.map(w => w.count),
          borderColor: '#2F6B52', backgroundColor: 'rgba(47,107,82,0.12)',
          fill: true, tension: 0.4, pointRadius: 3
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
  } catch { /* صامت — قسم ثانوي */ }
}

/* ================= اتجاه الرصد ================= */
async function loadGradingTrend() {
  try {
    const stats = await mirqatApi('grading', 'getStats', {});
    if (!stats.weeklyTrend || !stats.weeklyTrend.length) return;

    document.getElementById('gradingTrendCard').style.display = 'block';
    if (gradingTrendChartInstance) gradingTrendChartInstance.destroy();
    gradingTrendChartInstance = new Chart(document.getElementById('gradingTrendChart'), {
      type: 'line',
      data: {
        labels: stats.weeklyTrend.map(w => w.label),
        datasets: [{
          label: 'سجلات الرصد',
          data: stats.weeklyTrend.map(w => w.count),
          borderColor: '#A9813F', backgroundColor: 'rgba(169,129,63,0.12)',
          fill: true, tension: 0.4, pointRadius: 3
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
  } catch { /* صامت */ }
}

/* ================= نظرة عامة على السلوك (أدمن فقط) ================= */
async function loadBehaviorOverview() {
  try {
    const stats = await mirqatApi('behavior', 'getStats', {});
    if (!stats.total) return;

    const positive = stats.byStatus.find(s => s.label === 'ايجابي')?.count || 0;
    const negative = stats.byStatus.find(s => s.label === 'سلبي')?.count || 0;

    document.getElementById('behaviorDonutCard').style.display = 'block';
    if (behaviorDonutChartInstance) behaviorDonutChartInstance.destroy();
    behaviorDonutChartInstance = new Chart(document.getElementById('behaviorDonutChart'), {
      type: 'doughnut',
      data: {
        labels: ['إيجابي', 'سلبي'],
        datasets: [{ data: [positive, negative], backgroundColor: ['#2F6B52', '#B03A2E'], borderWidth: 0 }]
      },
      plugins: [mirqatDonutCenterPlugin(String(stats.total))],
      options: { responsive: true, cutout: '72%', plugins: { legend: { position: 'bottom' } } }
    });
  } catch { /* صامت */ }
}

/* ================= الاختبارات القادمة (من الجدول) ================= */
async function loadUpcomingExams() {
  const box = document.getElementById('upcomingExamsList');
  try {
    const exams = await mirqatApi('schedule', 'getTimetable', { type: 'جدول اختبار', filters: {} });
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = exams
      .filter(e => !e.exam_date || e.exam_date >= today)
      .sort((a, b) => (a.exam_date || '').localeCompare(b.exam_date || ''))
      .slice(0, 6);

    if (!upcoming.length) { box.innerHTML = '<p class="empty-state">لا يوجد اختبارات قادمة</p>'; return; }

    box.innerHTML = upcoming.map(e => `
      <div class="exam-item">
        <span class="ei-subject">${e.subject || '—'} — ${e.grade || ''}</span>
        <span class="ei-date">${e.exam_date || '—'}</span>
      </div>
    `).join('');
  } catch (e) {
    box.innerHTML = `<p class="empty-state">تعذّر التحميل: ${e.message}</p>`;
  }
}

/* ================= آخر الأنشطة (أدمن فقط — من سجل التتبع) ================= */
async function loadRecentActivity() {
  document.getElementById('activityPanel').style.display = 'block';
  const box = document.getElementById('recentActivityList');
  try {
    const result = await mirqatApi('audit', 'getAuditLog', { page: 1, pageSize: 6 });
    if (!result.rows.length) { box.innerHTML = '<p class="empty-state">لا يوجد أنشطة مسجّلة</p>'; return; }

    box.innerHTML = result.rows.map(r => `
      <div class="activity-item">
        <span class="ai-action">${r.emp_name || 'النظام'} — ${r.action || ''}</span>
        <span class="ai-time">${r.ts ? new Date(r.ts).toLocaleString('ar-SA') : ''}</span>
      </div>
    `).join('');
  } catch (e) {
    box.innerHTML = `<p class="empty-state">تعذّر التحميل: ${e.message}</p>`;
  }
}
