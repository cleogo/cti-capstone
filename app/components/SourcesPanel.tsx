/**
 * Desktop panel (1024 px and wider): mirrors the latest assistant turn's sources beside the
 * chat, matching the spec's "sources panel" wording. Below `lg` there is no room for a
 * second column, and the per-answer sources under each answer (ChatMessage.tsx) are the
 * display there.
 *
 * The sources toggle in the top bar (page.tsx) hides this panel and the per-answer sources.
 * It defaults to on, so R4 ("retrieved sources are shown") holds until a user turns it off.
 *
 * This intentionally only ever shows the latest turn. An older answer keeps its own sources
 * under it.
 */
import type { Source } from '@/lib/sources';
import { SourceRow, sourceKey } from './SourceCard';
import { eyebrow } from './ui';

export function SourcesPanel({ sources }: { sources: Source[] }) {
  return (
    <aside className="print-unclip hidden w-80 shrink-0 animate-msg-in overflow-y-auto border-l border-line bg-white/60 p-4 lg:block" aria-label="Latest sources">
      <h2 className={`mb-3 text-muted ${eyebrow}`}>Latest sources</h2>
      {sources.length === 0 ? (
        <p className="text-sm text-faint">Sources for the current answer show here once retrieval completes.</p>
      ) : (
        <div className="space-y-2">
          {sources.map((s, i) => (
            <SourceRow key={sourceKey(s, i)} source={s} i={i} />
          ))}
        </div>
      )}
    </aside>
  );
}
