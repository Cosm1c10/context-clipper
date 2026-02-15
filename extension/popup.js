const API = typeof API_BASE !== "undefined" ? API_BASE : "http://localhost:8001";

// View elements
const viewLogin = document.getElementById("view-login");
const viewMain = document.getElementById("view-main");
const viewSettings = document.getElementById("view-settings");

function showView(view) {
  viewLogin.classList.add("hidden");
  viewMain.classList.add("hidden");
  viewSettings.classList.add("hidden");
  view.classList.remove("hidden");
}

// --- Init ---

document.addEventListener("DOMContentLoaded", async () => {
  const session = await getSession();
  if (session && session.access_token) {
    await initMainView();
  } else {
    showView(viewLogin);
  }

  // Auth form handlers
  let isSignUp = false;

  document.getElementById("auth-submit-btn").addEventListener("click", async () => {
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;
    const msgEl = document.getElementById("auth-message");
    const btn = document.getElementById("auth-submit-btn");

    if (!email || !password) {
      msgEl.textContent = "Please enter email and password";
      msgEl.className = "message warning";
      return;
    }

    if (password.length < 6) {
      msgEl.textContent = "Password must be at least 6 characters";
      msgEl.className = "message warning";
      return;
    }

    btn.disabled = true;
    btn.textContent = isSignUp ? "Creating account..." : "Signing in...";
    msgEl.className = "message";

    try {
      let result;
      if (isSignUp) {
        result = await supabaseSignUp(email, password);
        if (!result.access_token && result.id) {
          // Email confirmation required
          msgEl.textContent = "Check your email to confirm your account, then sign in.";
          msgEl.className = "message success";
          btn.disabled = false;
          btn.textContent = "Sign Up";
          return;
        }
      } else {
        result = await supabaseSignIn(email, password);
      }

      if (result.access_token) {
        await saveSession(result);
        await initMainView();
      } else {
        throw new Error("No access token received");
      }
    } catch (e) {
      msgEl.textContent = e.message || "Authentication failed";
      msgEl.className = "message error";
    } finally {
      btn.disabled = false;
      btn.textContent = isSignUp ? "Sign Up" : "Sign In";
    }
  });

  // Enter key on password field
  document.getElementById("auth-password").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("auth-submit-btn").click();
  });

  // Toggle sign in / sign up
  document.getElementById("auth-toggle-link").addEventListener("click", () => {
    isSignUp = !isSignUp;
    document.getElementById("auth-title").textContent = isSignUp ? "Create Account" : "Sign In";
    document.getElementById("auth-submit-btn").textContent = isSignUp ? "Sign Up" : "Sign In";
    document.getElementById("auth-toggle-text").textContent = isSignUp ? "Already have an account? " : "Don't have an account? ";
    document.getElementById("auth-toggle-link").textContent = isSignUp ? "Sign In" : "Sign Up";
    document.getElementById("auth-message").className = "message";
  });

  // Main view handlers
  document.getElementById("save-btn").addEventListener("click", (e) => {
    e.preventDefault();
    saveSelection();
  });

  document.getElementById("screenshot-btn").addEventListener("click", (e) => {
    e.preventDefault();
    captureScreenshot();
  });

  document.getElementById("dashboard-btn").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard-dist/index.html") });
  });

  // Settings handlers
  document.getElementById("settings-btn").addEventListener("click", () => {
    showSettingsView();
  });

  document.getElementById("back-btn").addEventListener("click", () => {
    showView(viewMain);
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await clearSession();
    showView(viewLogin);
  });

  document.getElementById("save-key-btn").addEventListener("click", async () => {
    const key = document.getElementById("gemini-key-input").value.trim();
    if (!key) return;
    await saveGeminiKey(key);
    document.getElementById("gemini-key-input").value = "";
    updateKeyStatus(true);
    showMessage("API key saved", "success");
  });

  document.getElementById("clear-key-btn").addEventListener("click", async () => {
    await chrome.storage.local.remove(["geminiKey"]);
    updateKeyStatus(false);
    showMessage("API key cleared", "success");
  });

  document.getElementById("claim-legacy-btn").addEventListener("click", async () => {
    const btn = document.getElementById("claim-legacy-btn");
    btn.disabled = true;
    btn.textContent = "Claiming...";
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API}/admin/claim-legacy-data`, {
        method: "POST",
        headers,
      });
      if (!res.ok) throw new Error("Failed to claim data");
      showMessage("Legacy data claimed!", "success");
    } catch (e) {
      showMessage(e.message || "Failed", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Claim Legacy Data";
    }
  });
});

// --- Main View Init ---

async function initMainView() {
  showView(viewMain);
  try {
    await checkBackend();
    await loadProjects();
  } catch (e) {
    console.error("Init error:", e);
  }
}

async function showSettingsView() {
  const session = await getSession();
  if (session && session.user) {
    document.getElementById("user-email").textContent = session.user.email || "Unknown";
  }
  const key = await getGeminiKey();
  updateKeyStatus(!!key);
  showView(viewSettings);
}

function updateKeyStatus(hasKey) {
  const el = document.getElementById("key-status");
  const text = document.getElementById("key-status-text");
  if (hasKey) {
    el.className = "key-status has-key";
    text.textContent = "API key configured";
  } else {
    el.className = "key-status no-key";
    text.textContent = "No key configured";
  }
}

// --- Backend check ---

async function checkBackend() {
  const el = document.getElementById("status");
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API}/projects`, { method: "GET", headers });
    if (res.ok) {
      el.innerHTML = '<div class="status-dot"></div><span>Backend connected</span>';
      el.classList.remove("offline");
    } else if (res.status === 401) {
      // Token expired — try refresh
      const refreshed = await ensureValidSession();
      if (!refreshed) {
        await clearSession();
        showView(viewLogin);
        return;
      }
      // Retry
      const retryHeaders = await getAuthHeaders();
      const retry = await fetch(`${API}/projects`, { method: "GET", headers: retryHeaders });
      if (retry.ok) {
        el.innerHTML = '<div class="status-dot"></div><span>Backend connected</span>';
        el.classList.remove("offline");
      } else {
        throw new Error();
      }
    } else {
      throw new Error();
    }
  } catch {
    el.innerHTML = '<div class="status-dot"></div><span>Backend offline</span>';
    el.classList.add("offline");
  }
}

// --- Projects ---

async function loadProjects() {
  const select = document.getElementById("project-select");
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API}/projects`, { headers });
    const projects = await res.json();
    select.innerHTML = '<option value="">No project (unsorted)</option>';
    projects.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.name} (${p.clip_count || 0} clips)`;
      select.appendChild(opt);
    });
  } catch {
    // Backend offline
  }
}

// --- Save ---

async function getSelectedText() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return null;

    if (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://") ||
        tab.url.startsWith("about:") || tab.url.startsWith("edge://")) {
      return null;
    }

    try {
      const result = await chrome.tabs.sendMessage(tab.id, { action: "getSelection" });
      if (result && result.text && result.text.trim()) {
        return { text: result.text.trim(), tab };
      }
    } catch {}

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });
      await new Promise(r => setTimeout(r, 100));
      const result = await chrome.tabs.sendMessage(tab.id, { action: "getSelection" });
      if (result && result.text && result.text.trim()) {
        return { text: result.text.trim(), tab };
      }
    } catch {}

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection().toString()
      });
      if (results && results[0] && results[0].result && results[0].result.trim()) {
        return { text: results[0].result.trim(), tab };
      }
    } catch {}

    return { text: null, tab };
  } catch (e) {
    console.error("getSelectedText error:", e);
    return null;
  }
}

async function saveSelection() {
  const btn = document.getElementById("save-btn");
  const projectId = document.getElementById("project-select").value || null;

  // Check for Gemini key first
  const geminiKey = await getGeminiKey();
  if (!geminiKey) {
    showMessage("Please add your Gemini API Key in Settings", "warning");
    return;
  }

  try {
    const result = await getSelectedText();
    if (!result) {
      showMessage("Cannot access this page", "warning");
      return;
    }
    if (!result.text) {
      showMessage("No text selected on page", "warning");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Saving...";

    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: "saveClip",
          text: result.text,
          url: result.tab.url,
          title: result.tab.title,
          projectId: projectId,
        },
        (resp) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (resp && resp.success) {
            resolve(resp);
          } else {
            reject(new Error(resp?.error || "Save failed"));
          }
        }
      );
    });

    showMessage("Saved!", "success");
    await loadProjects();
  } catch (e) {
    console.error("Save error:", e);
    showMessage(e.message || "Failed to save", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/>
        <polyline points="7 3 7 8 15 8"/>
      </svg>
      Save Selection`;
  }
}

async function captureScreenshot() {
  const btn = document.getElementById("screenshot-btn");
  const projectId = document.getElementById("project-select").value || null;

  // Check for Gemini key
  const geminiKey = await getGeminiKey();
  if (!geminiKey) {
    showMessage("Please add your Gemini API Key in Settings", "warning");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Capturing...";

  try {
    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: "saveScreenshot", projectId },
        (resp) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (resp && resp.success) {
            resolve(resp);
          } else {
            reject(new Error(resp?.error || "Screenshot failed"));
          }
        }
      );
    });
    showMessage("Screenshot saved!", "success");
  } catch (e) {
    console.error("Screenshot error:", e);
    showMessage(e.message || "Failed to capture", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
        <circle cx="12" cy="13" r="4"/>
      </svg>
      Screenshot Page`;
  }
}

function showMessage(text, type) {
  const el = document.getElementById("message");
  el.textContent = text;
  el.className = `message ${type}`;
  setTimeout(() => { el.className = "message"; }, 3000);
}
