const API = typeof API_BASE !== "undefined" ? API_BASE : "http://localhost:8001";

let projects = [];
let allClips = [];
let filteredClips = [];
let currentProjectId = "all";
let currentPage = 0;
let editMode = false;
let editingClipId = null;
const PER_PAGE = 20;
let currentFilter = "all";
let currentMediaFilter = null;

// Color palette for project dots
const DOT_COLORS = [
  "#0a84ff", "#30d158", "#ff9f0a", "#ff453a", "#5e5ce6",
  "#bf5af2", "#64d2ff", "#ff6482", "#ac8e68", "#32d74b"
];

document.addEventListener("DOMContentLoaded", () => {
  init();
});

async function init() {
  bindEvents();
  await Promise.all([loadProjects(), loadClips()]);
}

function bindEvents() {
  // Search
  const searchInput = document.getElementById("search-input");
  searchInput.addEventListener("input", debounce(handleSearch, 250));
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSearch();
  });

  // Filter chips
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", (e) => {
      document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      e.target.classList.add("active");
      const filter = e.target.dataset.filter;
      const media = e.target.dataset.media || null;

      if (media) {
        currentMediaFilter = media;
        currentFilter = "all"; // don't combine with time filter
      } else {
        currentMediaFilter = null;
        currentFilter = filter;
      }
      applyFilters();
    });
  });

  // Pagination
  document.getElementById("prev-btn").addEventListener("click", () => {
    if (currentPage > 0) { currentPage--; renderClips(); }
  });
  document.getElementById("next-btn").addEventListener("click", () => {
    if ((currentPage + 1) * PER_PAGE < filteredClips.length) { currentPage++; renderClips(); }
  });

  // Project creation
  document.getElementById("add-project-btn").addEventListener("click", () => {
    document.getElementById("create-project-modal").classList.add("active");
    document.getElementById("project-name-input").focus();
  });
  document.getElementById("cancel-create-btn").addEventListener("click", closeCreateModal);
  document.getElementById("confirm-create-btn").addEventListener("click", createProject);
  document.getElementById("create-project-modal").addEventListener("click", (e) => {
    if (e.target.id === "create-project-modal") closeCreateModal();
  });
  document.getElementById("project-name-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") createProject();
  });

  // Edit mode
  document.getElementById("toggle-edit-btn").addEventListener("click", toggleEditMode);

  // Copy context
  document.getElementById("copy-context-btn").addEventListener("click", copyAllContext);

  // Ask AI modal
  document.getElementById("ask-cancel-btn").addEventListener("click", closeAskModal);
  document.getElementById("ask-submit-btn").addEventListener("click", submitQuestion);
  document.getElementById("ask-modal").addEventListener("click", (e) => {
    if (e.target.id === "ask-modal") closeAskModal();
  });
  document.getElementById("question-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitQuestion();
  });

  // Edit clip modal
  document.getElementById("edit-cancel-btn").addEventListener("click", closeEditModal);
  document.getElementById("edit-save-btn").addEventListener("click", saveEditClip);
  document.getElementById("edit-clip-modal").addEventListener("click", (e) => {
    if (e.target.id === "edit-clip-modal") closeEditModal();
  });

  // Mobile menu
  document.getElementById("mobile-menu-btn").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
    document.getElementById("sidebar-overlay").classList.toggle("active");
  });
  document.getElementById("sidebar-overlay").addEventListener("click", () => {
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("sidebar-overlay").classList.remove("active");
  });
}

// --- Data Loading ---

async function loadProjects() {
  try {
    const res = await fetch(`${API}/projects`);
    projects = await res.json();
    renderProjectList();
  } catch (e) {
    console.error("Failed to load projects:", e);
  }
}

async function loadClips() {
  showLoading(true);
  try {
    const url = currentProjectId === "all"
      ? `${API}/clips?limit=1000`
      : `${API}/clips?limit=1000&project_id=${currentProjectId}`;
    const res = await fetch(url);
    const data = await res.json();
    allClips = data.clips || [];
    applyFilters();
    showLoading(false);
  } catch (e) {
    console.error("Failed to load clips:", e);
    document.getElementById("loading-state").innerHTML =
      '<span style="color:var(--danger)">Failed to connect to backend. Is it running?</span>';
  }
}

// --- Project Management ---

function renderProjectList() {
  const list = document.getElementById("project-list");
  const allCount = allClips.length;

  list.innerHTML = `
    <div class="project-item ${currentProjectId === "all" ? "active" : ""}" data-id="all">
      <div class="dot" style="background: var(--accent)"></div>
      <span>All Clips</span>
      <span class="clip-count">${allCount}</span>
    </div>
  `;

  projects.forEach((p, i) => {
    const color = DOT_COLORS[i % DOT_COLORS.length];
    const item = document.createElement("div");
    item.className = `project-item ${currentProjectId === p.id ? "active" : ""}`;
    item.dataset.id = p.id;
    item.innerHTML = `
      <div class="dot" style="background: ${color}"></div>
      <span>${esc(p.name)}</span>
      <span class="clip-count">${p.clip_count || 0}</span>
      <button class="delete-btn" title="Delete project">&times;</button>
    `;
    list.appendChild(item);
  });

  // Bind clicks
  list.querySelectorAll(".project-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      if (e.target.classList.contains("delete-btn")) return;
      selectProject(item.dataset.id);
    });
  });

  list.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.closest(".project-item").dataset.id;
      deleteProject(id);
    });
  });
}

async function selectProject(id) {
  currentProjectId = id;
  currentPage = 0;

  const proj = projects.find((p) => p.id === id);
  document.getElementById("current-project-title").textContent =
    id === "all" ? "All Clips" : (proj ? proj.name : "Unknown");

  document.querySelectorAll(".project-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.id === id);
  });

  // Close mobile sidebar
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.remove("active");

  await loadClips();
}

async function createProject() {
  const name = document.getElementById("project-name-input").value.trim();
  const desc = document.getElementById("project-desc-input").value.trim();
  if (!name) return;

  try {
    const res = await fetch(`${API}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name, description: desc || null }),
    });
    if (!res.ok) {
      const errData = await res.text();
      console.error("Create project failed:", res.status, errData);
      throw new Error(`Server returned ${res.status}`);
    }
    closeCreateModal();
    await loadProjects();
    toast("Project created", false);
  } catch (e) {
    console.error("Create project error:", e);
    toast("Failed to create project", true);
  }
}

async function deleteProject(id) {
  if (!confirm("Delete this project and all its clips?")) return;
  try {
    await fetch(`${API}/projects/${id}`, { method: "DELETE" });
    if (currentProjectId === id) currentProjectId = "all";
    await Promise.all([loadProjects(), loadClips()]);
    document.getElementById("current-project-title").textContent =
      currentProjectId === "all" ? "All Clips" : "";
    toast("Project deleted", false);
  } catch (e) {
    toast("Failed to delete project", true);
  }
}

function closeCreateModal() {
  document.getElementById("create-project-modal").classList.remove("active");
  document.getElementById("project-name-input").value = "";
  document.getElementById("project-desc-input").value = "";
}

// --- Filtering & Search ---

function applyFilters() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  filteredClips = allClips.filter((clip) => {
    const d = new Date(clip.timestamp);
    if (currentFilter === "today") return d >= today;
    if (currentFilter === "week") return d >= weekAgo;
    return true;
  });

  // Apply media type filter
  if (currentMediaFilter) {
    filteredClips = filteredClips.filter((c) => (c.media_type || "text") === currentMediaFilter);
  }

  // Apply search query
  const q = document.getElementById("search-input").value.toLowerCase().trim();
  if (q) {
    filteredClips = filteredClips.filter(
      (c) =>
        (c.text || "").toLowerCase().includes(q) ||
        (c.title || "").toLowerCase().includes(q) ||
        (c.url || "").toLowerCase().includes(q)
    );
  }

  currentPage = 0;
  updateStats();
  renderClips();
  renderProjectList();
}

function handleSearch() {
  applyFilters();
}

// --- Stats ---

function updateStats() {
  const clips = filteredClips;
  const totalWords = clips.reduce((s, c) => s + (c.word_count || 0), 0);
  const domains = new Set(clips.map((c) => c.domain).filter(Boolean));
  const estTokens = Math.round(totalWords * 1.3);

  document.getElementById("stat-clips").textContent = clips.length;
  document.getElementById("stat-words").textContent = totalWords.toLocaleString();
  document.getElementById("stat-domains").textContent = domains.size;
  document.getElementById("stat-tokens").textContent = `~${estTokens.toLocaleString()}`;
}

// --- Rendering ---

function showLoading(show) {
  document.getElementById("loading-state").style.display = show ? "flex" : "none";
  document.getElementById("empty-state").style.display = "none";
  if (show) document.getElementById("clips-grid").innerHTML = "";
}

function renderClips() {
  const grid = document.getElementById("clips-grid");
  const pagination = document.getElementById("pagination");
  const emptyState = document.getElementById("empty-state");

  if (filteredClips.length === 0) {
    grid.innerHTML = "";
    emptyState.style.display = "block";
    pagination.style.display = "none";
    return;
  }

  emptyState.style.display = "none";
  const start = currentPage * PER_PAGE;
  const slice = filteredClips.slice(start, start + PER_PAGE);
  grid.innerHTML = "";

  slice.forEach((clip) => {
    grid.appendChild(createClipCard(clip));
  });

  if (filteredClips.length > PER_PAGE) {
    pagination.style.display = "flex";
    document.getElementById("prev-btn").disabled = currentPage === 0;
    document.getElementById("next-btn").disabled = (currentPage + 1) * PER_PAGE >= filteredClips.length;
    document.getElementById("page-info").textContent =
      `Page ${currentPage + 1} of ${Math.ceil(filteredClips.length / PER_PAGE)}`;
  } else {
    pagination.style.display = "none";
  }
}

function createClipCard(clip) {
  const card = document.createElement("div");
  card.className = "clip-card";

  const date = new Date(clip.timestamp);
  const fmtDate = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const fmtTime = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const mediaType = clip.media_type || "text";
  const mediaBadgeLabels = { text: "Text", image: "Image", screenshot: "Screenshot", file: "File" };

  let actionsHtml = "";
  if (editMode) {
    actionsHtml = `
      <button class="btn btn-ghost edit-clip-btn" data-id="${clip.id}">
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10.5 1.5l2 2-8 8H2.5v-2z"/></svg>
        Edit
      </button>
      <button class="btn btn-danger delete-clip-btn" data-id="${clip.id}">
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="3" y1="3" x2="11" y2="11"/><line x1="11" y1="3" x2="3" y2="11"/></svg>
        Delete
      </button>
    `;
  } else {
    actionsHtml = `
      <button class="btn btn-ghost expand-btn" data-id="${clip.id}">Expand</button>
      <button class="btn btn-ghost ask-btn" data-id="${clip.id}">Ask AI</button>
      <button class="btn btn-ghost copy-btn" data-id="${clip.id}">Copy</button>
    `;
  }

  // Build preview HTML for screenshot/image clips
  let previewHtml = "";
  if (mediaType === "screenshot" && clip.screenshot_data) {
    previewHtml = `<div class="clip-card-preview"><img src="${esc(clip.screenshot_data)}" alt="Screenshot" loading="lazy" /></div>`;
  } else if (mediaType === "image" && clip.image_url) {
    previewHtml = `<div class="clip-card-preview"><a href="${esc(clip.image_url)}" target="_blank"><img src="${esc(clip.image_url)}" alt="${esc(clip.text || 'Image')}" loading="lazy" /></a></div>`;
  }

  // File name display
  let fileInfo = "";
  if (mediaType === "file" && clip.file_name) {
    fileInfo = `<span style="color:#30d158;">${esc(clip.file_name)}</span>`;
  }

  card.innerHTML = `
    <div class="clip-card-header">
      <div class="clip-card-title">${esc(clip.title || "Untitled Clip")}</div>
      <span class="media-badge type-${mediaType}">${mediaBadgeLabels[mediaType] || "Text"}</span>
    </div>
    <div class="clip-card-meta">
      <span>${fmtDate} ${fmtTime}</span>
      <span>${esc(clip.domain || "")}</span>
      ${fileInfo ? fileInfo : `<span>${clip.word_count || 0} words</span>`}
    </div>
    ${previewHtml}
    ${clip.text ? `<div class="clip-card-text" id="text-${clip.id}">${esc(clip.text)}</div>` : ""}
    <a href="${esc(clip.url)}" target="_blank" class="clip-card-url">${esc(clip.url)}</a>
    <div class="clip-card-actions">${actionsHtml}</div>
  `;

  // Bind action buttons
  card.querySelectorAll(".expand-btn").forEach((b) =>
    b.addEventListener("click", () => toggleExpand(clip.id, b))
  );
  card.querySelectorAll(".copy-btn").forEach((b) =>
    b.addEventListener("click", () => copyText(clip.text))
  );
  card.querySelectorAll(".ask-btn").forEach((b) =>
    b.addEventListener("click", () => openAskModal(clip))
  );
  card.querySelectorAll(".edit-clip-btn").forEach((b) =>
    b.addEventListener("click", () => openEditModal(clip))
  );
  card.querySelectorAll(".delete-clip-btn").forEach((b) =>
    b.addEventListener("click", () => deleteClip(clip.id))
  );

  return card;
}

// --- Actions ---

function toggleExpand(id, btn) {
  const el = document.getElementById(`text-${id}`);
  if (!el) return;
  el.classList.toggle("expanded");
  btn.textContent = el.classList.contains("expanded") ? "Collapse" : "Expand";
}

function toggleEditMode() {
  editMode = !editMode;
  document.getElementById("edit-badge").style.display = editMode ? "inline-block" : "none";
  document.getElementById("toggle-edit-btn").innerHTML = editMode
    ? '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="2 7 5.5 10.5 12 3.5"/></svg> Done'
    : '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10.5 1.5l2 2-8 8H2.5v-2z"/></svg> Edit';
  renderClips();
}

async function deleteClip(id) {
  if (!confirm("Delete this clip?")) return;
  try {
    await fetch(`${API}/clips/${id}`, { method: "DELETE" });
    allClips = allClips.filter((c) => c.id !== id);
    applyFilters();
    await loadProjects();
    toast("Clip deleted", false);
  } catch (e) {
    toast("Failed to delete clip", true);
  }
}

function openEditModal(clip) {
  editingClipId = clip.id;
  document.getElementById("edit-clip-text").value = clip.text;
  document.getElementById("edit-clip-modal").classList.add("active");
  document.getElementById("edit-clip-text").focus();
}

function closeEditModal() {
  document.getElementById("edit-clip-modal").classList.remove("active");
  editingClipId = null;
}

async function saveEditClip() {
  const text = document.getElementById("edit-clip-text").value.trim();
  if (!text || !editingClipId) return;

  const clip = allClips.find((c) => c.id === editingClipId);
  if (!clip) return;

  try {
    await fetch(`${API}/clips/${editingClipId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, url: clip.url }),
    });
    clip.text = text;
    clip.word_count = text.split(/\s+/).length;
    closeEditModal();
    applyFilters();
    toast("Clip updated", false);
  } catch (e) {
    toast("Failed to update clip", true);
  }
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(
    () => toast("Copied to clipboard", false),
    () => toast("Failed to copy", true)
  );
}

async function copyAllContext() {
  if (currentProjectId === "all") {
    // Copy all visible clips as flat format (no bridge for multi-project)
    const text = filteredClips
      .map((c, i) => `--- Clip ${i + 1} ---\nSource: ${c.title} (${c.url})\n\n${c.text}\n`)
      .join("\n");
    copyText(text);
    return;
  }

  try {
    const compact = document.getElementById("compact-toggle").checked;
    const res = await fetch(`${API}/projects/${currentProjectId}/bridge?format=markdown&compact=${compact}`);
    const data = await res.json();
    copyText(data.bridge || "No clips.");
    toast(`Copied to clipboard${compact ? " (compact)" : ""}`, false);
  } catch (e) {
    toast("Failed to export", true);
  }
}

// --- Ask AI ---

function openAskModal(clip) {
  window._askClip = clip;
  document.getElementById("ask-modal").classList.add("active");
  document.getElementById("question-input").focus();
  document.getElementById("answer-box").style.display = "none";
}

function closeAskModal() {
  document.getElementById("ask-modal").classList.remove("active");
  document.getElementById("question-input").value = "";
  document.getElementById("answer-box").style.display = "none";
  window._askClip = null;
}

async function submitQuestion() {
  const q = document.getElementById("question-input").value.trim();
  if (!q) return;

  const btn = document.getElementById("ask-submit-btn");
  btn.disabled = true;
  btn.textContent = "Thinking...";

  try {
    const res = await fetch(`${API}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q }),
    });
    const data = await res.json();
    const box = document.getElementById("answer-box");
    box.innerHTML = `<strong style="color:var(--accent)">Q:</strong> ${esc(q)}<br><br><strong style="color:var(--success)">A:</strong> ${esc(data.answer)}`;
    box.style.display = "block";
    document.getElementById("question-input").value = "";
  } catch (e) {
    document.getElementById("answer-box").innerHTML = `<span style="color:var(--danger)">Error: ${esc(e.message)}</span>`;
    document.getElementById("answer-box").style.display = "block";
  } finally {
    btn.disabled = false;
    btn.textContent = "Ask";
  }
}

// --- Utilities ---

function esc(text) {
  if (!text) return "";
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

function toast(msg, isError) {
  const t = document.createElement("div");
  t.className = "toast";
  t.style.background = isError ? "var(--danger)" : "var(--success)";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity 0.3s"; }, 2500);
  setTimeout(() => t.remove(), 2800);
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
