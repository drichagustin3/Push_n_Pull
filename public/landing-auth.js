
async function postAuth(endpoint, body) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const fieldErrors = Object.values(result.fields || {});
    const message = [
      result.error || result.message || 'The request could not be completed.',
      ...fieldErrors,
    ].join(' ');

    throw new Error(message);
  }

  return result;
}

function setFormBusy(form, busy) {
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = busy;

  form.setAttribute('aria-busy', String(busy));
}

function showAuthMessage(title, message, color = '#0F766E') {
  if (typeof showToast === 'function') {
    showToast(title, message, color);
  }
}

function showAuthError(error) {
  showAuthMessage(
    'Request Failed',
    error instanceof TypeError
      ? 'Check your connection and try again.'
      : error.message,
    '#DC2626'
  );
}


// Real sign-in
document.querySelector('#loginModal form')?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  if (form.getAttribute('aria-busy') === 'true') return;

  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const setupToken = document.getElementById('loginSetupToken')?.value.trim();

  if (Boolean(password) === Boolean(setupToken)) {
    showAuthMessage(
      'Sign In Required',
      'Enter either your password or your one-time setup token.',
      '#DC2626'
    );
    return;
  }

  const credentials = password
    ? { email, password }
    : { email, setup_token: setupToken };

  setFormBusy(form, true);

  try {
    const result = await postAuth('/api/v1/auth/login', credentials);
    form.reset();
    window.location.assign(result.redirect);
  } catch (error) {
    showAuthError(error);
  } finally {
    form.querySelectorAll('input[type="password"]').forEach((input) => {
      input.value = '';
    });
    setFormBusy(form, false);
  }
});


// Real registration
document.querySelector('#registerModal form')?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  if (form.getAttribute('aria-busy') === 'true') return;

  const data = {
    firstName: document.getElementById('regFirst').value.trim(),
    lastName: document.getElementById('regLast').value.trim(),
    email: document.getElementById('regEmail').value.trim(),
    password: document.getElementById('regPassword').value,
    confirmPassword: document.getElementById('regConfirmPassword').value,
  };

  if (data.password !== data.confirmPassword) {
    showAuthMessage('Registration Failed', 'Passwords must match.', '#DC2626');
    return;
  }

  setFormBusy(form, true);

  try {
    const result = await postAuth('/api/register', data);

    form.reset();
    closeModal('registerModal');

    showAuthMessage(
      'Registration Submitted',
      result.message,
      '#0F766E'
    );
  } catch (error) {
    showAuthError(error);
  } finally {
    form.querySelectorAll('input[type="password"]').forEach((input) => {
      input.value = '';
    });
    setFormBusy(form, false);
  }
});

// Real password-reset request
document.querySelector('#resetModal form')?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  if (form.getAttribute('aria-busy') === 'true') return;

  const email = document.getElementById('resetEmail').value.trim();

  setFormBusy(form, true);

  try {
    const result = await postAuth('/api/auth/forgot-password', { email });

    form.reset();
    closeModal('resetModal');

    showAuthMessage(
      'Password Reset Requested',
      result.message,
      '#0F766E'
    );
  } catch (error) {
    showAuthError(error);
  } finally {
    setFormBusy(form, false);
  }
});