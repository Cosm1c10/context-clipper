import { useState } from "react";
import { Clipboard, Plus, Trash2 } from "lucide-react";
import { cn } from "../lib/utils";
import { Modal } from "./Modal";
import { showToast } from "./Toast";
import type { Project, Clip } from "../lib/api";

const DOT_COLORS = [
  "#0a84ff", "#30d158", "#ff9f0a", "#ff453a", "#5e5ce6",
  "#bf5af2", "#64d2ff", "#ff6482", "#ac8e68", "#32d74b",
];

interface SidebarProps {
  projects: Project[];
  currentProjectId: string;
  allClips: Clip[];
  onSelectProject: (id: string) => void;
  onCreateProject: (name: string, desc?: string) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  projects,
  currentProjectId,
  allClips,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await onCreateProject(newName.trim(), newDesc.trim() || undefined);
      setShowCreateModal(false);
      setNewName("");
      setNewDesc("");
      showToast("Project created");
    } catch {
      showToast("Failed to create project", true);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Delete this project and all its clips?")) return;
    try {
      await onDeleteProject(id);
      showToast("Project deleted");
    } catch {
      showToast("Failed to delete project", true);
    }
  };

  const handleSelect = (id: string) => {
    onSelectProject(id);
    onCloseMobile();
  };

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[99] bg-black/50 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={cn(
          "flex flex-col h-screen sticky top-0 w-[260px] shrink-0 bg-surface border-r border-border",
          "max-lg:fixed max-lg:left-0 max-lg:top-0 max-lg:z-[100] max-lg:shadow-[8px_0_40px_rgba(0,0,0,0.6)]",
          mobileOpen ? "max-lg:flex" : "max-lg:hidden"
        )}
      >
        {/* Logo */}
        <div className="px-5 pt-6 pb-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-[30px] h-[30px] rounded-lg bg-accent flex items-center justify-center shrink-0">
              <Clipboard className="w-4 h-4 text-white" />
            </div>
            <span className="text-[15px] font-bold tracking-[-0.3px]">Context Clipper</span>
          </div>
        </div>

        {/* Projects List */}
        <div className="flex-1 overflow-y-auto px-2.5 py-4">
          <div className="text-[10px] font-bold uppercase tracking-[1.2px] text-text-tertiary px-2.5 mb-2">
            Projects
          </div>

          <nav className="flex flex-col gap-px">
            {/* All Clips */}
            <button
              className={cn(
                "group flex items-center gap-2.5 px-3 py-[9px] rounded-lg text-[13px] font-medium w-full text-left transition-all duration-150",
                currentProjectId === "all"
                  ? "bg-accent-subtle text-accent"
                  : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              )}
              onClick={() => handleSelect("all")}
            >
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: "#0a84ff" }}
              />
              <span className="flex-1 truncate">All Clips</span>
              <span className={cn(
                "text-[11px] font-semibold px-1.5 py-px rounded-[10px]",
                currentProjectId === "all"
                  ? "text-accent bg-accent-muted"
                  : "text-text-tertiary bg-white/[0.04]"
              )}>
                {allClips.length}
              </span>
            </button>

            {/* Projects */}
            {projects.map((p, i) => {
              const color = DOT_COLORS[i % DOT_COLORS.length];
              const isActive = currentProjectId === p.id;
              return (
                <button
                  key={p.id}
                  className={cn(
                    "group flex items-center gap-2.5 px-3 py-[9px] rounded-lg text-[13px] font-medium w-full text-left transition-all duration-150",
                    isActive
                      ? "text-text-primary"
                      : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                  )}
                  style={isActive ? {
                    background: `${color}1e`,
                  } : undefined}
                  onClick={() => handleSelect(p.id)}
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: color }}
                  />
                  <span className="flex-1 truncate">{p.name}</span>

                  <span className={cn(
                    "text-[11px] font-semibold px-1.5 py-px rounded-[10px] group-hover:hidden",
                    isActive ? "text-text-secondary bg-white/[0.04]" : "text-text-tertiary bg-white/[0.04]"
                  )}>
                    {p.clip_count || 0}
                  </span>
                  <button
                    className="hidden group-hover:flex items-center justify-center w-5 h-5 rounded text-danger/70 hover:text-danger hover:bg-danger-subtle transition-colors"
                    onClick={(e) => handleDelete(e, p.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </button>
              );
            })}
          </nav>

          {/* New Project */}
          <button
            className="flex items-center gap-2 w-full mt-1.5 px-3 py-[9px] rounded-lg text-[13px] font-medium text-text-secondary border border-dashed border-border bg-transparent hover:bg-surface-hover hover:border-border-hover hover:text-text-primary transition-all"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus className="w-3.5 h-3.5" />
            New Project
          </button>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-border">
          <span className="text-[11px] font-medium text-text-tertiary">Context Clipper v2.0</span>
        </div>
      </aside>

      {/* Create Project Modal */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)}>
        <h3 className="text-[17px] font-bold tracking-[-0.2px] mb-4">Create New Project</h3>
        <input
          className="w-full bg-bg border border-border rounded-[10px] px-3.5 py-[11px] text-text-primary text-[13px] font-medium mb-2.5 outline-none transition-all placeholder:text-text-tertiary focus:border-accent focus:shadow-[0_0_0_3px_rgba(10,132,255,0.12)]"
          placeholder="Project name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          autoFocus
        />
        <input
          className="w-full bg-bg border border-border rounded-[10px] px-3.5 py-[11px] text-text-primary text-[13px] font-medium outline-none transition-all placeholder:text-text-tertiary focus:border-accent focus:shadow-[0_0_0_3px_rgba(10,132,255,0.12)]"
          placeholder="Description (optional)"
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
        <div className="flex gap-2 justify-end mt-[18px]">
          <button
            className="px-3.5 py-[7px] rounded-lg text-[13px] font-semibold bg-surface text-text-primary border border-border hover:bg-surface-hover hover:border-border-hover transition-all"
            onClick={() => setShowCreateModal(false)}
          >
            Cancel
          </button>
          <button
            className="px-3.5 py-[7px] rounded-lg text-[13px] font-semibold text-white bg-accent hover:bg-accent-hover transition-all active:scale-[0.97] disabled:opacity-40"
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
      </Modal>
    </>
  );
}
