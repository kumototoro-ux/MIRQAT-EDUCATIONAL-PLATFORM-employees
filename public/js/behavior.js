const user = mirqatInitShell('behavior');
let allLists = {};
let statusChartInstance = null;
let termChartInstance = null;
let branchChartInstance = null;

if (user) {
  if (user.role !== 'admin') {
    document.getElementById('mainContent').innerHTML = '<p class="empty-state">هذه الصفحة تتطلب صلاحية أدمن</p>';
  } else {
    init();
  }
}

async function init() {
  try {
    allLists = await mirqatApi('settings', 'getSettingsLists');
  } catch { allLists = {}; }

  fillSelect('filterBranch', allLists.branches, 'كل الفروع');
  fillSelect('filterTerm', allLists.terms, 'كل الترمات');
  fillSelect('filterStatus', allLists.behavior_statuses, 'كل الحالات');

  ['filterBranch', 'filterTerm', 'filterStatus'].forEach(id => {
    document.getElementById(id).addEventListener('change', loadRecords);
  });

  loadStats();
  loadRecords();
}

function fillSelect(id, options = [], placeholder = null) {
  const el = document.getElementById(id);
  el.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : '') + (options || []).map(o => `<option value="${o}">${o}</option>`).join('');
}

async function loadStats() {
  try {
    const stats = await mirqatApi('behavior', 'getStats', {});

    const positive = stats.byStatus.find(s => s.label === 'ايجابي')?.count || 0;
    const negative = stats.byStatus.find(s => s.label === 'سلبي')?.count || 0;
    const positiveRate = stats.total ? Math.round((positive / stats.total) * 100) : 0;

    document.getElementById('statsCards').innerHTML = [
      { label: 'إجمالي سجلات السلوك', value: stats.total, tone: 'primary' },
      { label: 'نسبة السلوك الإيجابي', value: positiveRate + '%', tone: positiveRate >= 50 ? 'primary' : 'warn' }
    ].map(c => `<div class="card" data-tone="${c.tone}"><div class="card-value">${c.value}</div><div class="card-label">${c.label}</div></div>`).join('');

    drawStatusDonut(positive, negative);
    drawTermBar(stats.byTerm);

    if (stats.byBranch.length > 1) {
      document.getElementById('branchChartCard').style.display = 'block';
      drawBranchBar(stats.byBranch);
    }
  } catch (e) {
    document.getElementById('statsCards').innerHTML = `<p class="empty-state">تعذّر تحميل الإحصائيات: ${e.message}</p>`;
  }
}

function drawStatusDonut(positive, negative) {
  mirqatApexDonut('statusChart', ['إيجابي', 'سلبي'], [positive, negative], {
    colors: ['#2F6B52', '#B03A2E'], centerLabel: String(positive + negative)
  });
}

function drawTermBar(byTerm) {
  mirqatApexBar('termChart', byTerm.map(t => t.label), [{ name: 'سجلات', data: byTerm.map(t => t.count) }], {
    colors: ['#A9813F']
  });
}

function drawBranchBar(byBranch) {
  mirqatApexPolar('branchChart', byBranch.map(b => b.label), byBranch.map(b => b.count));
}

async function loadRecords() {
  const body = document.getElementById('recordsTableBody');
  body.innerHTML = '<tr><td colspan="6" class="loading-row">جارٍ التحميل...</td></tr>';

  const filters = {
    branch: document.getElementById('filterBranch').value || undefined,
    term: document.getElementById('filterTerm').value || undefined,
    status: document.getElementById('filterStatus').value || undefined
  };

  try {
    const records = await mirqatApi('behavior', 'getBehaviorRecords', { filters });
    if (!records.length) {
      body.innerHTML = '<tr><td colspan="6" class="empty-state">لا يوجد سجلات مطابقة</td></tr>';
      return;
    }
    body.innerHTML = records.map(r => `
      <tr>
        <td data-label="الطالب">${r.student_name || r.student_id}</td>
        <td data-label="الحالة">${r.status || '—'}</td>
        <td data-label="الدرجة">${r.score ?? '—'}</td>
        <td data-label="الفرع">${r.branch || '—'}</td>
        <td data-label="الترم">${r.term || '—'}</td>
        <td data-label="سجّلها">${r.employee_name || '—'}</td>
      </tr>
    `).join('');
  } catch (e) {
    body.innerHTML = `<tr><td colspan="6" class="empty-state">تعذّر التحميل: ${e.message}</td></tr>`;
  }
}
