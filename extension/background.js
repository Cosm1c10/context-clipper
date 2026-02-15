// Load config
try { importScripts("config.js"); } catch(e) { console.warn("config.js not found, using default"); }
try { importScripts("auth.js"); } catch(e) { console.warn("auth.js not found"); }

const API_BASE_URL = typeof API_BASE !== "undefined" ? API_BASE : "http://localhost:8001";

// --- Auth-aware fetch helper ---

async function apiFetch(path, options = {}) {
  const session = await getSessionFromStorage();
  const geminiKey = await getGeminiKeyFromStorage();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (session && session.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  if (geminiKey) {
    headers["X-Gemini-Key"] = geminiKey;
  }
  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  // Handle 401 — try token refresh once
  if (res.status === 401 && session && session.refresh_token) {
    try {
      const refreshed = await refreshTokenInStorage(session.refresh_token);
      if (refreshed) {
        headers["Authorization"] = `Bearer ${refreshed.access_token}`;
        return fetch(`${API_BASE_URL}${path}`, { ...options, headers });
      }
    } catch {
      // Refresh failed — clear session
      await chrome.storage.local.remove(["session"]);
    }
  }

  return res;
}

// Storage helpers for background script (can't use auth.js functions directly in service worker context)
async function getSessionFromStorage() {
  const data = await chrome.storage.local.get(["session"]);
  return data.session || null;
}

async function getGeminiKeyFromStorage() {
  const data = await chrome.storage.local.get(["geminiKey"]);
  return data.geminiKey || null;
}

async function refreshTokenInStorage(refreshToken) {
  const SUPA_URL = typeof SUPABASE_URL !== "undefined" ? SUPABASE_URL : null;
  const SUPA_KEY = typeof SUPABASE_ANON_KEY !== "undefined" ? SUPABASE_ANON_KEY : null;
  if (!SUPA_URL || !SUPA_KEY) return null;

  const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPA_KEY,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  await chrome.storage.local.set({
    session: {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      user: data.user ? { id: data.user.id, email: data.user.email } : null,
    }
  });
  return data;
}

// --- Context menu ---

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-to-context-bridge",
    title: "Save to Context Bridge",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "ask-about-selection",
    title: "Ask AI about this",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "save-to-context-bridge" && info.selectionText) {
    saveClip(info.selectionText, tab.url, tab.title);
  } else if (info.menuItemId === "ask-about-selection" && info.selectionText) {
    askAboutSelection(info.selectionText);
  }
});

// --- Keyboard shortcuts ---

chrome.commands.onCommand.addListener((command) => {
  if (command === "save-clip") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: "getSelection" }, (response) => {
        if (response && response.text) {
          saveClip(response.text, tabs[0].url, tabs[0].title);
        }
      });
    });
  } else if (command === "open-dashboard") {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard-dist/index.html") });
  }
});

// --- Message listener ---

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "saveClip") {
    saveClip(request.text, request.url, request.title, request.projectId)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === "askQuestion") {
    askQuestion(request.question)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === "getProjects") {
    apiFetch("/projects")
      .then(res => res.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === "exportProject") {
    apiFetch(`/projects/${request.projectId}/export`)
      .then(res => res.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === "exportBridge") {
    apiFetch(`/projects/${request.projectId}/bridge?format=${request.format || "yaml"}&compact=${request.compact || false}`)
      .then(res => res.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === "captureScreenshot") {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, data: dataUrl });
      }
    });
    return true;
  } else if (request.action === "saveScreenshot") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      chrome.tabs.captureVisibleTab(null, { format: "png" }, async (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        try {
          const context = {
            text: `Screenshot of ${tab.title || tab.url}`,
            url: tab.url,
            metadata: {
              title: tab.title || "",
              timestamp: new Date().toISOString(),
              domain: new URL(tab.url).hostname,
              wordCount: 0
            },
            media_type: "screenshot",
            screenshot_data: dataUrl,
            project_id: request.projectId || null
          };
          const response = await apiFetch("/save", {
            method: "POST",
            body: JSON.stringify(context)
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          chrome.notifications.create({
            type: "basic",
            iconUrl: "icons/icon48.png",
            title: "Context Clipper",
            message: "Screenshot saved!",
            priority: 1
          });
          sendResponse({ success: true, data });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      });
    });
    return true;
  } else if (request.action === "saveImage") {
    saveImageClip(request.imageUrl, request.altText, request.url, request.title, request.projectId)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === "saveFile") {
    saveFileClip(request.text, request.fileName, request.url, request.title, request.projectId)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === "proxyFetch") {
    fetch(request.url, request.options || {})
      .then(res => res.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// --- Core functions ---

async function saveClip(text, url, title = "", projectId = null) {
  try {
    const context = extractContext(text, url, title, projectId);
    const response = await apiFetch("/save", {
      method: "POST",
      body: JSON.stringify(context)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: "Context Bridge",
      message: "Clip saved successfully!",
      priority: 1
    });
    return data;
  } catch (error) {
    console.error("Error:", error);
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: "Context Bridge Error",
      message: `Failed to save: ${error.message}`,
      priority: 2
    });
    throw error;
  }
}

async function askQuestion(question) {
  const response = await apiFetch("/chat", {
    method: "POST",
    body: JSON.stringify({ question })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.detail || `HTTP error! status: ${response.status}`);
  }

  return await response.json();
}

function askAboutSelection(selectedText) {
  const question = `What can you tell me about: "${selectedText}"?`;
  askQuestion(question).then(data => {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: "Context Bridge - AI Answer",
      message: data.answer ? data.answer.substring(0, 200) : "No answer found.",
      priority: 1
    });
  });
}

function extractContext(text, url, title, projectId = null, extras = {}) {
  const cleanedText = (text || "").trim();
  const timestamp = new Date().toISOString();

  const context = {
    text: cleanedText || null,
    url: url,
    metadata: {
      title: title,
      timestamp: timestamp,
      domain: new URL(url).hostname,
      wordCount: cleanedText ? cleanedText.split(/\s+/).length : 0
    }
  };

  if (projectId) {
    context.project_id = projectId;
  }

  Object.assign(context, extras);
  return context;
}

async function saveImageClip(imageUrl, altText, pageUrl, pageTitle, projectId = null) {
  const context = extractContext(
    altText || `Image from ${pageTitle || pageUrl}`,
    pageUrl, pageTitle, projectId,
    { media_type: "image", image_url: imageUrl }
  );

  const response = await apiFetch("/save", {
    method: "POST",
    body: JSON.stringify(context)
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();

  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon48.png",
    title: "Context Clipper",
    message: "Image saved!",
    priority: 1
  });

  return data;
}

async function saveFileClip(text, fileName, pageUrl, pageTitle, projectId = null) {
  const context = extractContext(
    text, pageUrl, pageTitle, projectId,
    { media_type: "file", file_name: fileName }
  );

  const response = await apiFetch("/save", {
    method: "POST",
    body: JSON.stringify(context)
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();

  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon48.png",
    title: "Context Clipper",
    message: `File "${fileName}" saved!`,
    priority: 1
  });

  return data;
}
