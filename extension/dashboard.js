const API_BASE_URL = "http://localhost:8001";

let currentPage = 0;
const CLIPS_PER_PAGE = 20;
let allClips = [];
let filteredClips = [];
let currentFilter = 'all';

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
  loadClips();

  // Event listeners
  document.getElementById('search-btn').addEventListener('click', handleSearch);
  document.getElementById('search-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
  });

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.dataset.filter;
      filterClips();
    });
  });

  document.getElementById('prev-btn').addEventListener('click', () => {
    if (currentPage > 0) {
      currentPage--;
      renderClips();
    }
  });

  document.getElementById('next-btn').addEventListener('click', () => {
    if ((currentPage + 1) * CLIPS_PER_PAGE < filteredClips.length) {
      currentPage++;
      renderClips();
    }
  });

  // Modal handlers
  document.getElementById('cancel-btn').addEventListener('click', closeModal);
  document.getElementById('submit-btn').addEventListener('click', submitQuestion);
  document.getElementById('ask-modal').addEventListener('click', (e) => {
    if (e.target.id === 'ask-modal') closeModal();
  });
});

async function loadClips() {
  const loadingEl = document.getElementById('loading');
  const emptyEl = document.getElementById('empty-state');
  const clipsGrid = document.getElementById('clips-grid');

  loadingEl.style.display = 'block';
  emptyEl.style.display = 'none';
  clipsGrid.innerHTML = '';

  try {
    const response = await fetch(`${API_BASE_URL}/clips?limit=1000`);
    const data = await response.json();

    allClips = data.clips || [];
    filteredClips = [...allClips];

    loadingEl.style.display = 'none';

    if (allClips.length === 0) {
      emptyEl.style.display = 'block';
    } else {
      updateStats();
      renderClips();
    }
  } catch (error) {
    console.error('Error loading clips:', error);
    loadingEl.innerHTML = '<p style="color: red;">Error loading clips. Make sure the backend is running.</p>';
  }
}

function updateStats() {
  const totalClips = allClips.length;
  const totalWords = allClips.reduce((sum, clip) => sum + (clip.word_count || 0), 0);
  const domains = new Set(allClips.map(clip => clip.domain).filter(d => d));

  document.getElementById('total-clips').textContent = totalClips;
  document.getElementById('total-words').textContent = totalWords.toLocaleString();
  document.getElementById('domains-count').textContent = domains.size;
}

function filterClips() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  filteredClips = allClips.filter(clip => {
    const clipDate = new Date(clip.timestamp);

    if (currentFilter === 'today') {
      return clipDate >= today;
    } else if (currentFilter === 'week') {
      return clipDate >= weekAgo;
    }
    return true;
  });

  currentPage = 0;
  renderClips();
}

function handleSearch() {
  const query = document.getElementById('search-input').value.toLowerCase().trim();

  if (!query) {
    filteredClips = [...allClips];
  } else {
    filteredClips = allClips.filter(clip =>
      clip.text.toLowerCase().includes(query) ||
      clip.title.toLowerCase().includes(query) ||
      clip.url.toLowerCase().includes(query)
    );
  }

  currentPage = 0;
  renderClips();
}

function renderClips() {
  const clipsGrid = document.getElementById('clips-grid');
  const paginationEl = document.getElementById('pagination');

  const start = currentPage * CLIPS_PER_PAGE;
  const end = start + CLIPS_PER_PAGE;
  const clipsToRender = filteredClips.slice(start, end);

  clipsGrid.innerHTML = '';

  clipsToRender.forEach(clip => {
    const clipCard = createClipCard(clip);
    clipsGrid.appendChild(clipCard);
  });

  // Update pagination
  if (filteredClips.length > CLIPS_PER_PAGE) {
    paginationEl.style.display = 'flex';
    document.getElementById('prev-btn').disabled = currentPage === 0;
    document.getElementById('next-btn').disabled = (currentPage + 1) * CLIPS_PER_PAGE >= filteredClips.length;
    document.getElementById('page-info').textContent = `Page ${currentPage + 1} of ${Math.ceil(filteredClips.length / CLIPS_PER_PAGE)}`;
  } else {
    paginationEl.style.display = 'none';
  }
}

function createClipCard(clip) {
  const card = document.createElement('div');
  card.className = 'clip-card';

  const date = new Date(clip.timestamp);
  const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();

  card.innerHTML = `
    <div class="clip-header">
      <div class="clip-title">${escapeHtml(clip.title || 'Untitled Clip')}</div>
    </div>
    <div class="clip-meta">
      <span>📅 ${formattedDate}</span>
      <span>🌐 ${escapeHtml(clip.domain || 'Unknown')}</span>
      <span>📝 ${clip.word_count || 0} words</span>
    </div>
    <div class="clip-text" id="text-${clip.id}">
      ${escapeHtml(clip.text)}
    </div>
    <a href="${escapeHtml(clip.url)}" target="_blank" class="clip-url">
      ${escapeHtml(clip.url)}
    </a>
    <div class="clip-actions">
      <button class="btn-expand" onclick="toggleExpand('${clip.id}')">
        <span id="expand-text-${clip.id}">📖 Expand</span>
      </button>
      <button class="btn-ask" onclick="askAboutClip('${clip.id}', \`${escapeHtml(clip.text).replace(/`/g, '\\`')}\`)">
        🤔 Ask AI
      </button>
      <button class="btn-copy" onclick="copyToClipboard(\`${escapeHtml(clip.text).replace(/`/g, '\\`')}\`)">
        📋 Copy
      </button>
    </div>
  `;

  return card;
}

function toggleExpand(clipId) {
  const textEl = document.getElementById(`text-${clipId}`);
  const btnText = document.getElementById(`expand-text-${clipId}`);

  if (textEl.classList.contains('expanded')) {
    textEl.classList.remove('expanded');
    btnText.textContent = '📖 Expand';
  } else {
    textEl.classList.add('expanded');
    btnText.textContent = '📕 Collapse';
  }
}

function askAboutClip(clipId, text) {
  window.currentClipText = text;
  document.getElementById('ask-modal').classList.add('active');
  document.getElementById('question-input').focus();
  document.getElementById('answer-box').style.display = 'none';
}

function closeModal() {
  document.getElementById('ask-modal').classList.remove('active');
  document.getElementById('question-input').value = '';
  document.getElementById('answer-box').style.display = 'none';
  window.currentClipText = null;
}

async function submitQuestion() {
  const question = document.getElementById('question-input').value.trim();
  const answerBox = document.getElementById('answer-box');

  if (!question) return;

  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Asking...';

  try {
    const response = await fetch(`${API_BASE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ question })
    });

    const data = await response.json();

    answerBox.innerHTML = `<strong>Q:</strong> ${escapeHtml(question)}<br><br><strong>A:</strong> ${escapeHtml(data.answer)}`;
    answerBox.style.display = 'block';
    document.getElementById('question-input').value = '';
  } catch (error) {
    answerBox.innerHTML = `<strong style="color: red;">Error:</strong> ${escapeHtml(error.message)}`;
    answerBox.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Ask';
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('✓ Copied to clipboard!');
  }).catch(err => {
    console.error('Failed to copy:', err);
    showToast('✗ Failed to copy', true);
  });
}

function showToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 30px;
    right: 30px;
    z-index: 10000;
    background: ${isError ? '#f44336' : '#4CAF50'};
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    font-size: 15px;
    font-weight: 500;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
