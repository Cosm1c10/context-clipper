const API_BASE_URL = "http://localhost:8001";

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-to-context-clipper",
    title: "Save to Context Clipper",
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
  if (info.menuItemId === "save-to-context-clipper" && info.selectionText) {
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
    saveClip(request.text, request.url, request.title)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  } else if (request.action === "askQuestion") {
    askQuestion(request.question)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// Save clip to backend
async function saveClip(text, url, title = "") {
  try {
    // Extract LLM-ready context
    const context = extractContext(text, url, title);

    const response = await fetch(`${API_BASE_URL}/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(context)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Show success notification
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: "Context Clipper",
      message: "Successfully saved clip!",
      priority: 1
    });

    console.log("Success:", data);
    return data;
  } catch (error) {
    console.error("Error:", error);
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: "Context Clipper Error",
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
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ question })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
}

// Ask about selected text
function askAboutSelection(selectedText) {
  const question = `What can you tell me about: "${selectedText}"?`;
  askQuestion(question).then(data => {
    // Open popup or new tab with answer
    chrome.tabs.create({
      url: chrome.runtime.getURL(`answer.html?q=${encodeURIComponent(selectedText)}&a=${encodeURIComponent(data.answer)}`)
    });
  });
}

// Extract LLM-ready context from text
function extractContext(text, url, title) {
  // Clean up text
  let cleanedText = text.trim();

  // Add metadata for better context
  const timestamp = new Date().toISOString();

  // Create LLM-ready format with metadata
  const llmContext = {
    text: cleanedText,
    url: url,
    metadata: {
      title: title,
      timestamp: timestamp,
      domain: new URL(url).hostname,
      wordCount: cleanedText.split(/\s+/).length
    }
  };

  return llmContext;
}
