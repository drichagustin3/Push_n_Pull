const message = document.getElementById('authMessage');
function showMessage(text) { message.textContent = text; message.focus(); }

async function send(endpoint, body) {
  const response = await fetch(`/api/v1/auth/${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    if (endpoint !== 'login' && [401, 403].includes(response.status)) {
      window.location.assign('/login?terminated=1');
    }
    throw new Error(data.message || 'The request could not be completed.');
  }
  return data;
}

for (const [id, endpoint] of [['loginForm', 'login'], ['setPasswordForm', 'set-password']]) {
  const form = document.getElementById(id);
  if (!form) continue;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button');
    if (button.disabled) return;
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    message.textContent = '';
    const values = Object.fromEntries(new FormData(form));
    if (endpoint === 'login') {
      values.email = values.email.trim();
      if (!values.password) delete values.password;
      if (!values.setup_token) delete values.setup_token;
    }
    try {
      const result = await send(endpoint, values);
      form.reset();
      window.location.assign(result.redirect);
    } catch (error) {
      showMessage(error instanceof TypeError ? 'Check your connection and try again.' : error.message);
    } finally {
      form.querySelectorAll('input[type="password"]').forEach((input) => { input.value = ''; });
      button.disabled = false;
      form.removeAttribute('aria-busy');
    }
  });
}

document.getElementById('logout')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  if (button.disabled) return;
  button.disabled = true;
  try {
    await send('logout', {});
    window.location.assign('/login');
  } catch { showMessage('Unable to sign out. Try again.'); }
  finally { button.disabled = false; }
});

if (new URLSearchParams(window.location.search).has('terminated')) showMessage('Your session ended. Please sign in again.');
if (document.getElementById('accountEmail')) {
  fetch('/api/v1/auth/session', { headers: { Accept: 'application/json' } }).then(async (response) => {
    const data = await response.json();
    if (!response.ok) {
      window.location.assign(data.redirect || '/login?terminated=1');
      return;
    }
    document.getElementById('accountEmail').textContent = data.user.email;
  }).catch(() => showMessage('Unable to check your session. Try refreshing.'));
}
