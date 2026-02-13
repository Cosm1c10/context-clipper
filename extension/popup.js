const API = "http://localhost:8001";

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await checkBackend();
    await loadProjects();
  } catch (e) {
    console.error("Init error:", e);
  }

  document.getElementById("save-btn").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    saveSelection();
  });

  document.getElementById("dashboard-btn").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  });
});

async function checkBackend() {
  const el = document.getElementById("status");
  try {
    const res = await fetch(`${API}/projects`, { method: "GET" });
    if (res.ok) {
      el.innerHTML = '<div class="status-dot"></div><span>Backend connected</span>';
      el.classList.remove("offline");
    } else {
      throw new Error();
    }
  } catch {
    el.innerHTML = '<div class="status-dot"></div><span>Backend offline</span>';
    el.classList.add("offline");
  }
}

async function loadProjects() {
  const select = document.getElementById("project-select");
  try {
    const res = await fetch(`${API}/projects`);
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

async function getSelectedText() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url) return null;

    // Skip restricted pages
    if (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://") ||
        tab.url.startsWith("about:") || tab.url.startsWith("edge://")) {
      return null;
    }

    // Try sending message to existing content script
    try {
      const result = await chrome.tabs.sendMessage(tab.id, { action: "getSelection" });
      if (result && result.text && result.text.trim()) {
        return { text: result.text.trim(), tab };
      }
    } catch {
      // Content script not loaded, try injecting
    }

    // Inject content script and retry
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });
      // Small delay for script to initialize
      await new Promise(r => setTimeout(r, 100));
      const result = await chrome.tabs.sendMessage(tab.id, { action: "getSelection" });
      if (result && result.text && result.text.trim()) {
        return { text: result.text.trim(), tab };
      }
    } catch {
      // Could not inject or get selection
    }

    // Last resort: try executeScript to get selection directly
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection().toString()
      });
      if (results && results[0] && results[0].result && results[0].result.trim()) {
        return { text: results[0].result.trim(), tab };
      }
    } catch {
      // Could not execute script
    }

    return { text: null, tab };
  } catch (e) {
    console.error("getSelectedText error:", e);
    return null;
  }
}

async function saveSelection() {
  const btn = document.getElementById("save-btn");
  const projectId = document.getElementById("project-select").value || null;

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

function showMessage(text, type) {
  const el = document.getElementById("message");
  el.textContent = text;
  el.className = `message ${type}`;
  setTimeout(() => { el.className = "message"; }, 3000);
}
