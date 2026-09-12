const user = mirqatInitShell('attendance');
let allLists = {};
let currentRoster = [];
let deleteTargetId = null;

if (user) init();

async function init() {
  try {
    allLists = await mirqatApi('settings', 'getSettingsLists');
  } catch {
    allLists = {};
  }

  fillSelect('f_branch', allLists.branches, 'الفرع');
  fillSelect('f_stages', allLists.stages, 'المرحلة');
  fillSelect('f_grades', allLists.grades, 'الصف');
  fillSelect('f_sections', allLists.sections, 'الشعبة');
  fillSelect('f_subject', allLists.subject, 'المادة');
  fillSelect('f_term', allLists.terms, 'الترم');

  document.getElementById('loadRosterBtn').addEventListener('click', loadRoster);
  document.getElementById('saveRosterBtn').addEventListener('click', saveRoster);
  document.getElementById('closeConfirmModal').addEventListener('click', closeConfirmModal);
  document.getElementById('cancelConfirmBtn').addEventListener('click', closeConfirmModal);
  document.getElementById('confirmDeleteBtn').addEventListener('click', performDelete);

  loadRecords();
}

function fillSelect(id, options = [], placeholder = null) {
  const el = document.getElementById(id);
  el.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : '') +
    (options || []).map(o => `<option value="${o}">${o}</option>`).join('');
}

function getFilters() {
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

async function loadRoster() {
  const f = getFilters();
  if (!f.branch || !f.grades) {
    alert('اختر الفرع والصف على الأقل');
    return;
  }

  try {
    currentRoster = await mirqatApi('students', 'list', {
      filters: { branch: f.branch, stages: f.stages || undefined, grades: f.grades, sections: f.sections || undefined }
    });
  } catch (e) {
    alert('تعذّر تحميل الطلاب: ' + e.message);
    return;
  }

  const statuses = allLists.attendance_statuses || ['حاضر', 'غائب', 'متأخر', 'مستأذن'];
  const body = document.getElementById('rosterTableBody');

  if (!currentRoster.length) {
    body.innerHTML = '<tr><td colspan="2" class="empty-state">لا يوجد طلاب في هذه الشعبة</td></tr>';
  } else {
    body.innerHTML = currentRoster.map(s => `
      <tr data-student-id="${s.id}">
        <td>${s.name_ar}</td>
        <td>
          <select class="status-select">
            ${statuses.map(st => `<option value="${st}" ${st === 'حاضر' ? 'selected' : ''}>${st}</option>`).join('')}
          </select>
        </td>
      </tr>
    `).join('');
  }

  document.getElementById('rosterWrap').style.display = 'block';
  document.getElementById('rosterActions').style.display = currentRoster.length ? 'block' : 'none';
}

async function saveRoster() {
  const f = getFilters();
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
      status: row.querySelector('.status-select').value
    };
  });

  const saveBtn = document.getElementById('saveRosterBtn');
  saveBtn.disabled = true;

  try {
    await mirqatApi('attendance', 'saveAttendanceRoster', { records });
    document.getElementById('rosterWrap').style.display = 'none';
    document.getElementById('rosterActions').style.display = 'none';
    loadRecords();
  } catch (e) {
    errorEl.textContent = e.message;
  } finally {
    saveBtn.disabled = false;
  }
}

async function loadRecords() {
  const body = document.getElementById('recordsTableBody');
  body.innerHTML = '<tr><td colspan="7" class="loading-row">جارٍ التحميل...</td></tr>';

  try {
    const records = await mirqatApi('attendance', 'getAttendanceRecords', {});
    if (!records.length) {
      body.innerHTML = '<tr><td colspan="7" class="empty-state">لا يوجد سجلات بعد</td></tr>';
      return;
    }
    body.innerHTML = records.slice(0, 50).map(r => `
      <tr>
        <td>${r.student_name || r.student_id}</td>
        <td>${r.subject || '—'}</td>
        <td>${r.day || '—'}</td>
        <td>${r.period || '—'}</td>
        <td>${r.status || '—'}</td>
        <td>${r.recorded_at ? new Date(r.recorded_at).toLocaleString('ar-SA') : '—'}</td>
        <td><button class="btn btn-danger btn-sm" onclick="askDelete('${r.id}')">حذف</button></td>
      </tr>
    `).join('');
  } catch (e) {
    body.innerHTML = `<tr><td colspan="7" class="empty-state">تعذّر تحميل السجلات: ${e.message}</td></tr>`;
  }
}

function askDelete(id) {
  deleteTargetId = id;
  document.getElementById('confirmModal').hidden = false;
}

function closeConfirmModal() {
  document.getElementById('confirmModal').hidden = true;
  deleteTargetId = null;
}

async function performDelete() {
  if (!deleteTargetId) return;
  try {
    await mirqatApi('attendance', 'deleteAttendanceRecords', { ids: [deleteTargetId] });
    closeConfirmModal();
    loadRecords();
  } catch (e) {
    alert('تعذّر حذف السجل: ' + e.message);
  }
}
