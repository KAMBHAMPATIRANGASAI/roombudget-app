import { auth } from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

function showMessage(message, type = 'info') {
  const status = document.getElementById('statusMessage');
  if (!status) {
    alert(message);
    return;
  }

  status.textContent = message;
  status.className = `status-message ${type}`;
}

function validateAuthForm(email, password) {
  if (!email || !password) {
    showMessage('Please enter both email and password.', 'error');
    return false;
  }

  if (!email.includes('@')) {
    showMessage('Please enter a valid email address.', 'error');
    return false;
  }

  if (password.length < 6) {
    showMessage('Password should be at least 6 characters.', 'error');
    return false;
  }

  return true;
}

export async function registerUser(email, password) {
  if (!validateAuthForm(email, password)) return;

  try {
    await createUserWithEmailAndPassword(auth, email, password);
    showMessage('Registration successful. Redirecting...', 'success');
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1000);
  } catch (error) {
    showMessage(error.message || 'Registration failed.', 'error');
  }
}

export async function loginUser(email, password) {
  if (!validateAuthForm(email, password)) return;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    showMessage('Login successful. Redirecting...', 'success');
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1000);
  } catch (error) {
    showMessage(error.message || 'Login failed.', 'error');
  }
}

export async function logoutUser() {
  try {
    await signOut(auth);
    alert('You have been logged out.');
    window.location.href = 'login.html';
  } catch (error) {
    alert('Logout failed: ' + (error.message || 'Unknown error'));
  }
}

export function initAuthForm() {
  const loginButton = document.getElementById('loginBtn');
  const registerButton = document.getElementById('registerBtn');
  const emailInput = document.getElementById('emailInput');
  const passwordInput = document.getElementById('passwordInput');

  if (!emailInput || !passwordInput) return;

  if (loginButton) {
    loginButton.addEventListener('click', () => {
      loginUser(emailInput.value.trim(), passwordInput.value.trim());
    });
  }

  if (registerButton && !registerButton.hasAttribute('onclick')) {
    registerButton.addEventListener('click', () => {
      registerUser(emailInput.value.trim(), passwordInput.value.trim());
    });
  }

  const form = document.getElementById('loginForm');
  form?.addEventListener('submit', event => {
    event.preventDefault();
    loginUser(emailInput.value.trim(), passwordInput.value.trim());
  });

  onAuthStateChanged(auth, user => {
    if (user) {
      window.location.href = 'index.html';
    }
  });
}

document.addEventListener('DOMContentLoaded', initAuthForm);
