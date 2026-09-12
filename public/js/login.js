document.getElementById('togglePassword').addEventListener('click', () => {
  const input = document.getElementById('password');
  const eyeIcon = document.getElementById('eyeIcon');
  const isHidden = input.type === 'password';

  input.type = isHidden ? 'text' : 'password';
  eyeIcon.innerHTML = isHidden
    ? '<path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.6 21.6 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.6 21.6 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>'
    : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"></path><circle cx="12" cy="12" r="3"></circle>';
});

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
