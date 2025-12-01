// Auth-related frontend logic: login, register, logout, and session checks

async function handleLoginSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const errorEl = document.getElementById("login-error");
  errorEl.hidden = true;
  errorEl.textContent = "";

  const data = {
    email: form.email.value.trim(),
    password: form.password.value,
  };

  try {
    await window.apiFetch("/login", {
      method: "POST",
      body: JSON.stringify(data),
    });
    window.location.href = "dashboard.html";
  } catch (err) {
    errorEl.textContent = err.message || "Could not log in.";
    errorEl.hidden = false;
  }
}

async function handleRegisterSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const errorEl = document.getElementById("register-error");
  errorEl.hidden = true;
  errorEl.textContent = "";

  const data = {
    email: form.email.value.trim(),
    password: form.password.value,
  };

  try {
    await window.apiFetch("/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
    // After registering, go straight to dashboard
    window.location.href = "dashboard.html";
  } catch (err) {
    errorEl.textContent = err.message || "Could not create account.";
    errorEl.hidden = false;
  }
}

async function handleLogoutClick() {
  try {
    await window.apiFetch("/logout", { method: "POST" });
  } catch {
    // ignore errors on logout
  } finally {
    window.location.href = "index.html";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", handleLoginSubmit);
  }

  const registerForm = document.getElementById("register-form");
  if (registerForm) {
    registerForm.addEventListener("submit", handleRegisterSubmit);
  }

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleLogoutClick);
  }
});


