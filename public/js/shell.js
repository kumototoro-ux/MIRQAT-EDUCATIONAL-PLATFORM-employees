/**
 * shell.js — يُحمَّل في كل صفحة بعد تسجيل الدخول.
 * يبني القائمة الجانبية حسب دور المستخدم، ويتحقق فعليًا من صلاحية الجلسة.
 * الصفحات المبنية فعليًا فقط قابلة للنقر، والباقي يظهر بعلامة "قريبًا".
 */
const MIRQAT_NAV = [
  { key: 'dashboard', label: 'لوحة التحكم', href: '/dashboard.html', ready: true },
  { key: 'students', label: 'الطلاب', href: '/students.html', ready: true },
  { key: 'employees', label: 'الموظفون', href: '/employees.html', ready: true, adminOnly: true },
  { key: 'accounts', label: 'حسابات الدخول', href: '/accounts.html', ready: true, adminOnly: true },
  { key: 'schedule', label: 'التقويم والجدول', href: '/schedule.html', ready: true },
  { key: 'attendance', label: 'التحضير والغياب', href: '/attendance.html', ready: true },
  { key: 'tasks', label: 'المهام والإثراءات', href: '/tasks.html', ready: true },
  { key: 'grading', label: 'رصد الدرجات', href: '/grading.html', ready: true },
  { key: 'behavior', label: 'السلوك', href: '/behavior.html', ready: true },
  { key: 'reports', label: 'التقارير', href: '/reports.html', ready: true },
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

  nav.innerHTML = MIRQAT_NAV
    .filter(item => !item.adminOnly || user.role === 'admin')
    .map(item => {
      const isActive = item.key === activeKey;
      if (!item.ready) {
        return `<span class="nav-item disabled">${item.label} <span class="nav-badge">قريبًا</span></span>`;
      }
      return `<a class="nav-item${isActive ? ' active' : ''}" href="${item.href}">${item.label}</a>`;
    })
    .join('');
}

function mirqatInitShell(activeKey) {
  const session = mirqatGetSession();
  if (!session) {
    window.location.href = '/index.html';
    return null;
  }

  const { user } = session;
  document.getElementById('userName').textContent = user.name || '';
  mirqatBuildNav(activeKey, user);

  document.getElementById('logoutBtn').addEventListener('click', mirqatLogout);

  const menuToggle = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
  }

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
