document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const submitBtn = document.getElementById('submitBtn');
  const errorMsg = document.getElementById('errorMsg');

  errorMsg.textContent = '';
  submitBtn.disabled = true;
  submitBtn.textContent = 'جارٍ الدخول...';

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', username, password })
    });
    const json = await res.json();

    if (!json.ok) {
      errorMsg.textContent = json.error || 'حدث خطأ غير متوقع';
      submitBtn.disabled = false;
      submitBtn.textContent = 'دخول';
      return;
    }

    localStorage.setItem('mirqat_token', json.data.token);
    localStorage.setItem('mirqat_user', JSON.stringify(json.data.user));
    window.location.href = '/dashboard.html';
  } catch (err) {
    errorMsg.textContent = 'تعذّر الاتصال بالخادم';
    submitBtn.disabled = false;
    submitBtn.textContent = 'دخول';
  }
});
