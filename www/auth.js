const accountKey = 'rythora-account';
const sessionKey = 'rythora-session';

function setSession(account) {
  // This is a display cache only; the signed, HTTP-only cookie is the real session.
  localStorage.setItem(accountKey, JSON.stringify(account));
  localStorage.setItem(sessionKey, JSON.stringify({ email: account.email, name: account.name }));
}

function showError(message) {
  const error = document.querySelector('#form-error');
  if (error) error.textContent = message;
}

function showPassword(button) {
  const input = document.querySelector(button.dataset.target);
  input.type = input.type === 'password' ? 'text' : 'password';
  button.textContent = input.type === 'password' ? 'Show' : 'Hide';
}

document.querySelectorAll('.show-password').forEach((button) => button.addEventListener('click', () => showPassword(button)));

const lastPeriodInput = document.querySelector('#last-period');
if (lastPeriodInput) {
  const today = new Date();
  const defaultLastPeriod = new Date(today);
  defaultLastPeriod.setDate(today.getDate() - 17);
  lastPeriodInput.max = today.toISOString().slice(0, 10);
  lastPeriodInput.value = defaultLastPeriod.toISOString().slice(0, 10);
}

document.querySelector('#auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const mode = event.currentTarget.dataset.mode;
  const email = String(form.get('email')).trim().toLowerCase();
  const password = String(form.get('password'));
  if (!email || !password) return showError('Please fill in the fields above.');
  if (mode === 'signup' && password.length < 8) return showError('Use at least 8 characters for your password.');
  const button = event.currentTarget.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const payload = mode === 'signup' ? { name: String(form.get('name')).trim(), email, password, age: Number(form.get('age')), lastPeriod: String(form.get('lastPeriod')), cycleLength: Number(form.get('cycleLength')), periodLength: Number(form.get('periodLength')) } : { email, password };
    const response = await fetch(`/api/auth/${mode === 'signup' ? 'signup' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) return showError(result.error || 'Unable to sign in.');
    setSession(result.user);
    window.location.href = 'index.html';
  } catch { showError('Unable to reach Rythora. Make sure the server is running.'); }
  finally { button.disabled = false; }
});

document.querySelector('#demo-login')?.addEventListener('click', async () => {
  try { const response = await fetch('/api/auth/demo', { method: 'POST' }); const result = await response.json(); if (!response.ok) throw new Error(); setSession(result.user); window.location.href = 'index.html'; }
  catch { showError('Unable to start the demo. Make sure the server is running.'); }
});
