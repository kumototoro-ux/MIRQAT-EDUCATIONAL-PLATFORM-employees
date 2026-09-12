/**
 * shell.js — يُحمَّل في كل صفحة بعد تسجيل الدخول.
 * يبني القائمة الجانبية حسب دور المستخدم، ويتحقق فعليًا من صلاحية الجلسة.
 * الصفحات المبنية فعليًا فقط قابلة للنقر، والباقي يظهر بعلامة "قريبًا".
 */
const MIRQAT_NAV = [
  { key: 'dashboard', label: 'لوحة التحكم', href: '/dashboard.html', ready: true },
  { key: 'students', label: 'الطلاب', href: '/students.html', ready: true },
  { key: 'employees', label: 'الموظفون', href: '/employees.html', ready: false, adminOnly: true },
  { key: 'schedule', label: 'التقويم والجدول', href: '/schedule.html', ready: false },
  { key: 'attendance', label: 'التحضير والغياب', href: '/attendance.html', ready: false },
  { key: 'tasks', label: 'المهام والإثراءات', href: '/tasks.html', ready: false },
  { key: 'grading', label: 'رصد الدرجات', href: '/grading.html', ready: false },
  { key: 'behavior', label: 'السلوك', href: '/behavior.html', ready: false },
  { key: 'reports', label: 'التقارير', href: '/reports.html', ready: false },
  { key: 'audit', label: 'سجل التتبع', href: '/audit.html', ready: false, adminOnly: true },
  { key: 'settings', label: 'الإعدادات', href: '/settings.html', ready: false, adminOnly: true }
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

async function mirqatApi(file, action, body = {}) {
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
  return json.data;
}

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
