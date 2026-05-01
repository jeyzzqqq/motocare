import { isFirebaseReady, loginUser, loginWithGoogle, onAuthChange, registerUser } from "./firebase.js";

const form = document.getElementById("authForm");
const submitButton = document.getElementById("authSubmit");
const googleButton = document.getElementById("googleAuthButton");
const message = document.getElementById("authMessage");
const heading = document.getElementById("authHeading");
const description = document.getElementById("authDescription");
const notice = document.getElementById("firebaseNotice");
const displayNameInput = document.getElementById("displayName");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const authTabs = Array.from(document.querySelectorAll("[data-auth-tab]"));
const switchButtons = Array.from(document.querySelectorAll("[data-auth-switch]"));

let mode = new URLSearchParams(window.location.search).get("mode") === "signup" ? "signup" : "login";

function setMessage(text, tone = "neutral") {
  if (!message) {
    return;
  }
  message.className = `empty-state ${tone === "error" ? "border-red-200 bg-red-50 text-red-700" : tone === "success" ? "border-green-200 bg-green-50 text-green-700" : ""}`.trim();
  message.textContent = text;
  message.classList.remove("hidden");
}

function mapAuthError(error) {
  const code = error?.code || "";
  const map = {
    "auth/popup-closed-by-user": "Google sign-in was canceled before completion.",
    "auth/popup-blocked": "Your browser blocked the sign-in popup. Allow popups and try again.",
    "auth/network-request-failed": "Network issue detected. Check your internet and try again.",
    "auth/invalid-credential": "Invalid email or password. Please verify your credentials.",
    "auth/user-not-found": "No account found for this email.",
    "auth/wrong-password": "Incorrect password. Please try again.",
    "auth/email-already-in-use": "This email is already in use.",
    "auth/weak-password": "Password should be at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Please wait and try again."
  };
  return map[code] || error?.message || "Authentication failed. Please try again.";
}

function clearMessage() {
  message?.classList.add("hidden");
  if (message) {
    message.textContent = "";
  }
}

function updateMode(nextMode) {
  mode = nextMode;
  authTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.authTab === mode));
  document.querySelectorAll("[data-signup-only]").forEach((field) => {
    field.classList.toggle("hidden", mode !== "signup");
  });

  if (heading) {
    heading.textContent = mode === "signup" ? "Create your account" : "Welcome back";
  }
  if (description) {
    description.textContent = mode === "signup"
      ? "Sign up is optional. Google sign-in is recommended for quick access."
      : "Sign in to manage your motorcycle records.";
  }
  if (submitButton) {
    submitButton.textContent = mode === "signup" ? "Create account" : "Login";
  }
  clearMessage();
}

function setBusy(isBusy, source = "email") {
  if (!submitButton || !googleButton) {
    return;
  }
  submitButton.disabled = isBusy;
  googleButton.disabled = isBusy;
  submitButton.textContent = isBusy && source === "email" ? "Please wait..." : mode === "signup" ? "Create account" : "Login";
  googleButton.innerHTML = isBusy && source === "google"
    ? '<i class="fa-solid fa-spinner fa-spin"></i> Connecting...'
    : '<i class="fa-brands fa-google"></i> Continue with Google';
}

function initialsFromEmail(email) {
  const localPart = String(email || "rider").split("@")[0];
  return localPart
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function togglePasswordVisibility(button) {
  const targetId = button.dataset.target;
  const input = targetId ? document.getElementById(targetId) : null;
  if (!input) {
    return;
  }

  const shouldShow = input.type === "password";
  input.type = shouldShow ? "text" : "password";
  button.setAttribute("aria-pressed", shouldShow ? "true" : "false");
  button.setAttribute("aria-label", shouldShow ? "Hide password" : "Show password");
  button.innerHTML = shouldShow
    ? '<i class="fa-regular fa-eye-slash"></i>'
    : '<i class="fa-regular fa-eye"></i>';
}

async function handleSubmit(event) {
  event.preventDefault();
  clearMessage();

  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  const displayName = displayNameInput?.value.trim() || initialsFromEmail(email) || "Rider";

  if (!email || !password) {
    setMessage("Email and password are required.", "error");
    return;
  }

  if (mode === "signup" && password !== confirmPasswordInput.value.trim()) {
    setMessage("Passwords do not match.", "error");
    return;
  }

  if (mode === "signup" && password.length < 6) {
    setMessage("Use at least 6 characters for the password.", "error");
    return;
  }

  try {
    setBusy(true, "email");
    if (mode === "signup") {
      await registerUser(email, password, displayName);
      setMessage("Account created. Redirecting to your dashboard...", "success");
    } else {
      await loginUser(email, password);
      setMessage("Login successful. Redirecting to your dashboard...", "success");
    }
    window.setTimeout(() => {
      window.location.href = "./dashboard.html";
    }, 300);
  } catch (error) {
    setMessage(mapAuthError(error), "error");
  } finally {
    setBusy(false);
  }
}

async function handleGoogleSignIn() {
  clearMessage();
  try {
    setBusy(true, "google");
    await loginWithGoogle();
    setMessage("Google sign-in successful. Redirecting...", "success");
    window.setTimeout(() => {
      window.location.href = "./dashboard.html";
    }, 250);
  } catch (error) {
    setMessage(mapAuthError(error), "error");
  } finally {
    setBusy(false);
  }
}

if (notice && !isFirebaseReady()) {
  notice.classList.remove("hidden");
}

authTabs.forEach((tab) => {
  tab.addEventListener("click", () => updateMode(tab.dataset.authTab));
});

switchButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const switchTarget = button.dataset.authSwitch;
    if (switchTarget === "signup") {
      updateMode("signup");
    } else if (switchTarget === "forgot") {
      setMessage("Password reset is not configured yet in this build.", "neutral");
    }
  });
});

document.querySelectorAll("[data-password-toggle]").forEach((button) => {
  button.onclick = (event) => {
    event.preventDefault();
    togglePasswordVisibility(button);
  };
});

form?.addEventListener("submit", handleSubmit);
googleButton?.addEventListener("click", handleGoogleSignIn);
updateMode(mode);

onAuthChange((user) => {
  if (user) {
    window.location.replace("./dashboard.html");
  }
});
