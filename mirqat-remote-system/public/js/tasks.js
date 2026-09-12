const user = mirqatInitShell('tasks');
let allLists = {};
let evalTypes = [];
let editingTaskId = null;
let editingEnrichId = null;
let deleteTarget = null; // { kind: 'task'|'enrichment', id }
let tasksCache = [];
let enrichCache = [];

if (user) init();

async function init() {
  try {
    [allLists, evalTypes] = await Promise.all([
      mirqatApi('settings', 'getSettingsLists'),
      mirqatApi('settings', 'getEvalTypes')
    ]);
  } catch {
    allLists = {}; evalTypes = [];
  }

  setupTabs();
  fillFormSelects();

  document.getElementById('t_filterSubject').innerHTML = '<option value="">كل المواد</option>' +
    (allLists.subject || []).map(s => `<option value="${s}">${s}</option>`).join('');
  document.getElementById('t_filterTerm').innerHTML = '<option value="">كل الترمات</option>' +
    (allLists.terms || []).map(s => `<option value="${s}">${s}</option>`).join('');
  document.getElementById('e_filterSubject').innerHTML = '<option value="">كل المواد</option>' +
    (allLists.subject || []).map(s => `<option value="${s}">${s}</option>`).join('');

  document.getElementById('t_filterSubject').addEventListener('change', loadTasks);
  document.getElementById('t_filterTerm').addEventListener('change', loadTasks);
  document.getElementById('e_filterSubject').addEventListener('change', loadEnrichments);
  document.getElementById('e_filterType').addEventListener('change', loadEnrichments);

  document.getElementById('addTaskBtn').addEventListener('click', () => openTaskModal());
  document.getElementById('closeTaskModal').addEventListener('click', closeTaskModal);
  document.getElementById('cancelTaskBtn').addEventListener('click', closeTaskModal);
  document.getElementById('taskForm').addEventListener('submit', submitTaskForm);
  document.getElementById('tf_repeat').addEventListener('change', e => {
    document.getElementById('tf_repeat_until').disabled = !e.target.checked;
  });

  document.getElementById('addEnrichmentBtn').addEventListener('click', () => openEnrichModal());
  document.getElementById('closeEnrichModal').addEventListener('click', closeEnrichModal);
  document.getElementById('cancelEnrichBtn').addEventListener('click', closeEnrichModal);
  document.getElementById('enrichForm').addEventListener('submit', submitEnrichForm);

  document.getElementById('closeConfirmModal').addEventListener('click', closeConfirmModal);
  document.getElementById('cancelConfirmBtn').addEventListener('click', closeConfirmModal);
  document.getElementById('confirmDeleteBtn').addEventListener('click', performDelete);

  loadTasks();
  loadEnrichments();
}

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('panel-tasks').hidden = btn.dataset.tab !== 'tasks';
      document.getElementById('panel-enrichments').hidden = btn.dataset.tab !== 'enrichments';
    });
  });
}

function fillSelect(id, options = [], placeholder = null) {
  const el = document.getElementById(id);
  el.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : '') +
    (options || []).map(o => `<option value="${o}">${o}</option>`).join('');
}

function fillFormSelects() {
  fillSelect('tf_subject', allLists.subject);
  fillSelect('tf_eval_type', evalTypes);
  fillSelect('tf_branch', allLists.branches);
  fillSelect('tf_stages', allLists.stages);
  fillSelect('tf_grades', allLists.grades);
  fillSelect('tf_sections', allLists.sections);
  fillSelect('tf_term', allLists.terms);

  fillSelect('ef_subject', allLists.subject);
  fillSelect('ef_term', allLists.terms);
  fillSelect('ef_branch', allLists.branches);
  fillSelect('ef_stages', allLists.stages);
  fillSelect('ef_grades', allLists.grades);
  fillSelect('ef_sections', allLists.sections);
}

/* ================= المهام ================= */
let currentTasksPage = 1;

async function loadTasks(page = currentTasksPage) {
  currentTasksPage = page;
  const body = document.getElementById('tasksTableBody');
  body.innerHTML = '<tr><td colspan="8" class="loading-row">جارٍ التحميل...</td></tr>';

  const filters = {
    subject: document.getElementById('t_filterSubject').value || undefined,
    term: document.getElementById('t_filterTerm').value || undefined
  };

  try {
    const result = await mirqatApi('tasks', 'getTasks', { filters, page, pageSize: 25 });
    tasksCache = result.rows;
    if (!tasksCache.length) {
      body.innerHTML = '<tr><td colspan="8" class="empty-state">لا يوجد تكاليف</td></tr>';
    } else {
      body.innerHTML = tasksCache.map(t => `
      <tr>
        <td data-label="التكليف">${t.task_name}</td>
        <td data-label="المادة">${t.subject || '—'}</td>
        <td data-label="النوع">${t.eval_type || '—'}</td>
        <td data-label="الصف">${t.grades || '—'}</td>
        <td data-label="الاستحقاق">${t.due_date || '—'}</td>
        <td data-label="الدرجة">${t.max_score ?? '—'}</td>
        <td data-label="الرصد">${t.is_graded ? 'تم' : 'لم يُرصد'}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-outline btn-sm" ${t.can_edit ? '' : 'disabled title="انتهت مهلة التعديل (6 أيام)"'} onclick="editTask(${t.id})">تعديل</button>
            <button class="btn btn-danger btn-sm" ${t.can_delete ? '' : 'disabled title="انتهت مهلة الحذف (6 ساعات)"'} onclick="askDelete('task', ${t.id}, '${t.task_name.replace(/'/g, "\\'")}')">حذف</button>
          </div>
        </td>
      </tr>
    `).join('');
    }
    mirqatRenderPagination('tasksPaginationBar', result, (p) => loadTasks(p));
  } catch (e) {
    body.innerHTML = `<tr><td colspan="8" class="empty-state">تعذّر التحميل: ${e.message}</td></tr>`;
  }
}

function editTask(id) {
  const t = tasksCache.find(x => x.id === id);
  if (t) openTaskModal(t);
}

function openTaskModal(task = null) {
  editingTaskId = task ? task.id : null;
  document.getElementById('taskModalTitle').textContent = task ? 'تعديل تكليف' : 'إضافة تكليف';
  document.getElementById('tf_task_name').value = task?.task_name || '';
  document.getElementById('tf_details').value = task?.task_details || '';
  document.getElementById('tf_subject').value = task?.subject || '';
  document.getElementById('tf_eval_type').value = task?.eval_type || '';
  document.getElementById('tf_branch').value = task?.branch || '';
  document.getElementById('tf_stages').value = task?.stages || '';
  document.getElementById('tf_grades').value = task?.grades || '';
  document.getElementById('tf_sections').value = task?.sections || '';
  document.getElementById('tf_term').value = task?.term || '';
  document.getElementById('tf_max_score').value = task?.max_score ?? '';
  document.getElementById('tf_issue_date').value = task?.issue_date || '';
  document.getElementById('tf_due_date').value = task?.due_date || '';
  document.getElementById('tf_link').value = task?.link || '';
  document.getElementById('tf_repeat').checked = false;
  document.getElementById('tf_repeat').disabled = !!task;
  document.getElementById('tf_repeat_until').disabled = true;
  document.getElementById('tf_repeat_until').value = '';
  document.getElementById('repeatGroup').style.display = task ? 'none' : 'block';
  document.getElementById('taskFormError').textContent = '';
  document.getElementById('taskModal').hidden = false;
}

function closeTaskModal() { document.getElementById('taskModal').hidden = true; }

async function submitTaskForm(e) {
  e.preventDefault();
  const errorEl = document.getElementById('taskFormError');
  errorEl.textContent = '';

  const data = {
    task_name: document.getElementById('tf_task_name').value.trim(),
    task_details: document.getElementById('tf_details').value.trim() || null,
    subject: document.getElementById('tf_subject').value || null,
    eval_type: document.getElementById('tf_eval_type').value || null,
    branch: document.getElementById('tf_branch').value || null,
    stages: document.getElementById('tf_stages').value || null,
    grades: document.getElementById('tf_grades').value || null,
    sections: document.getElementById('tf_sections').value || null,
    term: document.getElementById('tf_term').value || null,
    max_score: document.getElementById('tf_max_score').value || null,
    issue_date: document.getElementById('tf_issue_date').value || null,
    due_date: document.getElementById('tf_due_date').value || null,
    link: document.getElementById('tf_link').value.trim() || null
  };

  if (!data.task_name) { errorEl.textContent = 'اسم التكليف مطلوب'; return; }

  const saveBtn = document.getElementById('saveTaskBtn');
  saveBtn.disabled = true;

  try {
    const repeat = document.getElementById('tf_repeat').checked;
    const repeatUntil = document.getElementById('tf_repeat_until').value;

    if (editingTaskId) {
      await mirqatApi('tasks', 'saveTask', { id: editingTaskId, data });
    } else if (repeat && repeatUntil) {
      if (!data.issue_date) { errorEl.textContent = 'حدد تاريخ الطرح للتكرار الأسبوعي'; saveBtn.disabled = false; return; }
      await mirqatApi('tasks', 'saveTaskRepeating', { data, repeatUntilDate: repeatUntil });
    } else {
      await mirqatApi('tasks', 'saveTask', { data });
    }
    closeTaskModal();
    loadTasks();
  } catch (e) {
    errorEl.textContent = e.message;
  } finally {
    saveBtn.disabled = false;
  }
}

/* ================= الإثراءات ================= */
let currentEnrichPage = 1;

async function loadEnrichments(page = currentEnrichPage) {
  currentEnrichPage = page;
  const body = document.getElementById('enrichmentsTableBody');
  body.innerHTML = '<tr><td colspan="6" class="loading-row">جارٍ التحميل...</td></tr>';

  const filters = {
    subject: document.getElementById('e_filterSubject').value || undefined,
    contentType: document.getElementById('e_filterType').value || undefined
  };

  try {
    const result = await mirqatApi('tasks', 'getEnrichments', { filters, page, pageSize: 25 });
    enrichCache = result.rows;
    if (!enrichCache.length) {
      body.innerHTML = '<tr><td colspan="6" class="empty-state">لا يوجد إثراءات</td></tr>';
    } else {
      body.innerHTML = enrichCache.map(en => `
      <tr>
        <td data-label="العنوان">${en.title}</td>
        <td data-label="النوع">${en.content_type}</td>
        <td data-label="المادة">${en.subject || '—'}</td>
        <td data-label="الصف">${en.grades || '—'}</td>
        <td data-label="الرابط"><a href="${en.link}" target="_blank" rel="noopener">فتح</a></td>
        <td>
          <div class="row-actions">
            <button class="btn btn-outline btn-sm" ${en.can_edit ? '' : 'disabled title="انتهت مهلة التعديل (6 أيام)"'} onclick="editEnrichment(${en.id})">تعديل</button>
            <button class="btn btn-danger btn-sm" ${en.can_delete ? '' : 'disabled title="انتهت مهلة الحذف (6 ساعات)"'} onclick="askDelete('enrichment', ${en.id}, '${en.title.replace(/'/g, "\\'")}')">حذف</button>
          </div>
        </td>
      </tr>
    `).join('');
    }
    mirqatRenderPagination('enrichPaginationBar', result, (p) => loadEnrichments(p));
  } catch (e) {
    body.innerHTML = `<tr><td colspan="6" class="empty-state">تعذّر التحميل: ${e.message}</td></tr>`;
  }
}

function editEnrichment(id) {
  const en = enrichCache.find(x => x.id === id);
  if (en) openEnrichModal(en);
}

function openEnrichModal(item = null) {
  editingEnrichId = item ? item.id : null;
  document.getElementById('enrichModalTitle').textContent = item ? 'تعديل إثراء' : 'إضافة إثراء';
  document.getElementById('ef_title').value = item?.title || '';
  document.getElementById('ef_content_type').value = item?.content_type || 'فيديو';
  document.getElementById('ef_subject').value = item?.subject || '';
  document.getElementById('ef_term').value = item?.term || '';
  document.getElementById('ef_branch').value = item?.branch || '';
  document.getElementById('ef_stages').value = item?.stages || '';
  document.getElementById('ef_grades').value = item?.grades || '';
  document.getElementById('ef_sections').value = item?.sections || '';
  document.getElementById('ef_link').value = item?.link || '';
  document.getElementById('ef_details').value = item?.details || '';
  document.getElementById('enrichFormError').textContent = '';
  document.getElementById('enrichModal').hidden = false;
}

function closeEnrichModal() { document.getElementById('enrichModal').hidden = true; }

async function submitEnrichForm(e) {
  e.preventDefault();
  const errorEl = document.getElementById('enrichFormError');
  errorEl.textContent = '';

  const data = {
    title: document.getElementById('ef_title').value.trim(),
    content_type: document.getElementById('ef_content_type').value,
    subject: document.getElementById('ef_subject').value || null,
    term: document.getElementById('ef_term').value || null,
    branch: document.getElementById('ef_branch').value || null,
    stages: document.getElementById('ef_stages').value || null,
    grades: document.getElementById('ef_grades').value || null,
    sections: document.getElementById('ef_sections').value || null,
    link: document.getElementById('ef_link').value.trim(),
    details: document.getElementById('ef_details').value.trim() || null
  };

  if (!data.title || !data.link) { errorEl.textContent = 'العنوان والرابط مطلوبان'; return; }

  const saveBtn = document.getElementById('saveEnrichBtn');
  saveBtn.disabled = true;

  try {
    if (editingEnrichId) {
      await mirqatApi('tasks', 'saveEnrichment', { id: editingEnrichId, data });
    } else {
      await mirqatApi('tasks', 'saveEnrichment', { data });
    }
    closeEnrichModal();
    loadEnrichments();
  } catch (e) {
    errorEl.textContent = e.message;
  } finally {
    saveBtn.disabled = false;
  }
}

/* ================= حذف مشترك ================= */
function askDelete(kind, id, label) {
  deleteTarget = { kind, id };
  document.getElementById('confirmMessage').textContent = `سيتم حذف "${label}" نهائيًا. هذا الإجراء لا يمكن التراجع عنه.`;
  document.getElementById('confirmModal').hidden = false;
}

function closeConfirmModal() {
  document.getElementById('confirmModal').hidden = true;
  deleteTarget = null;
}

async function performDelete() {
  if (!deleteTarget) return;
  try {
    if (deleteTarget.kind === 'task') {
      await mirqatApi('tasks', 'deleteTask', { id: deleteTarget.id });
      closeConfirmModal();
      loadTasks();
    } else {
      await mirqatApi('tasks', 'deleteEnrichment', { id: deleteTarget.id });
      closeConfirmModal();
      loadEnrichments();
    }
  } catch (e) {
    alert('تعذّر الحذف: ' + e.message);
  }
}
