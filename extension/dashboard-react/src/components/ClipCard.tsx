import { useState } from "react";
import { Pencil, Trash2, Copy, MessageCircle, ChevronDown, ChevronUp, ExternalLink, FileText, Image, Camera, File } from "lucide-react";
import { cn } from "../lib/utils";
import type { Clip } from "../lib/api";

interface ClipCardProps {
  clip: Clip;
  editMode: boolean;
  onDelete: (id: string) => void;
  onEdit: (clip: Clip) => void;
  onAsk: (clip: Clip) => void;
  onCopy: (text: string) => void;
  index: number;
}

const MEDIA_CONFIG: Record<string, { label: string; colorClass: string; badgeClass: string; icon: typeof FileText }> = {
  text:       { label: "Text",       colorClass: "text-accent",  badgeClass: "bg-accent-subtle text-accent",       icon: FileText },
  image:      { label: "Image",      colorClass: "text-purple",  badgeClass: "bg-purple-subtle text-purple",       icon: Image },
  screenshot: { label: "Screenshot", colorClass: "text-orange",  badgeClass: "bg-orange-subtle text-orange",       icon: Camera },
  file:       { label: "File",       colorClass: "text-success", badgeClass: "bg-success-subtle text-success",     icon: File },
};

export function ClipCard({ clip, editMode, onDelete, onEdit, onAsk, onCopy, index }: ClipCardProps) {
  const [expanded, setExpanded] = useState(false);

  const date = new Date(clip.timestamp);
  const fmtDate = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const fmtTime = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const mediaType = clip.media_type || "text";
  const media = MEDIA_CONFIG[mediaType] || MEDIA_CONFIG.text;
  const MediaIcon = media.icon;

  return (
    <div
      className="card-enter bg-surface border border-border rounded-[14px] p-[18px] transition-all duration-150 hover:border-border-hover hover:bg-surface-hover group"
      style={{ animationDelay: `${Math.min(index * 40, 300)}ms` }}
    >
      {/* Header */}
      <div className="flex justify-between items-start gap-3 mb-2.5">
        <h3 className="text-[14px] font-semibold text-text-primary leading-snug flex-1 truncate">
          {clip.title || "Untitled Clip"}
        </h3>
        <span className={cn(
          "inline-flex items-center gap-1 px-2 py-[3px] rounded-md text-[10px] font-bold uppercase tracking-[0.5px] shrink-0",
          media.badgeClass
        )}>
          <MediaIcon className="w-2.5 h-2.5" />
          {media.label}
        </span>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-3 text-[11px] font-medium text-text-tertiary mb-2.5">
        <span>{fmtDate} {fmtTime}</span>
        <span>{clip.domain || "unknown"}</span>
        {mediaType === "file" && clip.file_name ? (
          <span className="text-success truncate">{clip.file_name}</span>
        ) : (
          <span>{clip.word_count || 0}w</span>
        )}
      </div>

      {/* Preview for screenshots/images */}
      {mediaType === "screenshot" && clip.screenshot_data && (
        <div className="rounded-lg overflow-hidden mb-2.5 border border-border max-h-40">
          <img
            src={clip.screenshot_data}
            alt="Screenshot"
            loading="lazy"
            className="w-full max-h-40 object-cover block"
          />
        </div>
      )}
      {mediaType === "image" && clip.image_url && (
        <div className="rounded-lg overflow-hidden mb-2.5 border border-border max-h-40">
          <a href={clip.image_url} target="_blank" rel="noopener noreferrer">
            <img
              src={clip.image_url}
              alt={clip.text || "Image"}
              loading="lazy"
              className="w-full max-h-40 object-cover block hover:opacity-90 transition-opacity"
            />
          </a>
        </div>
      )}

      {/* Text content with gradient fade */}
      {clip.text && (
        <div className="relative">
          <div
            className={cn(
              "text-[13px] text-text-secondary leading-[1.7] whitespace-pre-wrap break-words",
              !expanded && "max-h-20 overflow-hidden"
            )}
          >
            {clip.text}
          </div>
          {/* Gradient fade — matches surface bg, changes on hover via group */}
          {!expanded && clip.text.length > 120 && (
            <>
              <div className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none bg-gradient-to-t from-surface to-transparent group-hover:hidden" />
              <div className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none bg-gradient-to-t from-surface-hover to-transparent hidden group-hover:block" />
            </>
          )}
        </div>
      )}

      {/* URL */}
      <a
        href={clip.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block mt-2.5 text-[11px] text-accent font-medium hover:underline truncate"
      >
        {clip.url}
      </a>

      {/* Action bar */}
      <div className="flex gap-1.5 mt-3 pt-3 border-t border-border">
        {editMode ? (
          <>
            <ActionBtn onClick={() => onEdit(clip)}>
              <Pencil className="w-3 h-3" /> Edit
            </ActionBtn>
            <ActionBtn onClick={() => onDelete(clip.id)} danger>
              <Trash2 className="w-3 h-3" /> Delete
            </ActionBtn>
          </>
        ) : (
          <>
            {clip.text && clip.text.length > 120 && (
              <ActionBtn onClick={() => setExpanded(!expanded)}>
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {expanded ? "Less" : "More"}
              </ActionBtn>
            )}
            <ActionBtn onClick={() => onAsk(clip)}>
              <MessageCircle className="w-3 h-3" /> Ask AI
            </ActionBtn>
            <ActionBtn onClick={() => onCopy(clip.text)}>
              <Copy className="w-3 h-3" /> Copy
            </ActionBtn>
          </>
        )}
      </div>
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-[5px] rounded-md text-[11px] font-semibold transition-all",
        danger
          ? "text-danger bg-danger-subtle hover:bg-[rgba(255,69,58,0.2)]"
          : "text-text-secondary bg-surface hover:bg-surface-hover hover:text-text-primary border border-border"
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
