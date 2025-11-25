const API_BASE_URL = "http://localhost:8001";

// Check backend status on load
document.addEventListener('DOMContentLoaded', async () => {
  await checkBackendStatus();
  loadStats();

  // Event listeners
  document.getElementById('save-selection').addEventListener('click', saveCurrentSelection);
  document.getElementById('open-dashboard').addEventListener('click', openDashboard);
  document.getElementById('ask-btn').addEventListener('click', askQuestion);
  document.getElementById('question-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') askQuestion();
  });
});

async function checkBackendStatus() {
  const statusEl = document.getElementById('status');
  const dotEl = statusEl.querySelector('.dot');

  try {
    const response = await fetch(`${API_BASE_URL}/save`, { method: 'OPTIONS' });
    if (response.ok || response.status === 405) {
      statusEl.innerHTML = '<div class="dot"></div><span>Backend connected</span>';
      statusEl.classList.remove('offline');
    } else {
      throw new Error('Backend not responding');
    }
  } catch (error) {
    statusEl.innerHTML = '<div class="dot offline"></div><span>Backend offline</span>';
    statusEl.classList.add('offline');
  }
}

async function loadStats() {
  try {
    const clipCount = await chrome.storage.local.get(['clipCount']);
    const queryCount = await chrome.storage.local.get(['queryCount']);

    document.getElementById('clip-count').textContent = clipCount.clipCount || 0;
    document.getElementById('query-count').textContent = queryCount.queryCount || 0;
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

async function saveCurrentSelection() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const result = await chrome.tabs.sendMessage(tab.id, { action: 'getSelection' });

    if (result && result.text && result.text.trim()) {
      chrome.runtime.sendMessage({
        action: 'saveClip',
        text: result.text,
        url: tab.url,
        title: tab.title
      }, async (response) => {
        if (response && response.success) {
          // Increment clip count
          const { clipCount } = await chrome.storage.local.get(['clipCount']);
          await chrome.storage.local.set({ clipCount: (clipCount || 0) + 1 });
          loadStats();

          showMessage('✓ Saved successfully!', 'success');
        } else {
          showMessage('✗ Failed to save', 'error');
        }
      });
    } else {
      showMessage('⚠️ No text selected', 'warning');
    }
  } catch (error) {
    console.error('Error:', error);
    showMessage('✗ Error: ' + error.message, 'error');
  }
}

function openDashboard() {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
}

async function askQuestion() {
  const input = document.getElementById('question-input');
  const question = input.value.trim();

  if (!question) {
    showMessage('⚠️ Please enter a question', 'warning');
    return;
  }

  const loadingEl = document.getElementById('loading');
  const answerEl = document.getElementById('answer-section');

  loadingEl.style.display = 'block';
  answerEl.style.display = 'none';

  try {
    chrome.runtime.sendMessage({
      action: 'askQuestion',
      question: question
    }, async (response) => {
      loadingEl.style.display = 'none';

      if (response && response.success) {
        answerEl.innerHTML = `<strong>Q:</strong> ${question}<br><br><strong>A:</strong> ${response.data.answer}`;
        answerEl.style.display = 'block';

        // Increment query count
        const { queryCount } = await chrome.storage.local.get(['queryCount']);
        await chrome.storage.local.set({ queryCount: (queryCount || 0) + 1 });
        loadStats();

        input.value = '';
      } else {
        showMessage('✗ Failed to get answer', 'error');
      }
    });
  } catch (error) {
    loadingEl.style.display = 'none';
    showMessage('✗ Error: ' + error.message, 'error');
  }
}

function showMessage(message, type) {
  const answerEl = document.getElementById('answer-section');
  answerEl.innerHTML = message;
  answerEl.style.display = 'block';
  answerEl.style.background = type === 'error' ? '#ffebee' : type === 'success' ? '#e8f5e9' : '#fff3e0';
  answerEl.style.color = type === 'error' ? '#c62828' : type === 'success' ? '#2e7d32' : '#e65100';

  setTimeout(() => {
    answerEl.style.display = 'none';
  }, 3000);
}
