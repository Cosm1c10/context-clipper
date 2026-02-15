import { useEffect, useState, useMemo, useCallback } from "react";
import { Pencil, Check, Copy, Menu, Sparkles, LogIn } from "lucide-react";
import { useStore } from "./store";
import { Sidebar } from "./components/Sidebar";
import { StatsRow } from "./components/StatsRow";
import { SearchBar, type TimeFilter, type MediaFilter } from "./components/SearchBar";
import { ClipsGrid } from "./components/ClipsGrid";
import { Modal } from "./components/Modal";
import { ToastContainer, showToast } from "./components/Toast";
import { askAI, fetchBridge, checkAuth, type Clip } from "./lib/api";

export default function App() {
  const store = useStore();
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [compactExport, setCompactExport] = useState(false);

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>(null);

  // Ask AI modal
  const [askClip, setAskClip] = useState<Clip | null>(null);
  const [askQuestion, setAskQuestion] = useState("");
  const [askAnswer, setAskAnswer] = useState("");
  const [askLoading, setAskLoading] = useState(false);

  // Edit clip modal
  const [editClip, setEditClip] = useState<Clip | null>(null);
  const [editText, setEditText] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    checkAuth().then((session) => {
      setIsLoggedIn(!!session);
      setAuthChecked(true);
      if (session) {
        store.init();
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle AUTH_REQUIRED errors from store
  useEffect(() => {
    if (store.error === "AUTH_REQUIRED") {
      setIsLoggedIn(false);
    }
  }, [store.error]);

  // Filtered clips
  const filteredClips = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let result = store.allClips;

    if (timeFilter === "today") {
      result = result.filter((c) => new Date(c.timestamp) >= today);
    } else if (timeFilter === "week") {
      result = result.filter((c) => new Date(c.timestamp) >= weekAgo);
    }

    if (mediaFilter) {
      result = result.filter((c) => (c.media_type || "text") === mediaFilter);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          (c.text || "").toLowerCase().includes(q) ||
          (c.title || "").toLowerCase().includes(q) ||
          (c.url || "").toLowerCase().includes(q)
      );
    }

    return result;
  }, [store.allClips, timeFilter, mediaFilter, searchQuery]);

  const currentProjectName = useMemo(() => {
    if (store.currentProjectId === "all") return "All Clips";
    const proj = store.projects.find((p) => p.id === store.currentProjectId);
    return proj?.name || "Unknown";
  }, [store.currentProjectId, store.projects]);

  const handleDeleteClip = useCallback(
    async (id: string) => {
      if (!confirm("Delete this clip?")) return;
      try {
        await store.removeClip(id);
        showToast("Clip deleted");
      } catch {
        showToast("Failed to delete clip", true);
      }
    },
    [store]
  );

  const handleCopyText = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(
      () => showToast("Copied to clipboard"),
      () => showToast("Failed to copy", true)
    );
  }, []);

  const handleCopyAll = useCallback(async () => {
    if (store.currentProjectId === "all") {
      const text = filteredClips
        .map((c, i) => `--- Clip ${i + 1} ---\nSource: ${c.title} (${c.url})\n\n${c.text}\n`)
        .join("\n");
      handleCopyText(text);
      return;
    }

    try {
      const data = await fetchBridge(store.currentProjectId, "markdown", compactExport);
      handleCopyText(data.bridge || "No clips.");
      showToast(`Copied to clipboard${compactExport ? " (compact)" : ""}`);
    } catch {
      showToast("Failed to export", true);
    }
  }, [store.currentProjectId, filteredClips, compactExport, handleCopyText]);

  const handleAskSubmit = useCallback(async () => {
    if (!askQuestion.trim()) return;
    setAskLoading(true);
    try {
      const answer = await askAI(askQuestion);
      setAskAnswer(answer);
      setAskQuestion("");
    } catch (e: any) {
      setAskAnswer(`Error: ${e.message}`);
    } finally {
      setAskLoading(false);
    }
  }, [askQuestion]);

  const handleEditSave = useCallback(async () => {
    if (!editClip || !editText.trim()) return;
    setEditSaving(true);
    try {
      await store.editClip(editClip.id, editText.trim());
      setEditClip(null);
      showToast("Clip updated");
    } catch {
      showToast("Failed to update clip", true);
    } finally {
      setEditSaving(false);
    }
  }, [editClip, editText, store]);

  // Auth gate
  if (!authChecked) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg">
        <div className="w-7 h-7 border-[2.5px] border-border border-t-accent rounded-full" style={{ animation: "spin 0.7s linear infinite" }} />
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg">
        <div className="text-center max-w-[320px]">
          <div className="w-14 h-14 rounded-2xl bg-surface border border-border flex items-center justify-center mx-auto mb-4">
            <LogIn className="w-6 h-6 text-text-tertiary" />
          </div>
          <h2 className="text-[17px] font-bold mb-2 tracking-[-0.2px]">Sign in required</h2>
          <p className="text-[13px] text-text-secondary font-medium leading-relaxed">
            Please sign in via the Context Clipper extension popup to access your dashboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar
        projects={store.projects}
        currentProjectId={store.currentProjectId}
        allClips={store.allClips}
        onSelectProject={store.selectProject}
        onCreateProject={store.addProject}
        onDeleteProject={store.removeProject}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Main content */}
      <main className="flex-1 flex flex-col min-h-screen min-w-0">
        {/* Top Bar */}
        <header
          className="flex items-center justify-between px-8 py-[18px] border-b border-border sticky top-0 z-50"
          style={{
            background: "rgba(0, 0, 0, 0.7)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              className="lg:hidden inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[13px] font-semibold bg-surface text-text-primary border border-border hover:bg-surface-hover"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="w-[18px] h-[18px]" />
            </button>
            <h1 className="text-[20px] font-bold tracking-[-0.4px] truncate">{currentProjectName}</h1>
            {editMode && (
              <span className="px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-[0.5px] bg-danger-subtle text-danger">
                Edit Mode
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-lg text-[13px] font-semibold bg-surface text-text-primary border border-border hover:bg-surface-hover hover:border-border-hover transition-all"
              onClick={() => setEditMode(!editMode)}
            >
              {editMode ? (
                <><Check className="w-3.5 h-3.5 text-success" /> Done</>
              ) : (
                <><Pencil className="w-3.5 h-3.5" /> Edit</>
              )}
            </button>

            <button
              className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-lg text-[13px] font-semibold text-white bg-accent hover:bg-accent-hover transition-all active:scale-[0.97]"
              onClick={handleCopyAll}
            >
              <Copy className="w-3.5 h-3.5" />
              Copy All
            </button>

            <label className="flex items-center gap-1 text-[11px] text-text-secondary cursor-pointer select-none">
              <input
                type="checkbox"
                checked={compactExport}
                onChange={(e) => setCompactExport(e.target.checked)}
                className="cursor-pointer"
                style={{ accentColor: "var(--color-accent)" }}
              />
              Compact
            </label>
          </div>
        </header>

        {/* Stats */}
        <StatsRow clips={filteredClips} />

        {/* Search & Filters */}
        <SearchBar
          onSearchChange={setSearchQuery}
          onTimeFilterChange={setTimeFilter}
          onMediaFilterChange={setMediaFilter}
          timeFilter={timeFilter}
          mediaFilter={mediaFilter}
        />

        {/* Clips Grid */}
        <div className="flex-1 px-8 pb-8">
          <ClipsGrid
            clips={filteredClips}
            loading={store.loading}
            error={store.error}
            editMode={editMode}
            onDelete={handleDeleteClip}
            onEdit={(clip) => {
              setEditClip(clip);
              setEditText(clip.text);
            }}
            onAsk={(clip) => {
              setAskClip(clip);
              setAskAnswer("");
              setAskQuestion("");
            }}
            onCopy={handleCopyText}
          />
        </div>
      </main>

      {/* Ask AI Modal */}
      <Modal open={!!askClip} onClose={() => setAskClip(null)} wide>
        <h3 className="text-[17px] font-bold tracking-[-0.2px] mb-4">Ask AI about this clip</h3>
        <input
          className="w-full bg-bg border border-border rounded-[10px] px-3.5 py-[11px] text-text-primary text-[13px] font-medium outline-none transition-all placeholder:text-text-tertiary focus:border-accent focus:shadow-[0_0_0_3px_rgba(10,132,255,0.12)]"
          placeholder="What would you like to know?"
          value={askQuestion}
          onChange={(e) => setAskQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAskSubmit()}
          autoFocus
        />
        {askAnswer && (
          <div className="bg-bg border border-border rounded-[10px] p-3.5 mt-3.5 text-[13px] leading-[1.7] text-text-primary whitespace-pre-wrap">
            {askAnswer}
          </div>
        )}
        <div className="flex gap-2 justify-end mt-[18px]">
          <button
            className="px-3.5 py-[7px] rounded-lg text-[13px] font-semibold bg-surface text-text-primary border border-border hover:bg-surface-hover transition-all"
            onClick={() => setAskClip(null)}
          >
            Cancel
          </button>
          <button
            className="px-3.5 py-[7px] rounded-lg text-[13px] font-semibold text-white bg-accent hover:bg-accent-hover transition-all disabled:opacity-40"
            onClick={handleAskSubmit}
            disabled={askLoading || !askQuestion.trim()}
          >
            {askLoading ? "Thinking..." : "Ask"}
          </button>
        </div>
      </Modal>

      {/* Edit Clip Modal */}
      <Modal open={!!editClip} onClose={() => setEditClip(null)}>
        <h3 className="text-[17px] font-bold tracking-[-0.2px] mb-4">Edit Clip</h3>
        <textarea
          className="w-full bg-bg border border-border rounded-[10px] px-3.5 py-[11px] text-text-primary text-[13px] font-medium leading-[1.7] outline-none transition-all placeholder:text-text-tertiary focus:border-accent focus:shadow-[0_0_0_3px_rgba(10,132,255,0.12)] resize-y min-h-[140px]"
          placeholder="Clip text..."
          rows={6}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          autoFocus
        />
        <div className="flex gap-2 justify-end mt-[18px]">
          <button
            className="px-3.5 py-[7px] rounded-lg text-[13px] font-semibold bg-surface text-text-primary border border-border hover:bg-surface-hover transition-all"
            onClick={() => setEditClip(null)}
          >
            Cancel
          </button>
          <button
            className="px-3.5 py-[7px] rounded-lg text-[13px] font-semibold text-white bg-accent hover:bg-accent-hover transition-all disabled:opacity-40"
            onClick={handleEditSave}
            disabled={editSaving || !editText.trim()}
          >
            {editSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </Modal>

      <ToastContainer />
    </div>
  );
}
