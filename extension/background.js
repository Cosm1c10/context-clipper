const API_BASE_URL = "http://localhost:8001";

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
function extractContext(text, url, title, projectId = null) {
  const cleanedText = text.trim();
  const timestamp = new Date().toISOString();

  const context = {
    text: cleanedText,
    url: url,
    metadata: {
      title: title,
      timestamp: timestamp,
      domain: new URL(url).hostname,
      wordCount: cleanedText.split(/\s+/).length
    }
  };

  if (projectId) {
    context.project_id = projectId;
  }

  return context;
}
