import { useState, useMemo } from "react";
import { Clipboard, ChevronLeft, ChevronRight, WifiOff } from "lucide-react";
import { ClipCard } from "./ClipCard";
import type { Clip } from "../lib/api";

interface ClipsGridProps {
  clips: Clip[];
  loading: boolean;
  error: string | null;
  editMode: boolean;
  onDelete: (id: string) => void;
  onEdit: (clip: Clip) => void;
  onAsk: (clip: Clip) => void;
  onCopy: (text: string) => void;
}

const PER_PAGE = 20;

export function ClipsGrid({
  clips,
  loading,
  error,
  editMode,
  onDelete,
  onEdit,
  onAsk,
  onCopy,
}: ClipsGridProps) {
  const [page, setPage] = useState(0);

  const totalPages = Math.ceil(clips.length / PER_PAGE);
  const safePage = Math.min(page, Math.max(totalPages - 1, 0));
  if (safePage !== page) setPage(safePage);

  const pageClips = useMemo(
    () => clips.slice(safePage * PER_PAGE, (safePage + 1) * PER_PAGE),
    [clips, safePage]
  );

  // Loading
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-7 h-7 border-[2.5px] border-border border-t-accent rounded-full mb-3.5" style={{ animation: "spin 0.7s linear infinite" }} />
        <span className="text-[13px] font-medium text-text-tertiary">Loading clips...</span>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-14 h-14 rounded-2xl bg-surface border border-border flex items-center justify-center">
          <WifiOff className="w-6 h-6 text-text-tertiary" />
        </div>
        <div className="text-center">
          <h3 className="text-[17px] font-bold mb-1.5 tracking-[-0.2px]">Connection Failed</h3>
          <p className="text-[13px] text-text-secondary font-medium max-w-[280px]">{error}</p>
        </div>
      </div>
    );
  }

  // Empty
  if (clips.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-14 h-14 rounded-2xl bg-surface border border-border flex items-center justify-center">
          <Clipboard className="w-6 h-6 text-text-tertiary" />
        </div>
        <div className="text-center">
          <h2 className="text-[17px] font-bold mb-1.5 tracking-[-0.2px]">No clips yet</h2>
          <p className="text-[13px] text-text-secondary font-medium">
            Start browsing and save interesting content with Context Clipper.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] max-sm:grid-cols-1 gap-3">
        {pageClips.map((clip, i) => (
          <ClipCard
            key={clip.id}
            clip={clip}
            editMode={editMode}
            onDelete={onDelete}
            onEdit={onEdit}
            onAsk={onAsk}
            onCopy={onCopy}
            index={i}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-3 py-6">
          <button
            className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-surface text-text-primary border border-border hover:bg-surface-hover hover:border-border-hover transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            &larr; Previous
          </button>
          <span className="text-[12px] font-semibold text-text-tertiary">
            Page {safePage + 1} of {totalPages}
          </span>
          <button
            className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-surface text-text-primary border border-border hover:bg-surface-hover hover:border-border-hover transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            disabled={safePage >= totalPages - 1}
            onClick={() => setPage(safePage + 1)}
          >
            Next &rarr;
          </button>
        </div>
      )}
    </>
  );
}
