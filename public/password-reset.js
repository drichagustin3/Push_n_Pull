const message = document.getElementById('resetMessage');
const resetForm = document.getElementById('resetPasswordForm');
const forgotForm = document.getElementById('forgotPasswordForm');
let token = new URLSearchParams(window.location.hash.slice(1)).get('token')
  || new URLSearchParams(window.location.search).get('token') || '';
// Remove the bearer credential from the address/history entry immediately.
if (resetForm) window.history.replaceState(null, '', '/reset-password');

for (const [form, endpoint] of [[forgotForm, 'forgot-password'], [resetForm, 'reset-password']]) {
  if (!form) continue;
  const button = form.querySelector('button');
  if (form === resetForm && !/^[a-f0-9]{64}$/.test(token)) {
    message.textContent = 'This reset link is invalid. Request a new link.';
    button.disabled = true;
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    const body = Object.fromEntries(new FormData(form));
    if (form === resetForm) {
      if (body.newPassword !== body.confirmPassword) {
        message.textContent = 'Passwords must match.';
        message.focus();
        return;
      }
      body.token = token;
    }
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    let complete = false;
    try {
      const response = await fetch(`/api/auth/${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const result = await response.json();
      message.textContent = result.message || result.error || 'The request could not be completed.';
      if (response.ok) {
        form.reset();
        if (form === resetForm) { token = ''; complete = true; }
      }
    } catch { message.textContent = 'Check your connection and try again.'; }
    finally {
      form.querySelectorAll('input[type="password"]').forEach((input) => { input.value = ''; });
      button.disabled = complete;
      form.removeAttribute('aria-busy');
      message.focus();
    }
  });
}
