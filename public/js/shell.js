/**
 * shell.js — يُحمَّل في كل صفحة بعد تسجيل الدخول.
 * يبني القائمة الجانبية حسب دور المستخدم، ويتحقق فعليًا من صلاحية الجلسة.
 * الصفحات المبنية فعليًا فقط قابلة للنقر، والباقي يظهر بعلامة "قريبًا".
 */
const MIRQAT_ICONS = {
  dashboard: '<path d="M3 12l9-9 9 9"/><path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"/>',
  students: '<circle cx="9" cy="7" r="4"/><path d="M17 11a4 4 0 1 0 0-8"/><path d="M1 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/><path d="M17 21v-2a4 4 0 0 0-3-3.87"/>',
  employees: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  accounts: '<circle cx="7" cy="15" r="4"/><path d="M10.5 11.5 20 2M16 2h4v4M12.5 9.5 15 12"/>',
  schedule: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  attendance: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  tasks: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  grading: '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
  behavior: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/>',
  reports: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>',
  audit: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
};

function mirqatIcon(key) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${MIRQAT_ICONS[key] || ''}</svg>`;
}

const MIRQAT_NAV = [
  { key: 'dashboard', label: 'لوحة التحكم', href: '/dashboard.html', ready: true, bottomNav: true },
  { key: 'students', label: 'الطلاب', href: '/students.html', ready: true },
  { key: 'employees', label: 'الموظفون', href: '/employees.html', ready: true, adminOnly: true },
  { key: 'accounts', label: 'حسابات الدخول', href: '/accounts.html', ready: true, adminOnly: true },
  { key: 'schedule', label: 'التقويم والجدول', href: '/schedule.html', ready: true },
  { key: 'attendance', label: 'التحضير والغياب', href: '/attendance.html', ready: true, bottomNav: true },
  { key: 'tasks', label: 'المهام والإثراءات', href: '/tasks.html', ready: true },
  { key: 'grading', label: 'رصد الدرجات', href: '/grading.html', ready: true, bottomNav: true },
  { key: 'behavior', label: 'السلوك', href: '/behavior.html', ready: true },
  { key: 'reports', label: 'التقارير', href: '/reports.html', ready: true, bottomNav: true },
  { key: 'audit', label: 'سجل التتبع', href: '/audit.html', ready: true, adminOnly: true },
  { key: 'settings', label: 'الإعدادات', href: '/settings.html', ready: true, adminOnly: true }
];

function mirqatGetSession() {
  const token = localStorage.getItem('mirqat_token');
  const userRaw = localStorage.getItem('mirqat_user');
  if (!token || !userRaw) return null;
  try {
    return { token, user: JSON.parse(userRaw) };
  } catch {
    return null;
  }
}

function mirqatLogout() {
  localStorage.removeItem('mirqat_token');
  localStorage.removeItem('mirqat_user');
  window.location.href = '/index.html';
}

async function mirqatApi(file, action, body = {}, opts = {}) {
  const useCache = opts.cache !== false;
  const ttl = opts.ttl || 30000; // 30 ثانية افتراضيًا — كافية لتفادي تكرار نفس البحث

  const cacheKey = file + ':' + action + ':' + JSON.stringify(body);
  if (useCache) {
    const hit = mirqatCache.get(cacheKey);
    if (hit && (Date.now() - hit.time) < ttl) return hit.data;
  }

  const session = mirqatGetSession();
  const res = await fetch(`/api/${file}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: 'Bearer ' + session.token } : {})
    },
    body: JSON.stringify({ action, ...body })
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'حدث خطأ');

  if (useCache) {
    mirqatCache.set(cacheKey, { data: json.data, time: Date.now() });
  } else {
    // أي عملية كتابة (إضافة/تعديل/حذف) تُفرغ الكاش بالكامل لضمان عدم عرض بيانات قديمة
    mirqatCache.clear();
  }
  return json.data;
}

const mirqatCache = new Map();

function mirqatBuildNav(activeKey, user) {
  const nav = document.getElementById('sidebarNav');
  if (!nav) return;

  const items = MIRQAT_NAV.filter(item => !item.adminOnly || user.role === 'admin');

  nav.innerHTML = items
    .map(item => {
      const isActive = item.key === activeKey;
      const iconHtml = `<span class="nav-icon">${mirqatIcon(item.key)}</span>`;
      if (!item.ready) {
        return `<span class="nav-item disabled">${iconHtml}<span class="nav-label">${item.label}</span> <span class="nav-badge">قريبًا</span></span>`;
      }
      return `<a class="nav-item${isActive ? ' active' : ''}" href="${item.href}" title="${item.label}">${iconHtml}<span class="nav-label">${item.label}</span></a>`;
    })
    .join('');

  // البار السفلي للجوال فقط — أهم 4 صفحات
  const bottomNav = document.getElementById('mobileBottomNav');
  if (bottomNav) {
    const bottomItems = items.filter(i => i.bottomNav && i.ready);
    bottomNav.innerHTML = bottomItems.map(item => `
      <a class="bottom-nav-item${item.key === activeKey ? ' active' : ''}" href="${item.href}">
        ${mirqatIcon(item.key)}
        <span>${item.label}</span>
      </a>
    `).join('');
  }
}

function mirqatEnsureMobileNavMarkup() {
  // البار السفلي (يُحقَن تلقائيًا إن لم يكن موجودًا بالصفحة)
  if (!document.getElementById('mobileBottomNav')) {
    const bottomNav = document.createElement('nav');
    bottomNav.id = 'mobileBottomNav';
    bottomNav.className = 'mobile-bottom-nav';
    document.body.appendChild(bottomNav);
  }
  // الخلفية المعتمة لإغلاق القائمة الجانبية بالجوال
  if (!document.getElementById('sidebarBackdrop')) {
    const backdrop = document.createElement('div');
    backdrop.id = 'sidebarBackdrop';
    backdrop.className = 'sidebar-backdrop';
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', mirqatCloseSidebar);
  }
}

function mirqatOpenSidebar() {
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('sidebarBackdrop')?.classList.add('open');
}

function mirqatCloseSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebarBackdrop')?.classList.remove('open');
}

function mirqatToggleSidebarCollapse() {
  const collapsed = document.getElementById('shell').classList.toggle('sidebar-collapsed');
  localStorage.setItem('mirqat_sidebar_collapsed', collapsed ? '1' : '0');
}

function mirqatInitShell(activeKey) {
  const session = mirqatGetSession();
  if (!session) {
    window.location.href = '/index.html';
    return null;
  }

  const { user } = session;
  mirqatEnsureMobileNavMarkup();
  mirqatBuildNav(activeKey, user);

  // استرجاع حالة الطي بسطح المكتب
  if (localStorage.getItem('mirqat_sidebar_collapsed') === '1') {
    document.getElementById('shell')?.classList.add('sidebar-collapsed');
  }

  const collapseBtn = document.getElementById('sidebarCollapseBtn');
  if (collapseBtn) collapseBtn.addEventListener('click', mirqatToggleSidebarCollapse);

  const menuToggle = document.getElementById('menuToggle');
  if (menuToggle) menuToggle.addEventListener('click', mirqatOpenSidebar);

  const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
  if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', mirqatCloseSidebar);

  // قائمة المستخدم المنسدلة بالبار العلوي
  const userMenuBtn = document.getElementById('userMenuBtn');
  const userMenuDropdown = document.getElementById('userMenuDropdown');
  if (userMenuBtn && userMenuDropdown) {
    const initial = (user.name || '؟').trim().charAt(0);
    document.querySelectorAll('.user-avatar-circle').forEach(el => { el.textContent = initial; });
    document.getElementById('userMenuName').textContent = user.name || '';
    document.getElementById('userMenuRole').textContent = user.role === 'admin' ? 'أدمن' : 'معلم';
    userMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userMenuDropdown.classList.toggle('open');
    });
    document.addEventListener('click', () => userMenuDropdown.classList.remove('open'));
    userMenuDropdown.addEventListener('click', (e) => e.stopPropagation());
  }

  document.getElementById('logoutBtn')?.addEventListener('click', mirqatLogout);

  // تحقق فعلي من صلاحية الجلسة مع الخادم — يسجّل خروج تلقائي إن كانت منتهية
  mirqatApi('auth', 'session').catch(mirqatLogout);

  // شعار واسم المدرسة (عام، بدون جلسة)
  fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'getSchoolInfo' })
  }).then(r => r.json()).then(json => {
    if (!json.ok) return;
    document.getElementById('schoolName').textContent = json.data.name;
    if (json.data.logo) {
      const logoEl = document.getElementById('schoolLogo');
      logoEl.onerror = () => { logoEl.style.display = 'none'; };
      logoEl.src = json.data.logo;
      logoEl.style.display = 'block';
    }
  }).catch(() => {});

  return user;
}

/* ================= نافذة تفاصيل مركزية مشتركة (تُحقَن تلقائيًا مرة واحدة) ================= */
function mirqatEnsureDrawer() {
  if (document.getElementById('mirqatDrawerOverlay')) return;

  const overlay = document.createElement('div');
  overlay.className = 'detail-overlay';
  overlay.id = 'mirqatDrawerOverlay';
  overlay.innerHTML = `
    <div class="detail-modal" id="mirqatDrawer" onclick="event.stopPropagation()">
      <div class="detail-handle"></div>
      <div class="drawer-header">
        <h2 id="mirqatDrawerTitle"></h2>
        <button class="drawer-close" id="mirqatDrawerClose">✕</button>
      </div>
      <div class="drawer-body" id="mirqatDrawerBody"></div>
      <div class="drawer-footer" id="mirqatDrawerFooter"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('mirqatDrawerClose').addEventListener('click', mirqatCloseDrawer);
  overlay.addEventListener('click', mirqatCloseDrawer);
}

function mirqatOpenDrawer({ title, bodyHtml, footerHtml = '' }) {
  mirqatEnsureDrawer();
  document.getElementById('mirqatDrawerTitle').textContent = title;
  document.getElementById('mirqatDrawerBody').innerHTML = bodyHtml;
  document.getElementById('mirqatDrawerFooter').innerHTML = footerHtml;
  document.getElementById('mirqatDrawerOverlay').classList.add('open');
  document.getElementById('mirqatDrawer').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function mirqatCloseDrawer() {
  const overlay = document.getElementById('mirqatDrawerOverlay');
  const drawer = document.getElementById('mirqatDrawer');
  if (!overlay) return;
  overlay.classList.remove('open');
  drawer.classList.remove('open');
  document.body.style.overflow = '';
}

/** يبني حقل عرض بسيط (تسمية + قيمة) داخل اللوحة الجانبية */
function mirqatDrawerField(label, value) {
  return `<div class="drawer-field"><span class="label">${label}</span><span class="value">${value ?? '—'}</span></div>`;
}

/** يبني شارة اتجاه (↑/↓ + نسبة٪) بالمقارنة مع القيمة السابقة — يرجّع نص فارغ إن لم توجد قيمة سابقة للمقارنة */
function mirqatTrendBadge(current, previous) {
  if (previous === null || previous === undefined || previous === 0) return '';
  const diff = current - previous;
  const pct = Math.round((diff / previous) * 100);
  if (pct === 0) return '<div class="card-trend">= 0%</div>';
  const dir = pct > 0 ? 'up' : 'down';
  return `<div class="card-trend ${dir}">${Math.abs(pct)}%</div>`;
}

/** بلَجن Chart.js يكتب رقمًا كبيرًا بمنتصف أي رسم دونات (دائري مفرّغ) */
function mirqatDonutCenterPlugin(text) {
  return {
    id: 'mirqatCenterText',
    afterDraw(chart) {
      const { ctx, chartArea } = chart;
      if (!chartArea) return;
      const { width, height, left, top } = chartArea;
      ctx.save();
      ctx.font = '800 26px "IBM Plex Sans Arabic", sans-serif';
      ctx.fillStyle = '#1E2A24';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, left + width / 2, top + height / 2);
      ctx.restore();
    }
  };
}

/**
 * يجيب أسماء الأسابيع الفعلية من التقويم الدراسي (مثل "الأول"، "الثاني"...)
 * بدل استخدام أرقام وهمية — لأن كل الجداول تخزّن الأسبوع كنص من التقويم.
 */
async function mirqatGetWeeksForTerm(term) {
  try {
    const calendar = await mirqatApi('schedule', 'getCalendar', { term: term || undefined });
    const seen = new Set();
    const weeks = [];
    calendar.forEach(row => {
      if (row.week && !seen.has(row.week)) { seen.add(row.week); weeks.push(row.week); }
    });
    return weeks;
  } catch {
    return [];
  }
}

/* ================= ترقيم صفحات مشترك ================= */
/**
 * يرسم شريط ترقيم صفحات في العنصر المحدد.
 * meta: { page, totalPages, total, pageSize } من استجابة أي API مُرقَّم.
 * onPage(pageNumber): دالة تُستدعى عند اختيار صفحة جديدة.
 */
function mirqatRenderPagination(containerId, meta, onPage) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!meta || meta.totalPages <= 1) {
    el.innerHTML = meta ? `<span>إجمالي النتائج: ${meta.total}</span>` : '';
    return;
  }

  const { page, totalPages, total } = meta;
  const pages = mirqatPageRange(page, totalPages);

  el.innerHTML = `
    <span>صفحة ${page} من ${totalPages} — إجمالي ${total}</span>
    <div class="pagination-pages">
      <button class="page-btn" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>السابق</button>
      ${pages.map(p => p === '...'
        ? `<span class="page-ellipsis">...</span>`
        : `<button class="page-btn${p === page ? ' active' : ''}" data-page="${p}">${p}</button>`
      ).join('')}
      <button class="page-btn" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>التالي</button>
    </div>
  `;

  el.querySelectorAll('.page-btn:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', () => onPage(parseInt(btn.dataset.page, 10)));
  });
}

function mirqatPageRange(current, total) {
  const range = [];
  const delta = 1;
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      range.push(i);
    } else if (range[range.length - 1] !== '...') {
      range.push('...');
    }
  }
  return range;
}
