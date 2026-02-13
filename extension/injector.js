/**
 * Context Clipper — LLM Chat Sidebar
 * Save chats + inject context on ChatGPT, Claude, Gemini
 */

const CC_API = "http://localhost:8001";

let bridgeUI = null;
let isExpanded = false;
let projects = [];
let selectedProjectId = null;
let exportedContext = null;
let capturedChat = null;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => setTimeout(createBridgeUI, 1800));
} else {
  setTimeout(createBridgeUI, 1800);
}

// --- API layer ---

async function ccFetch(url, opts) {
  try {
    const res = await fetch(url, opts);
    if (res.ok) return await res.json();
    throw new Error(`${res.status}`);
  } catch {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ action: "proxyFetch", url, options: opts }, (r) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (r?.success) resolve(r.data);
          else reject(new Error(r?.error || "Failed"));
        });
      } catch (e) { reject(e); }
    });
  }
}

function sendBg(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (r) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else if (r?.success) resolve(r.data);
      else reject(new Error(r?.error || "Failed"));
    });
  });
}

// --- Build UI ---

function createBridgeUI() {
  if (bridgeUI || document.getElementById("cc-root")) return;

  const s = document.createElement("style");
  s.id = "cc-styles";
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

    #cc-root {
      position: fixed;
      top: 50%;
      right: 0;
      transform: translateY(-50%);
      z-index: 2147483647;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
      font-size: 13px;
      color: #f5f5f7;
      -webkit-font-smoothing: antialiased;
      display: flex;
      align-items: center;
      line-height: 1.4;
    }

    #cc-root *, #cc-root *::before, #cc-root *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    /* ── Toggle ── */
    .cc-toggle {
      width: 28px;
      height: 56px;
      background: rgba(28, 28, 30, 0.95);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.08);
      border-right: none;
      border-radius: 10px 0 0 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 5px;
      transition: all 0.2s ease;
      flex-shrink: 0;
    }

    .cc-toggle:hover {
      background: rgba(44, 44, 46, 0.95);
      width: 32px;
    }

    .cc-toggle svg {
      width: 13px;
      height: 13px;
      color: rgba(255,255,255,0.35);
      transition: color 0.15s;
    }

    .cc-toggle:hover svg { color: #0a84ff; }

    .cc-toggle-dot {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: #0a84ff;
      opacity: 0.8;
    }

    /* ── Panel ── */
    .cc-panel {
      width: 0;
      height: 520px;
      max-height: 82vh;
      background: #000;
      border: 1px solid rgba(255,255,255,0.08);
      border-right: none;
      border-radius: 16px 0 0 16px;
      overflow: hidden;
      transition: width 0.25s cubic-bezier(0.32, 0.72, 0, 1);
      display: flex;
      flex-direction: column;
      box-shadow: -8px 0 48px rgba(0,0,0,0.5);
    }

    .cc-panel.open { width: 310px; }

    /* ── Header ── */
    .cc-hdr {
      padding: 16px 18px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
      background: rgba(255,255,255,0.02);
    }

    .cc-hdr-left {
      display: flex;
      align-items: center;
      gap: 9px;
    }

    .cc-logo {
      width: 24px; height: 24px;
      background: #0a84ff;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .cc-logo svg { width: 13px; height: 13px; color: white; }

    .cc-brand {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: -0.3px;
      white-space: nowrap;
    }

    .cc-close {
      width: 22px; height: 22px;
      background: rgba(255,255,255,0.05);
      border: none; border-radius: 6px;
      color: #636366;
      cursor: pointer;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.1s;
    }

    .cc-close:hover {
      background: rgba(255,255,255,0.08);
      color: #aeaeb2;
    }

    /* ── Segmented Control ── */
    .cc-seg {
      display: flex;
      margin: 0 16px;
      background: rgba(255,255,255,0.04);
      border-radius: 8px;
      padding: 3px;
      flex-shrink: 0;
    }

    .cc-seg-btn {
      flex: 1;
      padding: 7px 0;
      background: none;
      border: none;
      color: #636366;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      letter-spacing: 0.1px;
      border-radius: 6px;
      transition: all 0.15s ease;
    }

    .cc-seg-btn:hover { color: #aeaeb2; }

    .cc-seg-btn.on {
      background: rgba(255,255,255,0.08);
      color: #f5f5f7;
      box-shadow: 0 1px 4px rgba(0,0,0,0.2);
    }

    /* ── Sections ── */
    .cc-section {
      display: none;
      flex: 1;
      flex-direction: column;
      overflow: hidden;
    }

    .cc-section.on { display: flex; }

    /* ── Content area ── */
    .cc-content {
      flex: 1;
      padding: 16px 18px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .cc-content::-webkit-scrollbar { width: 3px; }
    .cc-content::-webkit-scrollbar-track { background: transparent; }
    .cc-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 2px; }

    /* ── Form elements ── */
    .cc-field-label {
      font-size: 11px;
      font-weight: 600;
      color: #636366;
      margin-bottom: 6px;
      letter-spacing: 0.1px;
    }

    .cc-select {
      width: 100%;
      padding: 9px 30px 9px 12px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 8px;
      color: #f5f5f7;
      font-size: 12px;
      font-family: inherit;
      font-weight: 500;
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg width='8' height='5' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23636366' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 10px center;
      transition: all 0.15s ease;
    }

    .cc-select:focus {
      outline: none;
      border-color: rgba(10, 132, 255, 0.5);
      background-color: rgba(255,255,255,0.06);
    }

    .cc-select option {
      background: #1c1c1e;
      color: #f5f5f7;
    }

    /* ── Stats grid ── */
    .cc-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .cc-metric {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.04);
      border-radius: 10px;
      padding: 12px;
      text-align: center;
    }

    .cc-metric-num {
      font-size: 20px;
      font-weight: 800;
      color: #f5f5f7;
      letter-spacing: -0.8px;
      line-height: 1;
    }

    .cc-metric-label {
      font-size: 9px;
      color: #48484a;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 4px;
      font-weight: 700;
    }

    /* ── Preview box ── */
    .cc-preview-box {
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.04);
      border-radius: 10px;
      padding: 12px;
      max-height: 120px;
      overflow-y: auto;
      font-size: 11px;
      line-height: 1.6;
      color: #8e8e93;
    }

    .cc-preview-box::-webkit-scrollbar { width: 3px; }
    .cc-preview-box::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 2px; }

    .cc-preview-placeholder {
      color: #3a3a3c;
      font-style: italic;
      text-align: center;
      padding: 20px 0;
    }

    /* ── Info row ── */
    .cc-info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #48484a;
      font-weight: 500;
    }

    /* ── Toast / message ── */
    .cc-toast {
      font-size: 11px;
      text-align: center;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 6px;
      background: rgba(48, 209, 88, 0.1);
      color: #30d158;
    }

    .cc-toast.bad {
      background: rgba(255, 69, 58, 0.1);
      color: #ff453a;
    }

    /* ── Footer ── */
    .cc-footer {
      padding: 12px 18px 14px;
      border-top: 1px solid rgba(255,255,255,0.04);
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    /* ── Buttons ── */
    .cc-btn-primary {
      width: 100%;
      padding: 10px;
      border: none;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      background: #0a84ff;
      color: white;
      transition: all 0.15s ease;
      font-family: inherit;
      letter-spacing: -0.2px;
    }

    .cc-btn-primary:hover { background: #3395ff; }
    .cc-btn-primary:active { transform: scale(0.98); opacity: 0.9; }
    .cc-btn-primary:disabled { opacity: 0.25; cursor: not-allowed; transform: none; }
    .cc-btn-primary:disabled:hover { background: #0a84ff; }

    .cc-btn-secondary {
      width: 100%;
      padding: 10px;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      background: rgba(255,255,255,0.04);
      color: #f5f5f7;
      transition: all 0.15s ease;
      font-family: inherit;
      letter-spacing: -0.2px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .cc-btn-secondary:hover {
      background: rgba(255,255,255,0.07);
      border-color: rgba(255,255,255,0.12);
    }

    .cc-btn-secondary:active { transform: scale(0.98); }

    .cc-btn-secondary svg {
      width: 14px;
      height: 14px;
      opacity: 0.5;
    }

    /* ── Divider ── */
    .cc-divider {
      height: 1px;
      background: rgba(255,255,255,0.04);
      margin: 2px 0;
    }
  `;

  bridgeUI = document.createElement("div");
  bridgeUI.id = "cc-root";
  bridgeUI.innerHTML = `
    <div class="cc-panel" id="cc-panel">

      <!-- Header -->
      <div class="cc-hdr">
        <div class="cc-hdr-left">
          <div class="cc-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
            </svg>
          </div>
          <span class="cc-brand">Context Clipper</span>
        </div>
        <button class="cc-close" id="cc-close">&times;</button>
      </div>

      <!-- Segmented control -->
      <div class="cc-seg">
        <button class="cc-seg-btn on" data-sec="save">Save Chat</button>
        <button class="cc-seg-btn" data-sec="inject">Inject</button>
      </div>

      <!-- ═══ SAVE SECTION ═══ -->
      <div class="cc-section on" id="sec-save">
        <div class="cc-content">

          <div>
            <div class="cc-field-label">Save to Project</div>
            <select class="cc-select" id="save-project">
              <option value="">No project (unsorted)</option>
            </select>
          </div>

          <div>
            <div class="cc-field-label">Conversation</div>
            <div class="cc-preview-box" id="chat-preview">
              <div class="cc-preview-placeholder">Click "Capture Chat" below to scan this conversation</div>
            </div>
          </div>

          <div class="cc-info-row" id="chat-info" style="display:none;">
            <span id="chat-msg-count">0 messages</span>
            <span id="chat-word-count">0 words</span>
          </div>

          <div class="cc-toast" id="save-toast" style="display:none;"></div>

        </div>
        <div class="cc-footer">
          <button class="cc-btn-secondary" id="btn-capture">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            Capture Chat
          </button>
          <button class="cc-btn-primary" id="btn-save" disabled>Save Conversation</button>
        </div>
      </div>

      <!-- ═══ INJECT SECTION ═══ -->
      <div class="cc-section" id="sec-inject">
        <div class="cc-content">

          <div>
            <div class="cc-field-label">From Project</div>
            <select class="cc-select" id="inject-project">
              <option value="">Choose project...</option>
            </select>
          </div>

          <div class="cc-grid" id="inject-stats" style="display:none;">
            <div class="cc-metric">
              <div class="cc-metric-num" id="inject-clips">0</div>
              <div class="cc-metric-label">Clips</div>
            </div>
            <div class="cc-metric">
              <div class="cc-metric-num" id="inject-tokens">~0</div>
              <div class="cc-metric-label">Tokens</div>
            </div>
          </div>

          <div class="cc-preview-box" id="inject-preview" style="display:none;"></div>

          <div class="cc-toast" id="inject-toast" style="display:none;"></div>

        </div>
        <div class="cc-footer">
          <button class="cc-btn-primary" id="btn-inject" disabled>Inject into Chat</button>
        </div>
      </div>

    </div>

    <!-- Toggle tab -->
    <div class="cc-toggle" id="cc-toggle">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
      </svg>
      <div class="cc-toggle-dot"></div>
    </div>
  `;

  document.head.appendChild(s);
  document.body.appendChild(bridgeUI);

  // Segment switching
  bridgeUI.querySelectorAll(".cc-seg-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      bridgeUI.querySelectorAll(".cc-seg-btn").forEach(b => b.classList.remove("on"));
      bridgeUI.querySelectorAll(".cc-section").forEach(c => c.classList.remove("on"));
      btn.classList.add("on");
      document.getElementById(`sec-${btn.dataset.sec}`).classList.add("on");
    });
  });

  document.getElementById("cc-toggle").addEventListener("click", togglePanel);
  document.getElementById("cc-close").addEventListener("click", closePanel);
  document.getElementById("inject-project").addEventListener("change", onInjectProjectChange);
  document.getElementById("btn-inject").addEventListener("click", injectContext);
  document.getElementById("btn-capture").addEventListener("click", captureConversation);
  document.getElementById("btn-save").addEventListener("click", saveConversation);

  loadAllProjects();
}

function togglePanel() {
  isExpanded = !isExpanded;
  document.getElementById("cc-panel").classList.toggle("open", isExpanded);
  if (isExpanded) loadAllProjects();
}

function closePanel() {
  isExpanded = false;
  document.getElementById("cc-panel").classList.remove("open");
}

// --- Projects ---

async function loadAllProjects() {
  try {
    const data = await ccFetch(`${CC_API}/projects`);
    projects = data || [];
  } catch {
    projects = [];
  }

  ["save-project", "inject-project"].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;

    const placeholder = id === "save-project" ? "No project (unsorted)" : "Choose project...";

    if (projects.length === 0) {
      sel.innerHTML = `<option value="">${placeholder}</option>`;
      return;
    }

    sel.innerHTML = `<option value="">${placeholder}</option>`;
    projects.forEach(p => {
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = `${p.name} (${p.clip_count || 0})`;
      sel.appendChild(o);
    });

    if (selectedProjectId) sel.value = selectedProjectId;
  });
}

// ══════════════════════
//  SAVE CHAT
// ══════════════════════

function captureConversation() {
  const msgs = scrapeChatMessages();

  if (!msgs || msgs.length === 0) {
    toast("save-toast", "No messages found on this page", true);
    return;
  }

  capturedChat = msgs.map(m => `[${m.role}]: ${m.text}`).join("\n\n");
  const words = capturedChat.split(/\s+/).length;

  document.getElementById("chat-preview").textContent =
    capturedChat.substring(0, 500) + (capturedChat.length > 500 ? "..." : "");
  document.getElementById("chat-info").style.display = "flex";
  document.getElementById("chat-msg-count").textContent = `${msgs.length} messages`;
  document.getElementById("chat-word-count").textContent = `${words.toLocaleString()} words`;

  document.getElementById("btn-save").disabled = false;
  toast("save-toast", `Captured ${msgs.length} messages`, false);
}

async function saveConversation() {
  if (!capturedChat) return;

  const projectId = document.getElementById("save-project").value || null;
  const btn = document.getElementById("btn-save");

  btn.disabled = true;
  btn.textContent = "Saving...";

  try {
    await sendBg({
      action: "saveClip",
      text: capturedChat,
      url: window.location.href,
      title: document.title + " (Full Chat)",
      projectId
    });

    toast("save-toast", "Chat saved!", false);
    await loadAllProjects();
  } catch (e) {
    toast("save-toast", e.message || "Failed to save", true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Conversation";
  }
}

// ══════════════════════
//  CHAT SCRAPING
// ══════════════════════

function scrapeChatMessages() {
  const host = window.location.hostname;
  if (host.includes("chatgpt.com") || host.includes("chat.openai.com")) return scrapeChatGPT();
  if (host.includes("claude.ai")) return scrapeClaude();
  if (host.includes("gemini.google.com")) return scrapeGemini();
  return scrapeGeneric();
}

function scrapeChatGPT() {
  const msgs = [];
  const turns = document.querySelectorAll("[data-message-author-role]");
  if (turns.length) {
    turns.forEach(el => {
      const role = el.getAttribute("data-message-author-role") === "user" ? "You" : "Assistant";
      const text = el.innerText.trim();
      if (text) msgs.push({ role, text });
    });
    return msgs;
  }
  document.querySelectorAll("article").forEach((a, i) => {
    const text = a.innerText.trim();
    if (text) msgs.push({ role: i % 2 === 0 ? "You" : "Assistant", text });
  });
  return msgs;
}

function scrapeClaude() {
  const msgs = [];
  const human = document.querySelectorAll('[data-testid="human-turn"]');
  const ai = document.querySelectorAll('[data-testid="ai-turn"]');

  if (human.length || ai.length) {
    const all = [];
    human.forEach(el => all.push({ role: "You", el, y: el.getBoundingClientRect().top }));
    ai.forEach(el => all.push({ role: "Assistant", el, y: el.getBoundingClientRect().top }));
    all.sort((a, b) => a.y - b.y);
    all.forEach(t => {
      const text = t.el.innerText.trim();
      if (text) msgs.push({ role: t.role, text });
    });
    return msgs;
  }

  return scrapeGeneric();
}

function scrapeGemini() {
  const msgs = [];
  const q = document.querySelectorAll(".query-text, [data-query-text], .user-query");
  const r = document.querySelectorAll(".model-response-text, .response-content, .markdown");

  if (q.length) {
    const n = Math.max(q.length, r.length);
    for (let i = 0; i < n; i++) {
      if (q[i]?.innerText.trim()) msgs.push({ role: "You", text: q[i].innerText.trim() });
      if (r[i]?.innerText.trim()) msgs.push({ role: "Assistant", text: r[i].innerText.trim() });
    }
    return msgs;
  }
  return scrapeGeneric();
}

function scrapeGeneric() {
  const text = document.body.innerText;
  return text.length > 50 ? [{ role: "Page", text: text.substring(0, 50000) }] : [];
}

// ══════════════════════
//  INJECT CONTEXT
// ══════════════════════

async function onInjectProjectChange() {
  const id = document.getElementById("inject-project").value;
  selectedProjectId = id;

  const stats = document.getElementById("inject-stats");
  const preview = document.getElementById("inject-preview");
  const btn = document.getElementById("btn-inject");

  exportedContext = null;
  document.getElementById("inject-toast").style.display = "none";

  if (!id) {
    stats.style.display = "none";
    preview.style.display = "none";
    btn.disabled = true;
    return;
  }

  try {
    const data = await ccFetch(`${CC_API}/projects/${id}/export`);
    if (!data.context || data.context === "No clips in this project.") {
      stats.style.display = "none";
      preview.style.display = "none";
      btn.disabled = true;
      toast("inject-toast", "No clips in this project", true);
      return;
    }

    exportedContext = data.context;
    const words = exportedContext.split(/\s+/).length;

    document.getElementById("inject-clips").textContent = data.clip_count || 0;
    document.getElementById("inject-tokens").textContent = `~${Math.round(words * 1.3).toLocaleString()}`;
    stats.style.display = "grid";

    preview.textContent = exportedContext.substring(0, 250) + (exportedContext.length > 250 ? "..." : "");
    preview.style.display = "block";

    btn.disabled = false;
  } catch {
    toast("inject-toast", "Failed to load project", true);
    btn.disabled = true;
  }
}

async function injectContext() {
  if (!exportedContext) return;

  const el = findChatInput();
  if (!el) { toast("inject-toast", "Chat input not found", true); return; }

  putText(el, "Here is relevant context for our conversation:\n\n" + exportedContext);
  toast("inject-toast", "Context injected!", false);
  setTimeout(closePanel, 1200);
}

function findChatInput() {
  const h = window.location.hostname;
  if (h.includes("chatgpt.com") || h.includes("chat.openai.com"))
    return document.querySelector("#prompt-textarea") || document.querySelector('div[contenteditable="true"]') || document.querySelector("textarea");
  if (h.includes("claude.ai"))
    return document.querySelector('div.ProseMirror[contenteditable="true"]') || document.querySelector('[contenteditable="true"]');
  if (h.includes("gemini.google.com"))
    return document.querySelector('.ql-editor[contenteditable="true"]') || document.querySelector('[contenteditable="true"]');
  return document.querySelector('[contenteditable="true"]') || document.querySelector("textarea");
}

function putText(el, text) {
  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
      || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (set) set.call(el, text); else el.value = text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  } else if (el.getAttribute("contenteditable")) {
    el.focus();
    const s = window.getSelection(), r = document.createRange();
    r.selectNodeContents(el); s.removeAllRanges(); s.addRange(r);
    document.execCommand("insertText", false, text);
    if (!el.textContent) { el.textContent = text; el.dispatchEvent(new Event("input", { bubbles: true })); }
  }
  el.focus();
}

// ── Toasts ──

function toast(id, text, isError) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = "cc-toast" + (isError ? " bad" : "");
  el.style.display = "block";
  setTimeout(() => { el.style.display = "none"; }, 3500);
}
