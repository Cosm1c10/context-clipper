/**
 * Context Clipper Injector
 * Side panel that injects saved context into LLM chat interfaces
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

// API helper — tries direct fetch first, falls back to background relay
async function ccFetch(url) {
  // Try direct fetch (works if host_permissions grants access)
  try {
    const res = await fetch(url);
    if (res.ok) return await res.json();
  } catch {}

  // Fallback: relay through background service worker
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ action: "proxyFetch", url }, (resp) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (resp && resp.success) {
          resolve(resp.data);
        } else {
          reject(new Error(resp?.error || "Failed"));
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

function createBridgeUI() {
  if (bridgeUI) return;
  if (document.getElementById("cc-root")) return;

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

    /* Tab trigger on right edge */
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

    .cc-tab:hover {
      opacity: 1;
      background: #2c2c2e;
    }

    .cc-tab svg {
      width: 14px;
      height: 14px;
      color: #86868b;
      transition: color 0.12s;
    }

    .cc-tab:hover svg {
      color: #0a84ff;
    }

    .cc-tab-dot {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: #0a84ff;
    }

    /* Panel */
    .cc-panel {
      width: 0;
      height: 400px;
      max-height: 75vh;
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

    .cc-panel.open {
      width: 280px;
    }

    /* Header */
    .cc-hdr {
      padding: 14px 16px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }

    .cc-hdr-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .cc-hdr-icon {
      width: 22px;
      height: 22px;
      background: #0a84ff;
      border-radius: 5px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .cc-hdr-icon svg {
      width: 12px;
      height: 12px;
      color: white;
    }

    .cc-hdr-title {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: -0.2px;
      white-space: nowrap;
    }

    .cc-x {
      background: none;
      border: none;
      color: #48484a;
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
      padding: 2px 5px;
      border-radius: 4px;
      transition: all 0.1s;
    }

    .cc-x:hover {
      color: #86868b;
      background: rgba(255,255,255,0.06);
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
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #48484a;
      margin-bottom: 4px;
    }

    .cc-sel {
      width: 100%;
      padding: 8px 28px 8px 10px;
      background: #000;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 7px;
      color: #f5f5f7;
      font-size: 12px;
      font-family: inherit;
      font-weight: 500;
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg width='8' height='5' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%2386868b' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 9px center;
      transition: border-color 0.12s;
    }

    .cc-sel:focus {
      outline: none;
      border-color: #0a84ff;
    }

    .cc-sel option {
      background: #1c1c1e;
      color: #f5f5f7;
    }

    /* Stats */
    .cc-stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }

    .cc-sbox {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.05);
      border-radius: 7px;
      padding: 8px;
      text-align: center;
    }

    .cc-sval {
      font-size: 16px;
      font-weight: 800;
      color: #f5f5f7;
      letter-spacing: -0.5px;
      line-height: 1.1;
    }

    .cc-slbl {
      font-size: 9px;
      color: #48484a;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      margin-top: 2px;
      font-weight: 600;
    }

    /* Preview */
    .cc-prev {
      max-height: 80px;
      overflow-y: auto;
      background: #000;
      border-radius: 7px;
      padding: 8px 10px;
      font-size: 11px;
      line-height: 1.5;
      color: #86868b;
      border: 1px solid rgba(255,255,255,0.06);
    }

    .cc-prev::-webkit-scrollbar { width: 3px; }
    .cc-prev::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

    /* Message */
    .cc-msg {
      font-size: 11px;
      text-align: center;
      color: #30d158;
      font-weight: 600;
      padding: 2px 0;
    }

    .cc-msg.err {
      color: #ff453a;
    }

    /* Footer */
    .cc-foot {
      padding: 10px 16px;
      border-top: 1px solid rgba(255,255,255,0.06);
      flex-shrink: 0;
    }

    .cc-btn {
      width: 100%;
      padding: 9px;
      border: none;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      background: #0a84ff;
      color: white;
      transition: all 0.12s ease;
      font-family: inherit;
      letter-spacing: -0.1px;
    }

    .cc-btn:hover {
      background: #409cff;
    }

    .cc-btn:active {
      transform: scale(0.98);
    }

    .cc-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
      transform: none;
    }

    .cc-btn:disabled:hover {
      background: #0a84ff;
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

  document.getElementById("cc-tab").addEventListener("click", togglePanel);
  document.getElementById("cc-close").addEventListener("click", closePanel);
  document.getElementById("cc-sel").addEventListener("change", onProjectChange);
  document.getElementById("cc-inject").addEventListener("click", injectContext);

  loadProjects();
}

function togglePanel() {
  isExpanded = !isExpanded;
  document.getElementById("cc-panel").classList.toggle("open", isExpanded);
  if (isExpanded) loadProjects();
}

function closePanel() {
  isExpanded = false;
  document.getElementById("cc-panel").classList.remove("open");
}

async function loadProjects() {
  const select = document.getElementById("cc-sel");
  try {
    const data = await ccFetch(`${CC_API}/projects`);
    projects = data;

    if (!projects || projects.length === 0) {
      select.innerHTML = '<option value="">No projects</option>';
      return;
    }

    select.innerHTML = '<option value="">Choose project...</option>';
    projects.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.name} (${p.clip_count || 0})`;
      select.appendChild(opt);
    });

    if (selectedProjectId) select.value = selectedProjectId;
  } catch {
    select.innerHTML = '<option value="">Backend offline</option>';
  }
}

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
    const tokenEst = Math.round(wordCount * 1.3);

    document.getElementById("cc-clips").textContent = clipCount;
    document.getElementById("cc-tokens").textContent = `~${tokenEst.toLocaleString()}`;
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

  const fullText = "Here is relevant context for our conversation:\n\n" + exportedContext;
  insertText(textarea, fullText);

  showMsg("Context injected!", false);
  setTimeout(closePanel, 1200);
}

function findChatTextarea() {
  const host = window.location.hostname;

  if (host.includes("chatgpt.com") || host.includes("chat.openai.com")) {
    return (
      document.querySelector("#prompt-textarea") ||
      document.querySelector('div[contenteditable="true"]') ||
      document.querySelector("textarea")
    );
  }

  if (host.includes("claude.ai")) {
    return (
      document.querySelector('div.ProseMirror[contenteditable="true"]') ||
      document.querySelector('[contenteditable="true"]') ||
      document.querySelector("textarea")
    );
  }

  if (host.includes("gemini.google.com")) {
    return (
      document.querySelector('.ql-editor[contenteditable="true"]') ||
      document.querySelector('[contenteditable="true"]') ||
      document.querySelector("textarea")
    );
  }

  return document.querySelector('[contenteditable="true"]') || document.querySelector("textarea");
}

function insertText(el, text) {
  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
      || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

    if (setter) setter.call(el, text);
    else el.value = text;

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

function showMsg(text, isError) {
  const msg = document.getElementById("cc-msg");
  msg.textContent = text;
  msg.className = "cc-msg" + (isError ? " err" : "");
  msg.style.display = "block";
  setTimeout(() => { msg.style.display = "none"; }, 3000);
}
