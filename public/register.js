const form = document.getElementById('registerForm');
const errorMessage = document.getElementById('registerError');
const successMessage = document.getElementById('registerSuccess');
const button = form.querySelector('button');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (button.disabled) return;
  errorMessage.textContent = '';
  successMessage.textContent = '';
  const data = Object.fromEntries(new FormData(form));
  if (data.password !== data.confirmPassword) {
    errorMessage.textContent = 'Passwords must match.';
    errorMessage.focus();
    return;
  }
  button.disabled = true;
  form.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('/api/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) {
      errorMessage.textContent = [result.error, ...Object.values(result.fields || {})].join(' ');
      errorMessage.focus();
      return;
    }
    form.reset();
    successMessage.textContent = result.message;
    successMessage.focus();
  } catch {
    errorMessage.textContent = 'Unable to submit registration. Check your connection and try again.';
    errorMessage.focus();
  } finally {
    // Passwords are never retained for retries or stored in browser storage.
    form.elements.password.value = '';
    form.elements.confirmPassword.value = '';
    button.disabled = false;
    form.removeAttribute('aria-busy');
  }
});
