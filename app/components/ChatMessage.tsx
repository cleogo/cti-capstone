/**
 * One message in the thread.
 *
 * Tool-call status (state === 'call') renders while retrieval is running, so
 * the user sees "Searching…" instead of a dead pause — R2/spec's Interface
 * section. Sources render off state === 'result', which the starter already
 * reaches before the text part begins streaming; this component just reads
 * that state rather than waiting for message completion.
 */
import type { Message } from 'ai';
import { Markdown } from './Markdown';
import { SourceList } from './SourceList';
import { ApplianceChecklist, type ChecklistResult } from './ApplianceChecklist';
import { RecommendationCard } from './RecommendationCard';
import { sourcesFromMessage } from '@/lib/sources';

const TOOL_STATUS_LABEL: Record<string, string> = {
  searchProducts: 'Searching products…',
  filterProducts: 'Filtering the catalog…',
  getProductDetails: 'Reading the product sheet…',
  compareProducts: 'Comparing products…',
  lookupApplianceWattage: 'Looking up appliance watts…',
  recommendPowerStation: 'Sizing a power station…',
};

/** A client-side tool waits for the user, not for the server. */
const CLIENT_TOOLS = new Set(['showApplianceChecklist']);

export type AddToolResult = (r: { toolCallId: string; result: unknown }) => void;

export function ChatMessage({ message, addToolResult }: { message: Message; addToolResult?: AddToolResult }) {
  const isUser = message.role === 'user';

  const invocations = message.toolInvocations ?? [];
  const runningTools = invocations.filter((inv) => inv.state === 'call' && !CLIENT_TOOLS.has(inv.toolName));
  const cards = invocations.filter(
    (inv) =>
      (inv.toolName === 'showApplianceChecklist') ||
      (inv.toolName === 'recommendPowerStation' && inv.state === 'result'),
  );
  const sources = isUser ? [] : sourcesFromMessage(message);
  // A turn that so far holds only a card (the checklist) has no text bubble.
  const emptyBubble = !isUser && !message.content && runningTools.length === 0 && cards.length > 0;

  return (
    <li className={isUser ? 'flex justify-end' : 'flex flex-col items-start'}>
      <div
        className={
          isUser
            ? 'inline-block max-w-[85%] rounded-2xl bg-cyan-600 px-4 py-2 text-white'
            : `inline-block max-w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 sm:max-w-[85%]${emptyBubble ? ' hidden' : ''}`
        }
      >
        {isUser ? (
          <span>{message.content}</span>
        ) : (
          <>
            {runningTools.map((inv) => (
              <div
                key={inv.toolCallId}
                className="mb-1.5 flex items-center gap-1.5 text-xs text-slate-400"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-500" />
                {TOOL_STATUS_LABEL[inv.toolName] ?? `Running ${inv.toolName}…`}
              </div>
            ))}
            {message.content ? (
              <Markdown text={message.content} />
            ) : runningTools.length === 0 && cards.length === 0 ? (
              <span className="text-slate-400">…</span>
            ) : null}
          </>
        )}
      </div>

      {cards.map((inv) => {
        if (inv.toolName === 'recommendPowerStation' && inv.state === 'result') {
          return <RecommendationCard key={inv.toolCallId} loads={inv.args.loads} result={inv.result} />;
        }
        if (inv.state === 'result') {
          const r = inv.result as ChecklistResult;
          return (
            <div key={inv.toolCallId} className="mt-1 text-xs text-slate-500">
              {'skipped' in r ? 'Checklist skipped.' : `Checklist sent: ${r.loads.length} appliance(s).`}
            </div>
          );
        }
        return (
          <div key={inv.toolCallId} className="w-full sm:max-w-[85%]">
            <ApplianceChecklist
              userType={inv.args.userType}
              onSubmit={(result) => addToolResult?.({ toolCallId: inv.toolCallId, result })}
            />
          </div>
        );
      })}

      {/*
       * lg:hidden — on desktop the side panel is the sources display; showing
       * them again here would just duplicate the latest turn's cards. Below
       * `lg` there's no panel, so these are the only sources a mobile user
       * ever sees. Trade-off: on desktop, an EARLIER answer's sources are not
       * visible anywhere once a later turn has run, because the panel only
       * ever mirrors the latest turn. Accepted deliberately — see
       * docs/week14/plan.md, M5.
       */}
      {!isUser && sources.length > 0 && (
        <div className="mt-1 w-full max-w-full sm:max-w-[85%] lg:hidden">
          <SourceList sources={sources} />
        </div>
      )}
    </li>
  );
}
