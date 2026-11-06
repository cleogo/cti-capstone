'use client';

/**
 * The chat page (docs/ui-design-decisions.md D4). Mobile first: one full-height column with
 * a sticky top bar, one scroll area and a sticky composer. From 1024 px, the latest sources
 * also show in a side panel. The top-bar toggle hides all sources and remembers the choice.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { ChatMessage, TypingRow } from './components/ChatMessage';
import { EmptyState } from './components/EmptyState';
import { SourcesPanel } from './components/SourcesPanel';
import { QuoteList } from './components/QuoteList';
import { ProductSheet } from './components/ProductSheet';
import { TRAY_MAX } from './components/ProductList';
import type { ShownProduct } from '@/lib/display';
import { IconAlert, IconPanel, IconPlus, IconReplay, IconSend, IconStop, Logo } from './components/ui';
import { sourcesFromMessage } from '@/lib/sources';

const SOURCES_KEY = 'cti.showSources';

/** Sources default to on (R4). The choice persists per browser. */
function useShowSources(): [boolean, () => void] {
  const [show, setShow] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(SOURCES_KEY) === '0') setShow(false);
    } catch {}
  }, []);
  const toggle = () =>
    setShow((s) => {
      try {
        localStorage.setItem(SOURCES_KEY, s ? '0' : '1');
      } catch {}
      return !s;
    });
  return [show, toggle];
}

export default function Page() {
  const { messages, setMessages, input, setInput, handleInputChange, handleSubmit, append, status, error, stop, reload, addToolResult } =
    useChat({ api: '/api/chat', maxSteps: 8 });
  const [showSources, toggleSources] = useShowSources();
  const [announce, setAnnounce] = useState('');
  const [sheet, setSheet] = useState<ShownProduct | null>(null);
  const closeSheet = useCallback(() => setSheet(null), []);
  // Compare tray (spec 6.4): up to TRAY_MAX codes, kept across answers.
  const [tray, setTray] = useState<string[]>([]);
  const addToTray = (code: string) => setTray((t) => (t.includes(code) || t.length >= TRAY_MAX ? t : [...t, code]));
  const toggleTray = (code: string) =>
    setTray((t) => (t.includes(code) ? t.filter((c) => c !== code) : t.length >= TRAY_MAX ? t : [...t, code]));
  const scroller = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);

  // A tool call with no result yet (the appliance checklist) must be answered
  // before the next message, or the API rejects the history.
  const awaitingTool = messages.some((m) =>
    (m.toolInvocations ?? []).some((inv) => inv.toolName === 'showApplianceChecklist' && inv.state === 'call'),
  );
  const isStreaming = status === 'streaming' || status === 'submitted';
  const isBusy = isStreaming || awaitingTool;
  const last = messages[messages.length - 1];

  // Latest assistant turn's sources, for the desktop panel — see SourcesPanel.tsx.
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const panelSources = lastAssistant ? sourcesFromMessage(lastAssistant) : [];

  // A new quotation result refreshes the saved quote list.
  const quoteResults = messages.reduce(
    (n, m) => n + (m.toolInvocations ?? []).filter((inv) => inv.toolName === 'buildQuotation' && inv.state === 'result').length,
    0,
  );

  // Follow the conversation while the user is near the end. Do not pull them back down if
  // they scrolled up to read an earlier answer.
  const lastLen = (last?.content.length ?? 0) + (last?.toolInvocations?.length ?? 0);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 240) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, lastLen, status]);

  // One polite announcement per finished answer. The streaming text itself is not live.
  useEffect(() => {
    if (status === 'ready' && last?.role === 'assistant') setAnnounce('Answer ready');
    if (status === 'error') setAnnounce('The answer failed to load');
  }, [status, last?.role]);

  const ask = (prompt: string) => append({ role: 'user', content: prompt });

  function newChat() {
    stop();
    setMessages([]);
    setInput('');
    setTray([]);
    setSheet(null);
  }

  const topBtn =
    'flex min-h-[40px] min-w-[40px] items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.97] sm:px-3';

  return (
    <div className="print-unclip flex h-dvh flex-col bg-paper text-ink">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-1.5 bg-ink px-3 text-white sm:gap-3 sm:px-4 print:hidden">
        <Logo size={32} />
        <div className="ml-1 min-w-0 flex-1">
          <div className="truncate font-heading text-[15px] font-semibold leading-tight">CTI Product Advisor</div>
          <div className="hidden text-[11px] text-white/60 sm:block">Can Trading Inc. · list prices in PHP</div>
        </div>
        <QuoteList refreshKey={quoteResults} />
        <button
          type="button"
          onClick={toggleSources}
          aria-pressed={showSources}
          title={showSources ? 'Hide sources' : 'Show sources'}
          className={`${topBtn} ${showSources ? 'text-brand' : 'text-white/70'} hover:bg-white/10`}
        >
          <IconPanel on={showSources} />
          <span className="sr-only sm:not-sr-only">Sources</span>
        </button>
        <button type="button" onClick={newChat} disabled={messages.length === 0} title="New chat" className={`${topBtn} bg-white/10 font-medium hover:bg-white/20 disabled:opacity-40`}>
          <IconPlus />
          <span className="sr-only sm:not-sr-only">New chat</span>
        </button>
      </header>

      <div className="print-unclip flex min-h-0 flex-1">
        <main className="print-unclip flex min-w-0 flex-1 flex-col">
          <div ref={scroller} className="print-unclip min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-busy={isStreaming}>
            {messages.length === 0 ? (
              <EmptyState onPick={ask} />
            ) : (
              <ul className="mx-auto max-w-3xl space-y-5 px-4 py-5 sm:py-6">
                {messages.map((m) => (
                  <ChatMessage
                    key={m.id}
                    message={m}
                    addToolResult={addToolResult}
                    busy={isStreaming && m === last}
                    showSources={showSources}
                    onAsk={ask}
                    onOpen={setSheet}
                    tray={tray}
                    onToggleTray={toggleTray}
                  />
                ))}
                {status === 'submitted' && last?.role === 'user' && <TypingRow />}
                {error && (
                  <li className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
                    <IconAlert className="h-5 w-5" />
                    <span className="flex-1">Something went wrong answering that. Your message is kept.</span>
                    <button
                      type="button"
                      onClick={() => reload()}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-medium text-red-800 ring-1 ring-red-200 transition hover:bg-red-100 active:scale-[0.97]"
                    >
                      <IconReplay className="h-4 w-4" /> Retry
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>

          {/* Composer */}
          <form
            ref={form}
            onSubmit={handleSubmit}
            className="shrink-0 border-t border-line bg-paper/95 px-3 pt-2 backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:pt-3 print:hidden"
          >
            <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-line bg-white p-1.5 shadow-sm transition focus-within:border-ink focus-within:ring-1 focus-within:ring-ink sm:p-2">
              <label htmlFor="ask" className="sr-only">
                Ask about a product
              </label>
              <textarea
                id="ask"
                rows={1}
                value={input}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    if (input.trim() && !isBusy) form.current?.requestSubmit();
                  }
                }}
                disabled={isBusy}
                enterKeyHint="send"
                placeholder={awaitingTool ? 'Tick your appliances above, or press Skip…' : "Ask about a product, a price, or what's under ₱500…"}
                className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2.5 text-base text-ink placeholder:text-faint focus:outline-none disabled:cursor-not-allowed sm:text-[15px] [field-sizing:content]"
              />
              {isStreaming ? (
                <button
                  type="button"
                  onClick={stop}
                  className="flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-xl bg-ink px-3 font-medium text-white transition hover:bg-ink/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 active:scale-[0.97] sm:px-4"
                >
                  <IconStop className="h-4 w-4" />
                  <span className="sr-only sm:not-sr-only">Stop</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() || isBusy}
                  className="flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-xl bg-brand px-3 font-medium text-ink transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 sm:px-4"
                >
                  <IconSend />
                  <span className="sr-only sm:not-sr-only">Send</span>
                </button>
              )}
            </div>
            <p className="mx-auto mt-1.5 hidden max-w-3xl text-center text-[11px] text-faint sm:block">
              Prices are CTI list prices in PHP. Photos are for reference. Check stock and lead time with CTI sales.
            </p>
          </form>
        </main>

        {messages.length > 0 && showSources && <SourcesPanel sources={panelSources} />}
      </div>

      <ProductSheet product={sheet} onClose={closeSheet} onAsk={ask} onCompare={addToTray} />

      <div className="sr-only" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}
