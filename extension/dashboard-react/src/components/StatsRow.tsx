import type { Clip } from "../lib/api";

interface StatsRowProps {
  clips: Clip[];
}

export function StatsRow({ clips }: StatsRowProps) {
  const totalWords = clips.reduce((s, c) => s + (c.word_count || 0), 0);
  const domains = new Set(clips.map((c) => c.domain).filter(Boolean));
  const estTokens = Math.round(totalWords * 1.3);

  const stats = [
    { value: clips.length, label: "Clips" },
    { value: totalWords.toLocaleString(), label: "Words" },
    { value: domains.size, label: "Sources" },
    { value: `~${estTokens.toLocaleString()}`, label: "Est. Tokens" },
  ];

  return (
    <div className="grid grid-cols-4 max-md:grid-cols-2 gap-3 px-8 py-5">
      {stats.map((s) => (
        <div
          key={s.label}
          className="bg-surface border border-border rounded-[14px] px-5 py-[18px]"
        >
          <div className="text-[26px] font-extrabold tracking-[-1px] text-text-primary leading-none">
            {s.value}
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.8px] text-text-tertiary mt-1">
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}
