/**
 * Context Clipper Injector
 * Side panel: save entire chats + inject saved context into LLM chat interfaces
 */

const CC_API = "http://localhost:8001";

let bridgeUI = null;
let isExpanded = false;
let projects = [];
let selectedProjectId = null;
let exportedContext = null;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => setTimeout(createBridgeUI, 1800));
} else {
  setTimeout(createBridgeUI, 1800);
}

// --- API ---

async function ccFetch(url, options) {
  try {
    const res = await fetch(url, options);
    if (res.ok) return await res.json();
    throw new Error(`HTTP ${res.status}`);
  } catch {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ action: "proxyFetch", url, options }, (resp) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (resp && resp.success) resolve(resp.data);
          else reject(new Error(resp?.error || "Failed"));
        });
      } catch (e) { reject(e); }
    });
  }
}

async function ccPost(url, body) {
  const options = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
  try {
    const res = await fetch(url, options);
    if (res.ok) return await res.json();
    throw new Error(`HTTP ${res.status}`);
  } catch {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: "saveClip", ...body, url: body.url || window.location.href, title: body.title || document.title },
        (resp) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (resp && resp.success) resolve(resp.data);
          else reject(new Error(resp?.error || "Failed"));
        }
      );
    });
  }
}

// --- UI ---

function createBridgeUI() {
  if (bridgeUI || document.getElementById("cc-root")) return;

  const style = document.createElement("style");
  style.id = "cc-injector-styles";
  style.textContent = `
    #cc-root {
      position: fixed;
      top: 50%;
      right: 0;
      transform: translateY(-50%);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
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

    .cc-tab {
      width: 32px;
      height: 64px;
      background: #1c1c1e;
      border: 1px solid rgba(255,255,255,0.1);
      border-right: none;
      border-radius: 8px 0 0 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 6px;
      transition: all 0.15s ease;
      flex-shrink: 0;
      opacity: 0.85;
    }

    .cc-tab:hover { opacity: 1; background: #2c2c2e; }
    .cc-tab svg { width: 14px; height: 14px; color: #86868b; transition: color 0.12s; }
    .cc-tab:hover svg { color: #0a84ff; }
    .cc-tab-dot { width: 4px; height: 4px; border-radius: 50%; background: #0a84ff; }

    .cc-panel {
      width: 0;
      height: 480px;
      max-height: 80vh;
      background: #1c1c1e;
      border: 1px solid rgba(255,255,255,0.1);
      border-right: none;
      border-radius: 12px 0 0 12px;
      overflow: hidden;
      transition: width 0.22s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      flex-direction: column;
      box-shadow: -4px 0 32px rgba(0,0,0,0.45);
    }

    .cc-panel.open { width: 290px; }

    .cc-hdr {
      padding: 14px 16px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }

    .cc-hdr-left { display: flex; align-items: center; gap: 8px; }

    .cc-hdr-icon {
      width: 22px; height: 22px; background: #0a84ff; border-radius: 5px;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .cc-hdr-icon svg { width: 12px; height: 12px; color: white; }

    .cc-hdr-title { font-size: 12px; font-weight: 700; letter-spacing: -0.2px; white-space: nowrap; }

    .cc-x {
      background: none; border: none; color: #48484a; cursor: pointer;
      font-size: 16px; line-height: 1; padding: 2px 5px; border-radius: 4px; transition: all 0.1s;
    }
    .cc-x:hover { color: #86868b; background: rgba(255,255,255,0.06); }

    /* Tabs */
    .cc-tabs {
      display: flex;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      flex-shrink: 0;
    }

    .cc-tab-btn {
      flex: 1;
      padding: 9px 0;
      background: none;
      border: none;
      color: #48484a;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      letter-spacing: 0.2px;
      transition: all 0.12s;
      border-bottom: 2px solid transparent;
    }

    .cc-tab-btn:hover { color: #86868b; }

    .cc-tab-btn.active {
      color: #0a84ff;
      border-bottom-color: #0a84ff;
    }

    .cc-tab-content {
      display: none;
      flex: 1;
      overflow-y: auto;
      flex-direction: column;
    }

    .cc-tab-content.active {
      display: flex;
    }

    /* Body */
    .cc-body {
      padding: 14px 16px;
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .cc-body::-webkit-scrollbar { width: 3px; }
    .cc-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }

    .cc-lbl {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.6px; color: #48484a; margin-bottom: 4px;
    }

    .cc-sel {
      width: 100%; padding: 8px 28px 8px 10px; background: #000;
      border: 1px solid rgba(255,255,255,0.1); border-radius: 7px;
      color: #f5f5f7; font-size: 12px; font-family: inherit; font-weight: 500;
      cursor: pointer; appearance: none; -webkit-appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg width='8' height='5' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%2386868b' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 9px center;
      transition: border-color 0.12s;
    }
    .cc-sel:focus { outline: none; border-color: #0a84ff; }
    .cc-sel option { background: #1c1c1e; color: #f5f5f7; }

    .cc-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }

    .cc-sbox {
      background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05);
      border-radius: 7px; padding: 8px; text-align: center;
    }
    .cc-sval { font-size: 16px; font-weight: 800; color: #f5f5f7; letter-spacing: -0.5px; line-height: 1.1; }
    .cc-slbl { font-size: 9px; color: #48484a; text-transform: uppercase; letter-spacing: 0.4px; margin-top: 2px; font-weight: 600; }

    .cc-prev {
      max-height: 80px; overflow-y: auto; background: #000; border-radius: 7px;
      padding: 8px 10px; font-size: 11px; line-height: 1.5; color: #86868b;
      border: 1px solid rgba(255,255,255,0.06);
    }
    .cc-prev::-webkit-scrollbar { width: 3px; }
    .cc-prev::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

    .cc-msg { font-size: 11px; text-align: center; color: #30d158; font-weight: 600; padding: 2px 0; }
    .cc-msg.err { color: #ff453a; }

    .cc-foot {
      padding: 10px 16px;
      border-top: 1px solid rgba(255,255,255,0.06);
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .cc-btn {
      width: 100%; padding: 9px; border: none; border-radius: 8px;
      font-size: 12px; font-weight: 600; cursor: pointer; background: #0a84ff;
      color: white; transition: all 0.12s ease; font-family: inherit; letter-spacing: -0.1px;
    }
    .cc-btn:hover { background: #409cff; }
    .cc-btn:active { transform: scale(0.98); }
    .cc-btn:disabled { opacity: 0.3; cursor: not-allowed; transform: none; }
    .cc-btn:disabled:hover { background: #0a84ff; }

    .cc-btn-outline {
      width: 100%; padding: 9px; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px;
      font-size: 12px; font-weight: 600; cursor: pointer; background: none;
      color: #f5f5f7; transition: all 0.12s ease; font-family: inherit; letter-spacing: -0.1px;
    }
    .cc-btn-outline:hover { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.2); }
    .cc-btn-outline:active { transform: scale(0.98); }

    /* Chat preview in save tab */
    .cc-chat-preview {
      background: #000;
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 8px;
      padding: 10px;
      max-height: 150px;
      overflow-y: auto;
      font-size: 11px;
      line-height: 1.5;
      color: #86868b;
    }

    .cc-chat-preview::-webkit-scrollbar { width: 3px; }
    .cc-chat-preview::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

    .cc-chat-info {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #48484a;
      font-weight: 500;
    }
  `;

  bridgeUI = document.createElement("div");
  bridgeUI.id = "cc-root";
  bridgeUI.innerHTML = `
    <div class="cc-panel" id="cc-panel">
      <div class="cc-hdr">
        <div class="cc-hdr-left">
          <div class="cc-hdr-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
            </svg>
          </div>
          <span class="cc-hdr-title">Context Clipper</span>
        </div>
        <button class="cc-x" id="cc-close">&times;</button>
      </div>

      <div class="cc-tabs">
        <button class="cc-tab-btn active" data-tab="save">Save Chat</button>
        <button class="cc-tab-btn" data-tab="inject">Inject</button>
      </div>

      <!-- SAVE CHAT TAB -->
      <div class="cc-tab-content active" id="cc-tab-save">
        <div class="cc-body">
          <div>
            <div class="cc-lbl">Save to Project</div>
            <select class="cc-sel" id="cc-save-sel">
              <option value="">Loading...</option>
            </select>
          </div>
          <div>
            <div class="cc-lbl">Chat Preview</div>
            <div class="cc-chat-preview" id="cc-chat-preview">Click "Capture Chat" to scan this conversation.</div>
          </div>
          <div class="cc-chat-info" id="cc-chat-info" style="display:none;">
            <span id="cc-chat-msgs">0 messages</span>
            <span id="cc-chat-words">0 words</span>
          </div>
          <div class="cc-msg" id="cc-save-msg" style="display:none;"></div>
        </div>
        <div class="cc-foot">
          <button class="cc-btn-outline" id="cc-capture">
            <span style="display:inline-flex;align-items:center;gap:5px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Capture Chat
            </span>
          </button>
          <button class="cc-btn" id="cc-save-chat" disabled>Save to Context Clipper</button>
        </div>
      </div>

      <!-- INJECT TAB -->
      <div class="cc-tab-content" id="cc-tab-inject">
        <div class="cc-body">
          <div>
            <div class="cc-lbl">Project</div>
            <select class="cc-sel" id="cc-sel">
              <option value="">Loading...</option>
            </select>
          </div>
          <div class="cc-stats" id="cc-stats" style="display:none;">
            <div class="cc-sbox">
              <div class="cc-sval" id="cc-clips">0</div>
              <div class="cc-slbl">Clips</div>
            </div>
            <div class="cc-sbox">
              <div class="cc-sval" id="cc-tokens">~0</div>
              <div class="cc-slbl">Tokens</div>
            </div>
          </div>
          <div class="cc-prev" id="cc-prev" style="display:none;"></div>
          <div class="cc-msg" id="cc-msg" style="display:none;"></div>
        </div>
        <div class="cc-foot">
          <button class="cc-btn" id="cc-inject" disabled>Inject into Chat</button>
        </div>
      </div>
    </div>
    <div class="cc-tab" id="cc-tab">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
      </svg>
      <div class="cc-tab-dot"></div>
    </div>
  `;

  document.head.appendChild(style);
  document.body.appendChild(bridgeUI);

  // Tab switching
  bridgeUI.querySelectorAll(".cc-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      bridgeUI.querySelectorAll(".cc-tab-btn").forEach(b => b.classList.remove("active"));
      bridgeUI.querySelectorAll(".cc-tab-content").forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`cc-tab-${btn.dataset.tab}`).classList.add("active");
    });
  });

  document.getElementById("cc-tab").addEventListener("click", togglePanel);
  document.getElementById("cc-close").addEventListener("click", closePanel);
  document.getElementById("cc-sel").addEventListener("change", onProjectChange);
  document.getElementById("cc-inject").addEventListener("click", injectContext);
  document.getElementById("cc-capture").addEventListener("click", captureChat);
  document.getElementById("cc-save-chat").addEventListener("click", saveChat);

  loadProjects();
}

// --- Panel ---

function togglePanel() {
  isExpanded = !isExpanded;
  document.getElementById("cc-panel").classList.toggle("open", isExpanded);
  if (isExpanded) loadProjects();
}

function closePanel() {
  isExpanded = false;
  document.getElementById("cc-panel").classList.remove("open");
}

// --- Projects ---

async function loadProjects() {
  const selects = [document.getElementById("cc-sel"), document.getElementById("cc-save-sel")];
  try {
    const data = await ccFetch(`${CC_API}/projects`);
    projects = data || [];

    selects.forEach(select => {
      if (!select) return;
      if (projects.length === 0) {
        select.innerHTML = '<option value="">No projects</option>';
        return;
      }
      select.innerHTML = '<option value="">Choose project...</option>';
      projects.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = `${p.name} (${p.clip_count || 0})`;
        select.appendChild(opt);
      });
      if (selectedProjectId) select.value = selectedProjectId;
    });
  } catch {
    selects.forEach(s => { if (s) s.innerHTML = '<option value="">Backend offline</option>'; });
  }
}

// --- Save Chat ---

let capturedChat = null;

function captureChat() {
  const messages = scrapeChatMessages();
  if (!messages || messages.length === 0) {
    showSaveMsg("No messages found on this page", true);
    return;
  }

  capturedChat = messages.map((m, i) => `[${m.role}]: ${m.text}`).join("\n\n");

  const totalWords = capturedChat.split(/\s+/).length;
  const preview = document.getElementById("cc-chat-preview");
  const info = document.getElementById("cc-chat-info");

  preview.textContent = capturedChat.substring(0, 400) + (capturedChat.length > 400 ? "..." : "");
  info.style.display = "flex";
  document.getElementById("cc-chat-msgs").textContent = `${messages.length} messages`;
  document.getElementById("cc-chat-words").textContent = `${totalWords.toLocaleString()} words`;

  document.getElementById("cc-save-chat").disabled = false;
  showSaveMsg(`Captured ${messages.length} messages`, false);
}

async function saveChat() {
  if (!capturedChat) return;

  const projectId = document.getElementById("cc-save-sel").value || null;
  const btn = document.getElementById("cc-save-chat");

  btn.disabled = true;
  btn.textContent = "Saving...";

  try {
    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: "saveClip",
        text: capturedChat,
        url: window.location.href,
        title: document.title + " (Full Chat)",
        projectId: projectId
      }, (resp) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (resp && resp.success) resolve(resp.data);
        else reject(new Error(resp?.error || "Failed"));
      });
    });

    showSaveMsg("Chat saved!", false);
    await loadProjects();
  } catch (e) {
    showSaveMsg(e.message || "Failed to save", true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Save to Context Clipper";
  }
}

// --- Chat Scraping ---

function scrapeChatMessages() {
  const host = window.location.hostname;

  if (host.includes("chatgpt.com") || host.includes("chat.openai.com")) {
    return scrapeChatGPT();
  }
  if (host.includes("claude.ai")) {
    return scrapeClaude();
  }
  if (host.includes("gemini.google.com")) {
    return scrapeGemini();
  }
  return scrapeGeneric();
}

function scrapeChatGPT() {
  const messages = [];
  // ChatGPT conversation turns
  const turns = document.querySelectorAll('[data-message-author-role]');
  if (turns.length > 0) {
    turns.forEach(el => {
      const role = el.getAttribute("data-message-author-role") === "user" ? "You" : "Assistant";
      const text = el.innerText.trim();
      if (text) messages.push({ role, text });
    });
    return messages;
  }

  // Fallback: article-based structure
  const articles = document.querySelectorAll("article");
  articles.forEach((article, i) => {
    const role = i % 2 === 0 ? "You" : "Assistant";
    const text = article.innerText.trim();
    if (text) messages.push({ role, text });
  });
  return messages;
}

function scrapeClaude() {
  const messages = [];

  // Claude uses data-is-streaming or specific message containers
  const humanMsgs = document.querySelectorAll('[data-testid="human-turn"]');
  const aiMsgs = document.querySelectorAll('[data-testid="ai-turn"]');

  if (humanMsgs.length > 0 || aiMsgs.length > 0) {
    // Interleave human and AI turns
    const allTurns = [];
    humanMsgs.forEach(el => allTurns.push({ role: "You", el, top: el.getBoundingClientRect().top }));
    aiMsgs.forEach(el => allTurns.push({ role: "Assistant", el, top: el.getBoundingClientRect().top }));
    allTurns.sort((a, b) => a.top - b.top);
    allTurns.forEach(t => {
      const text = t.el.innerText.trim();
      if (text) messages.push({ role: t.role, text });
    });
    return messages;
  }

  // Fallback: generic message containers
  const msgEls = document.querySelectorAll('.font-claude-message, .font-user-message, [class*="Message"]');
  msgEls.forEach((el, i) => {
    const role = el.className.includes("user") ? "You" : "Assistant";
    const text = el.innerText.trim();
    if (text) messages.push({ role, text });
  });

  if (messages.length === 0) return scrapeGeneric();
  return messages;
}

function scrapeGemini() {
  const messages = [];

  // Gemini uses specific query/response containers
  const queries = document.querySelectorAll('.query-text, [data-query-text], .user-query');
  const responses = document.querySelectorAll('.model-response-text, .response-content, .markdown');

  if (queries.length > 0) {
    const maxLen = Math.max(queries.length, responses.length);
    for (let i = 0; i < maxLen; i++) {
      if (queries[i]) {
        const text = queries[i].innerText.trim();
        if (text) messages.push({ role: "You", text });
      }
      if (responses[i]) {
        const text = responses[i].innerText.trim();
        if (text) messages.push({ role: "Assistant", text });
      }
    }
    return messages;
  }

  return scrapeGeneric();
}

function scrapeGeneric() {
  // Generic fallback: try to find any conversation-like structure
  const messages = [];
  const allText = document.body.innerText;

  if (allText.length > 100) {
    messages.push({ role: "Page", text: allText.substring(0, 50000) });
  }
  return messages;
}

// --- Inject ---

async function onProjectChange() {
  const id = document.getElementById("cc-sel").value;
  selectedProjectId = id;

  const stats = document.getElementById("cc-stats");
  const preview = document.getElementById("cc-prev");
  const injectBtn = document.getElementById("cc-inject");
  const msg = document.getElementById("cc-msg");

  msg.style.display = "none";
  exportedContext = null;

  if (!id) {
    stats.style.display = "none";
    preview.style.display = "none";
    injectBtn.disabled = true;
    return;
  }

  try {
    const data = await ccFetch(`${CC_API}/projects/${id}/export`);

    if (!data.context || data.context === "No clips in this project.") {
      stats.style.display = "none";
      preview.style.display = "none";
      injectBtn.disabled = true;
      showMsg("No clips in this project", true);
      return;
    }

    exportedContext = data.context;
    const clipCount = data.clip_count || 0;
    const wordCount = exportedContext.split(/\s+/).length;

    document.getElementById("cc-clips").textContent = clipCount;
    document.getElementById("cc-tokens").textContent = `~${Math.round(wordCount * 1.3).toLocaleString()}`;
    stats.style.display = "grid";

    preview.textContent = exportedContext.substring(0, 200) + (exportedContext.length > 200 ? "..." : "");
    preview.style.display = "block";

    injectBtn.disabled = false;
  } catch {
    showMsg("Failed to load project", true);
    injectBtn.disabled = true;
  }
}

async function injectContext() {
  if (!exportedContext) return;

  const textarea = findChatTextarea();
  if (!textarea) {
    showMsg("Chat input not found", true);
    return;
  }

  insertText(textarea, "Here is relevant context for our conversation:\n\n" + exportedContext);
  showMsg("Context injected!", false);
  setTimeout(closePanel, 1200);
}

function findChatTextarea() {
  const host = window.location.hostname;

  if (host.includes("chatgpt.com") || host.includes("chat.openai.com")) {
    return document.querySelector("#prompt-textarea") || document.querySelector('div[contenteditable="true"]') || document.querySelector("textarea");
  }
  if (host.includes("claude.ai")) {
    return document.querySelector('div.ProseMirror[contenteditable="true"]') || document.querySelector('[contenteditable="true"]') || document.querySelector("textarea");
  }
  if (host.includes("gemini.google.com")) {
    return document.querySelector('.ql-editor[contenteditable="true"]') || document.querySelector('[contenteditable="true"]') || document.querySelector("textarea");
  }
  return document.querySelector('[contenteditable="true"]') || document.querySelector("textarea");
}

function insertText(el, text) {
  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
      || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(el, text); else el.value = text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else if (el.getAttribute("contenteditable")) {
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand("insertText", false, text);
    if (el.textContent.length === 0) {
      el.textContent = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  el.focus();
}

// --- Messages ---

function showMsg(text, isError) {
  const msg = document.getElementById("cc-msg");
  msg.textContent = text;
  msg.className = "cc-msg" + (isError ? " err" : "");
  msg.style.display = "block";
  setTimeout(() => { msg.style.display = "none"; }, 3000);
}

function showSaveMsg(text, isError) {
  const msg = document.getElementById("cc-save-msg");
  msg.textContent = text;
  msg.className = "cc-msg" + (isError ? " err" : "");
  msg.style.display = "block";
  setTimeout(() => { msg.style.display = "none"; }, 3000);
}
