// Cache selection so it survives focus loss when popup opens
let lastSelection = "";

document.addEventListener("mouseup", () => {
  const text = window.getSelection().toString().trim();
  if (text.length > 0) {
    lastSelection = text;
  }
});

document.addEventListener("keyup", () => {
  const text = window.getSelection().toString().trim();
  if (text.length > 0) {
    lastSelection = text;
  }
});

// Listen for messages from background script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getSelection") {
    // Try live selection first, fall back to cached
    const liveText = window.getSelection().toString().trim();
    sendResponse({ text: liveText || lastSelection });
  }
});

// Floating button on text selection
let floatingButton = null;
let showButtonTimeout = null;
const MIN_TEXT_LENGTH = 10;
const SHOW_DELAY = 500;

document.addEventListener("mouseup", (e) => {
  const selectedText = window.getSelection().toString().trim();

  if (showButtonTimeout) {
    clearTimeout(showButtonTimeout);
    showButtonTimeout = null;
  }

  // Check if click target is or is near an <img>
  const imgEl = e.target.closest("img") || (e.target.tagName === "IMG" ? e.target : null);

  if (selectedText && selectedText.length >= MIN_TEXT_LENGTH) {
    showButtonTimeout = setTimeout(() => {
      showFloatingButton(e.pageX, e.pageY, selectedText, imgEl);
    }, SHOW_DELAY);
  } else if (imgEl && imgEl.src) {
    showButtonTimeout = setTimeout(() => {
      showImageButton(e.pageX, e.pageY, imgEl);
    }, SHOW_DELAY);
  } else {
    hideFloatingButton();
  }
});

document.addEventListener("mousedown", (e) => {
  if (floatingButton && !floatingButton.contains(e.target)) {
    hideFloatingButton();
  }
});

document.addEventListener("scroll", hideFloatingButton, true);
document.addEventListener("keydown", hideFloatingButton);

document.addEventListener("selectionchange", () => {
  const selection = window.getSelection();
  if (!selection || selection.toString().trim().length === 0) {
    hideFloatingButton();
    if (showButtonTimeout) {
      clearTimeout(showButtonTimeout);
      showButtonTimeout = null;
    }
  }
});

function showFloatingButton(x, y, text, imgEl = null) {
  hideFloatingButton();

  floatingButton = document.createElement("div");
  floatingButton.id = "context-bridge-float";

  let imgBtnHtml = "";
  if (imgEl && imgEl.src) {
    imgBtnHtml = `
    <button class="cb-float-img" title="Save Image">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
      Save Image
    </button>`;
  }

  floatingButton.innerHTML = `
    <button class="cb-float-save" title="Save to Context Clipper (Alt+S)">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/>
        <polyline points="7 3 7 8 15 8"/>
      </svg>
      Clip
    </button>
    <button class="cb-float-ask" title="Ask AI about this">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      Ask AI
    </button>
    ${imgBtnHtml}
  `;

  floatingButton.style.cssText = `
    position: absolute;
    left: ${x}px;
    top: ${y + 14}px;
    z-index: 999999;
    background: #1c1c1e;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    padding: 4px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.55), 0 0 0 0.5px rgba(255,255,255,0.06);
    display: flex;
    gap: 3px;
    animation: cbFadeIn 0.15s ease-out;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
  `;

  const btnBase = `
    padding: 7px 12px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 5px;
    transition: all 0.12s ease;
    color: white;
    font-family: inherit;
    letter-spacing: -0.1px;
  `;

  const saveBtn = floatingButton.querySelector(".cb-float-save");
  const askBtn = floatingButton.querySelector(".cb-float-ask");

  saveBtn.style.cssText = btnBase + "background: #0a84ff;";
  askBtn.style.cssText = btnBase + "background: rgba(255,255,255,0.08);";

  saveBtn.addEventListener("mouseover", () => { saveBtn.style.background = "#409cff"; });
  saveBtn.addEventListener("mouseout", () => { saveBtn.style.background = "#0a84ff"; });
  askBtn.addEventListener("mouseover", () => { askBtn.style.background = "rgba(255,255,255,0.14)"; });
  askBtn.addEventListener("mouseout", () => { askBtn.style.background = "rgba(255,255,255,0.08)"; });

  saveBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({
      action: "saveClip",
      text: text,
      url: window.location.href,
      title: document.title
    }, (response) => {
      if (response && response.success) {
        showToast("Saved to Context Clipper");
      } else {
        showToast("Failed to save", true);
      }
    });
    hideFloatingButton();
  });

  askBtn.addEventListener("click", () => {
    const question = prompt("What would you like to ask about this text?");
    if (question) {
      chrome.runtime.sendMessage({
        action: "askQuestion",
        question: question
      }, (response) => {
        if (response && response.success) {
          showAnswer(question, response.data.answer);
        } else {
          showToast("Failed to get answer", true);
        }
      });
    }
    hideFloatingButton();
  });

  // Image save button (if present)
  const imgBtn = floatingButton.querySelector(".cb-float-img");
  if (imgBtn && imgEl) {
    imgBtn.style.cssText = btnBase + "background: rgba(255,255,255,0.08);";
    imgBtn.addEventListener("mouseover", () => { imgBtn.style.background = "rgba(255,255,255,0.14)"; });
    imgBtn.addEventListener("mouseout", () => { imgBtn.style.background = "rgba(255,255,255,0.08)"; });
    imgBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({
        action: "saveImage",
        imageUrl: imgEl.src,
        altText: imgEl.alt || imgEl.title || "",
        url: window.location.href,
        title: document.title
      }, (response) => {
        if (response && response.success) {
          showToast("Image saved to Context Clipper");
        } else {
          showToast("Failed to save image", true);
        }
      });
      hideFloatingButton();
    });
  }

  document.body.appendChild(floatingButton);
}

function showImageButton(x, y, imgEl) {
  hideFloatingButton();

  floatingButton = document.createElement("div");
  floatingButton.id = "context-bridge-float";

  floatingButton.innerHTML = `
    <button class="cb-float-img" title="Save Image to Context Clipper">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
      Save Image
    </button>
  `;

  floatingButton.style.cssText = `
    position: absolute;
    left: ${x}px;
    top: ${y + 14}px;
    z-index: 999999;
    background: #1c1c1e;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    padding: 4px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.55), 0 0 0 0.5px rgba(255,255,255,0.06);
    display: flex;
    gap: 3px;
    animation: cbFadeIn 0.15s ease-out;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
  `;

  const imgBtn = floatingButton.querySelector(".cb-float-img");
  imgBtn.style.cssText = `
    padding: 7px 12px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 5px;
    transition: all 0.12s ease;
    color: white;
    font-family: inherit;
    letter-spacing: -0.1px;
    background: #0a84ff;
  `;

  imgBtn.addEventListener("mouseover", () => { imgBtn.style.background = "#409cff"; });
  imgBtn.addEventListener("mouseout", () => { imgBtn.style.background = "#0a84ff"; });
  imgBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({
      action: "saveImage",
      imageUrl: imgEl.src,
      altText: imgEl.alt || imgEl.title || "",
      url: window.location.href,
      title: document.title
    }, (response) => {
      if (response && response.success) {
        showToast("Image saved to Context Clipper");
      } else {
        showToast("Failed to save image", true);
      }
    });
    hideFloatingButton();
  });

  document.body.appendChild(floatingButton);
}

function hideFloatingButton() {
  if (showButtonTimeout) {
    clearTimeout(showButtonTimeout);
    showButtonTimeout = null;
  }
  if (floatingButton) {
    floatingButton.remove();
    floatingButton = null;
  }
}

function showToast(message, isError = false) {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 1000000;
    background: ${isError ? "#ff453a" : "#1c1c1e"};
    color: ${isError ? "white" : "#f5f5f7"};
    padding: 10px 18px;
    border-radius: 10px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5), 0 0 0 0.5px rgba(255,255,255,0.1);
    font-size: 13px;
    font-weight: 600;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
    animation: cbSlideIn 0.25s ease-out;
    letter-spacing: -0.1px;
    ${!isError ? 'border: 1px solid rgba(255,255,255,0.1);' : ''}
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.2s ease";
    setTimeout(() => toast.remove(), 200);
  }, 2500);
}

function showAnswer(question, answer) {
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 1000001;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
    animation: cbFadeIn 0.2s ease-out;
  `;

  const modal = document.createElement("div");
  modal.style.cssText = `
    background: #1c1c1e;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    padding: 24px;
    max-width: 520px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
    color: #f5f5f7;
    width: 100%;
    animation: cbSlideUp 0.25s ease-out;
  `;

  modal.innerHTML = `
    <div style="margin-bottom: 16px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#48484a;margin-bottom:6px;">Question</div>
      <p style="font-size:14px;line-height:1.5;font-weight:500;">${escapeHtml(question)}</p>
    </div>
    <div style="margin-bottom: 20px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#48484a;margin-bottom:6px;">Answer</div>
      <p style="font-size:14px;line-height:1.7;color:#86868b;">${escapeHtml(answer)}</p>
    </div>
    <button style="
      width: 100%;
      background: #0a84ff;
      color: white;
      border: none;
      padding: 11px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      font-family: inherit;
      transition: background 0.15s;
      letter-spacing: -0.1px;
    ">Close</button>
  `;

  const closeBtn = modal.querySelector("button");
  closeBtn.addEventListener("mouseover", () => { closeBtn.style.background = "#409cff"; });
  closeBtn.addEventListener("mouseout", () => { closeBtn.style.background = "#0a84ff"; });
  closeBtn.addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Inject animations
const style = document.createElement("style");
style.textContent = `
  @keyframes cbFadeIn {
    from { transform: translateY(4px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  @keyframes cbSlideIn {
    from { transform: translateX(80px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes cbSlideUp {
    from { transform: translateY(16px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
`;
document.head.appendChild(style);
