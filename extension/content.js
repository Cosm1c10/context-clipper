// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getSelection") {
    const selectedText = window.getSelection().toString();
    sendResponse({ text: selectedText });
  }
});

// Show floating button when text is selected
let floatingButton = null;

document.addEventListener('mouseup', (e) => {
  const selectedText = window.getSelection().toString().trim();

  if (selectedText && selectedText.length > 0) {
    showFloatingButton(e.pageX, e.pageY, selectedText);
  } else {
    hideFloatingButton();
  }
});

document.addEventListener('mousedown', (e) => {
  if (floatingButton && !floatingButton.contains(e.target)) {
    hideFloatingButton();
  }
});

function showFloatingButton(x, y, text) {
  hideFloatingButton();

  floatingButton = document.createElement('div');
  floatingButton.id = 'context-clipper-floating-btn';
  floatingButton.innerHTML = `
    <button class="cc-save-btn" title="Save to Context Clipper (Ctrl+Shift+S)">
      💾 Save
    </button>
    <button class="cc-ask-btn" title="Ask AI about this">
      🤔 Ask AI
    </button>
  `;

  floatingButton.style.cssText = `
    position: absolute;
    left: ${x}px;
    top: ${y + 20}px;
    z-index: 999999;
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    display: flex;
    gap: 8px;
  `;

  const buttonStyle = `
    padding: 6px 12px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: all 0.2s;
  `;

  const saveBtn = floatingButton.querySelector('.cc-save-btn');
  const askBtn = floatingButton.querySelector('.cc-ask-btn');

  saveBtn.style.cssText = buttonStyle + 'background: #4CAF50; color: white;';
  askBtn.style.cssText = buttonStyle + 'background: #2196F3; color: white;';

  saveBtn.addEventListener('mouseover', () => saveBtn.style.background = '#45a049');
  saveBtn.addEventListener('mouseout', () => saveBtn.style.background = '#4CAF50');
  askBtn.addEventListener('mouseover', () => askBtn.style.background = '#0b7dda');
  askBtn.addEventListener('mouseout', () => askBtn.style.background = '#2196F3');

  saveBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      action: 'saveClip',
      text: text,
      url: window.location.href,
      title: document.title
    }, (response) => {
      if (response && response.success) {
        showToast('✓ Saved to Context Clipper!');
      } else {
        showToast('✗ Failed to save', true);
      }
    });
    hideFloatingButton();
  });

  askBtn.addEventListener('click', () => {
    const question = prompt('What would you like to ask about this text?', `What is "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"?`);
    if (question) {
      chrome.runtime.sendMessage({
        action: 'askQuestion',
        question: question
      }, (response) => {
        if (response && response.success) {
          showAnswer(question, response.data.answer);
        } else {
          showToast('✗ Failed to get answer', true);
        }
      });
    }
    hideFloatingButton();
  });

  document.body.appendChild(floatingButton);
}

function hideFloatingButton() {
  if (floatingButton) {
    floatingButton.remove();
    floatingButton = null;
  }
}

function showToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 1000000;
    background: ${isError ? '#f44336' : '#4CAF50'};
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    font-size: 14px;
    font-weight: 500;
    animation: slideIn 0.3s ease-out;
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function showAnswer(question, answer) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1000001;
    background: rgba(0,0,0,0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  `;

  const modal = document.createElement('div');
  modal.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 24px;
    max-width: 600px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  `;

  modal.innerHTML = `
    <div style="margin-bottom: 16px;">
      <h3 style="margin: 0 0 8px 0; color: #333;">Question</h3>
      <p style="margin: 0; color: #666; font-size: 14px;">${question}</p>
    </div>
    <div style="margin-bottom: 16px;">
      <h3 style="margin: 0 0 8px 0; color: #333;">Answer</h3>
      <p style="margin: 0; color: #444; font-size: 14px; line-height: 1.6;">${answer}</p>
    </div>
    <button style="
      background: #2196F3;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      width: 100%;
    ">Close</button>
  `;

  modal.querySelector('button').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);
