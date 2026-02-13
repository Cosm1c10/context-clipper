// Loaded from config.js via importScripts
try { importScripts("config.js"); } catch(e) { console.warn("config.js not found, using default"); }
const API_BASE_URL = typeof API_BASE !== "undefined" ? API_BASE : "http://localhost:8001";

// Create context menu on install
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

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "save-to-context-bridge" && info.selectionText) {
    saveClip(info.selectionText, tab.url, tab.title);
  } else if (info.menuItemId === "ask-about-selection" && info.selectionText) {
    askAboutSelection(info.selectionText);
  }
});

// Handle keyboard shortcuts
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
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  }
});

// Listen for messages from content script or popup
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
    fetch(`${API_BASE_URL}/projects`)
      .then(res => res.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === "exportProject") {
    fetch(`${API_BASE_URL}/projects/${request.projectId}/export`)
      .then(res => res.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === "exportBridge") {
    fetch(`${API_BASE_URL}/projects/${request.projectId}/bridge?format=${request.format || "yaml"}&compact=${request.compact || false}`)
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
          const response = await fetch(`${API_BASE_URL}/save`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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

// Save clip to backend
async function saveClip(text, url, title = "", projectId = null) {
  try {
    const context = extractContext(text, url, title, projectId);

    const response = await fetch(`${API_BASE_URL}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(context)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
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

// Ask question to AI
async function askQuestion(question) {
  try {
    const response = await fetch(`${API_BASE_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
}

// Ask about selected text
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

// Extract LLM-ready context from text
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

  // Merge extra fields (media_type, image_url, file_name, screenshot_data)
  Object.assign(context, extras);

  return context;
}

// Save an image clip
async function saveImageClip(imageUrl, altText, pageUrl, pageTitle, projectId = null) {
  const context = extractContext(
    altText || `Image from ${pageTitle || pageUrl}`,
    pageUrl, pageTitle, projectId,
    { media_type: "image", image_url: imageUrl }
  );

  const response = await fetch(`${API_BASE_URL}/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

// Save a file clip
async function saveFileClip(text, fileName, pageUrl, pageTitle, projectId = null) {
  const context = extractContext(
    text, pageUrl, pageTitle, projectId,
    { media_type: "file", file_name: fileName }
  );

  const response = await fetch(`${API_BASE_URL}/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
