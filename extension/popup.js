const API = "http://localhost:8001";

document.addEventListener("DOMContentLoaded", async () => {
  await checkBackend();
  await loadProjects();

  document.getElementById("save-btn").addEventListener("click", saveSelection);
  document.getElementById("dashboard-btn").addEventListener("click", () => {
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

async function saveSelection() {
  const btn = document.getElementById("save-btn");
  const projectId = document.getElementById("project-select").value || null;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://") || tab.url.startsWith("about:")) {
      showMessage("Cannot save from this page", "warning");
      return;
    }

    let result;
    try {
      result = await chrome.tabs.sendMessage(tab.id, { action: "getSelection" });
    } catch {
      // Content script not loaded — try injecting it first
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"]
        });
        result = await chrome.tabs.sendMessage(tab.id, { action: "getSelection" });
      } catch {
        showMessage("Select text on a webpage first", "warning");
        return;
      }
    }

    if (!result || !result.text || !result.text.trim()) {
      showMessage("No text selected on page", "warning");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Saving...";

    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: "saveClip",
          text: result.text,
          url: tab.url,
          title: tab.title,
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

    showMessage("Saved successfully!", "success");

    const { clipCount } = await chrome.storage.local.get(["clipCount"]);
    await chrome.storage.local.set({ clipCount: (clipCount || 0) + 1 });

    await loadProjects();
  } catch (e) {
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
