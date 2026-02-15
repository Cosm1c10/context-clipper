import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "../lib/utils";

export type TimeFilter = "all" | "today" | "week";
export type MediaFilter = "text" | "image" | "screenshot" | "file" | null;

interface SearchBarProps {
  onSearchChange: (query: string) => void;
  onTimeFilterChange: (filter: TimeFilter) => void;
  onMediaFilterChange: (filter: MediaFilter) => void;
  timeFilter: TimeFilter;
  mediaFilter: MediaFilter;
}

const TIME_CHIPS: { key: TimeFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
];

const MEDIA_CHIPS: { key: string; media: MediaFilter; label: string }[] = [
  { key: "text", media: "text", label: "Text" },
  { key: "images", media: "image", label: "Images" },
  { key: "screenshots", media: "screenshot", label: "Screenshots" },
  { key: "files", media: "file", label: "Files" },
];

export function SearchBar({
  onSearchChange,
  onTimeFilterChange,
  onMediaFilterChange,
  timeFilter,
  mediaFilter,
}: SearchBarProps) {
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleInput = useCallback(
    (value: string) => {
      setQuery(value);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onSearchChange(value);
      }, 250);
    },
    [onSearchChange]
  );

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  const handleTimeClick = (key: TimeFilter) => {
    onTimeFilterChange(key);
    onMediaFilterChange(null);
  };

  const handleMediaClick = (media: MediaFilter) => {
    onMediaFilterChange(media);
    onTimeFilterChange("all");
  };

  return (
    <div className="px-8 pb-5 flex gap-2.5 flex-wrap items-center">
      {/* Search input */}
      <input
        type="text"
        className="flex-1 min-w-[220px] bg-surface border border-border rounded-[10px] px-3.5 py-2.5 text-text-primary text-[13px] font-medium outline-none transition-all placeholder:text-text-tertiary focus:border-accent focus:shadow-[0_0_0_3px_rgba(10,132,255,0.12)]"
        placeholder="Search clips..."
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            clearTimeout(debounceRef.current);
            onSearchChange(query);
          }
        }}
      />

      {/* Filter chips */}
      <div className="flex gap-1 items-center">
        {TIME_CHIPS.map((c) => {
          const isActive = !mediaFilter && timeFilter === c.key;
          return (
            <button
              key={c.key}
              className={cn(
                "px-3.5 py-2 rounded-lg text-[12px] font-semibold border transition-all duration-150",
                isActive
                  ? "bg-accent border-accent text-white"
                  : "bg-transparent border-border text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              )}
              onClick={() => handleTimeClick(c.key)}
            >
              {c.label}
            </button>
          );
        })}

        {MEDIA_CHIPS.map((c) => {
          const isActive = mediaFilter === c.media;
          return (
            <button
              key={c.key}
              className={cn(
                "px-3.5 py-2 rounded-lg text-[12px] font-semibold border transition-all duration-150",
                isActive
                  ? "bg-accent border-accent text-white"
                  : "bg-transparent border-border text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              )}
              onClick={() => handleMediaClick(c.media)}
            >
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
