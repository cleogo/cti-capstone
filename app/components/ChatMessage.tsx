'use client';
/**
 * One message in the thread (docs/ui-design-decisions.md D4, D6, D7).
 *
 * Tool-call status (state === 'call') renders while a tool runs, so the user sees
 * "Searching…" instead of a dead pause — R2/spec's Interface section. Sources render off
 * state === 'result', which arrives before the text part begins streaming; this component
 * reads that state rather than waiting for message completion.
 *
 * The assistant's chathead is the CTI logo. It pulses while the turn is still working.
 */
import type { Message } from 'ai';
import { Markdown } from './Markdown';
import { SourceList } from './SourceList';
import { ApplianceChecklist, ChecklistDone, type ChecklistResult } from './ApplianceChecklist';
import { RecommendationCard } from './RecommendationCard';
import { QuoteCard } from './QuoteCard';
import { ContactForm } from './ContactForm';
import { CompareCard } from './CompareCard';
import { IconAlert, IconSparkle, Logo } from './ui';
import { sourcesFromMessage } from '@/lib/sources';

const TOOL_STATUS_LABEL: Record<string, string> = {
  searchProducts: 'Searching products…',
  filterProducts: 'Filtering the catalog…',
  getProductDetails: 'Reading the product sheet…',
  compareProducts: 'Comparing products…',
  showProducts: 'Showing products…',
  lookupApplianceWattage: 'Looking up appliance watts…',
  recommendPowerStation: 'Sizing a power station…',
  buildQuotation: 'Building the draft quotation…',
  escalateToSales: 'Opening a ticket for CTI sales…',
};

/** Tools whose result renders as a card under the bubble. */
const RESULT_CARDS = new Set(['recommendPowerStation', 'buildQuotation', 'escalateToSales', 'compareProducts']);

/** A client-side tool waits for the user, not for the server. */
const CLIENT_TOOLS = new Set(['showApplianceChecklist']);

export type AddToolResult = (r: { toolCallId: string; result: unknown }) => void;

/** The "assistant is typing" row, shown after a send and before the first part arrives. */
export function TypingRow() {
  return (
    <li className="flex animate-msg-in gap-3">
      <Logo size={32} busy />
      <div className="rounded-2xl rounded-tl-md border border-line bg-white px-4 py-3 shadow-sm">
        <span className="flex items-center gap-1" role="status" aria-label="Assistant is typing">
          {[0, 150, 300].map((d) => (
            <span key={d} className="h-1.5 w-1.5 animate-dot rounded-full bg-muted" style={{ animationDelay: `${d}ms` }} />
          ))}
        </span>
      </div>
    </li>
  );
}

export function ChatMessage({
  message,
  addToolResult,
  busy = false,
  showSources = true,
  onAsk,
}: {
  message: Message;
  addToolResult?: AddToolResult;
  /** True while this is the latest turn and it is still streaming. */
  busy?: boolean;
  showSources?: boolean;
  onAsk?: (prompt: string) => void;
}) {
  if (message.role === 'user') {
    return (
      <li className="flex animate-msg-in-right justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[15px] text-white">
          {message.content}
        </div>
      </li>
    );
  }

  const invocations = message.toolInvocations ?? [];
  const runningTools = invocations.filter((inv) => inv.state === 'call' && !CLIENT_TOOLS.has(inv.toolName));
  const finishedTools = invocations.filter((inv) => inv.state === 'result' && !CLIENT_TOOLS.has(inv.toolName));
  const cards = invocations.filter(
    (inv) => inv.toolName === 'showApplianceChecklist' || (RESULT_CARDS.has(inv.toolName) && inv.state === 'result'),
  );

  // A compare table already shows its products, so the card row leaves them out.
  const compared = new Set(
    invocations.flatMap((inv) =>
      inv.toolName === 'compareProducts' && inv.state === 'result'
        ? ((inv.result as { products?: { code: string }[] }).products ?? []).map((p) => p.code)
        : [],
    ),
  );
  const sources = sourcesFromMessage(message).filter((s) => s.kind !== 'product' || !compared.has(s.code));

  const hasBubble = !!message.content || runningTools.length > 0 || cards.length === 0;
  const lastTool = runningTools[0] ?? finishedTools[finishedTools.length - 1];

  return (
    <li className="flex animate-msg-in gap-3">
      <div className="pt-0.5">
        <Logo size={32} busy={busy && !message.content} />
      </div>
      <div className="min-w-0 flex-1">
        {hasBubble && (
          <div className="inline-block max-w-full rounded-2xl rounded-tl-md border border-line bg-white px-4 py-2.5 shadow-sm sm:max-w-[92%]">
            {lastTool && (
              <div className={`mb-1 flex items-center gap-1.5 text-xs ${runningTools.length ? 'text-muted' : 'text-faint'}`}>
                <IconSparkle className="h-4 w-4" />
                {runningTools.length ? (
                  <span className="shimmer-text animate-shimmer font-medium">
                    {TOOL_STATUS_LABEL[lastTool.toolName] ?? `Running ${lastTool.toolName}…`}
                  </span>
                ) : (
                  <span>{(TOOL_STATUS_LABEL[lastTool.toolName] ?? lastTool.toolName).replace('…', '')} · done</span>
                )}
              </div>
            )}
            {message.content ? (
              <div className="text-ink">
                <Markdown text={message.content} />
              </div>
            ) : runningTools.length === 0 ? (
              <span className="flex items-center gap-1 py-1.5" role="status" aria-label="Assistant is typing">
                {[0, 150, 300].map((d) => (
                  <span key={d} className="h-1.5 w-1.5 animate-dot rounded-full bg-muted" style={{ animationDelay: `${d}ms` }} />
                ))}
              </span>
            ) : null}
          </div>
        )}

        {cards.map((inv) => {
          if (inv.toolName === 'recommendPowerStation' && inv.state === 'result') {
            return <RecommendationCard key={inv.toolCallId} loads={inv.args.loads} result={inv.result} />;
          }
          if (inv.toolName === 'buildQuotation' && inv.state === 'result') {
            return <QuoteCard key={inv.toolCallId} result={inv.result} />;
          }
          if (inv.toolName === 'compareProducts' && inv.state === 'result') {
            return <CompareCard key={inv.toolCallId} result={inv.result} />;
          }
          if (inv.toolName === 'escalateToSales' && inv.state === 'result') {
            const r = inv.result as { ticket_id?: string; error?: string };
            return r.ticket_id ? (
              <ContactForm key={inv.toolCallId} ticketId={r.ticket_id} />
            ) : (
              <div key={inv.toolCallId} className="mt-3 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <IconAlert className="h-4 w-4" /> The ticket could not be created. Please contact CTI sales directly.
              </div>
            );
          }
          if (inv.state === 'result') {
            return <ChecklistDone key={inv.toolCallId} result={inv.result as ChecklistResult} />;
          }
          return (
            <ApplianceChecklist
              key={inv.toolCallId}
              userType={inv.args.userType}
              onSubmit={(result) => addToolResult?.({ toolCallId: inv.toolCallId, result })}
            />
          );
        })}

        {showSources && sources.length > 0 && <SourceList sources={sources} onAsk={onAsk} />}
      </div>
    </li>
  );
}
