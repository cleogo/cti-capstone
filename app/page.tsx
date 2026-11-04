'use client';

import { useChat } from '@ai-sdk/react';
import { ChatMessage } from './components/ChatMessage';
import { EmptyState } from './components/EmptyState';
import { SourcesPanel } from './components/SourcesPanel';
import { QuoteList } from './components/QuoteList';
import { sourcesFromMessage } from '@/lib/sources';

export default function Page() {
  const { messages, input, handleInputChange, handleSubmit, append, status, error, stop, addToolResult } =
    useChat({ api: '/api/chat', maxSteps: 8 });

  // A tool call with no result yet (the appliance checklist) must be answered
  // before the next message, or the API rejects the history.
  const awaitingTool = messages.some((m) =>
    (m.toolInvocations ?? []).some((inv) => inv.toolName === 'showApplianceChecklist' && inv.state === 'call'),
  );
  const isStreaming = status === 'streaming' || status === 'submitted';
  const isBusy = isStreaming || awaitingTool;

  // Latest assistant turn's sources, for the desktop panel — see
  // SourcesPanel.tsx for why only the latest turn.
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const panelSources = lastAssistant ? sourcesFromMessage(lastAssistant) : [];

  // A new quotation result refreshes the saved quote list.
  const quoteResults = messages.reduce(
    (n, m) => n + (m.toolInvocations ?? []).filter((inv) => inv.toolName === 'buildQuotation' && inv.state === 'result').length,
    0,
  );

  function askChip(prompt: string) {
    append({ role: 'user', content: prompt });
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">CTI Product Assistant</h1>
        <p className="text-sm text-slate-500">
          Ask about CTI products and prices. Sources appear under each answer.
        </p>
      </header>

      <div className="flex gap-6">
        <div className="min-w-0 flex-1">
          <QuoteList refreshKey={quoteResults} />
          {messages.length === 0 ? (
            <EmptyState onPick={askChip} />
          ) : (
            <ul className="mb-6 min-h-[200px] space-y-4">
              {messages.map((m) => (
                <ChatMessage key={m.id} message={m} addToolResult={addToolResult} />
              ))}
              {error && (
                <li className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  Something went wrong answering that — try again.
                </li>
              )}
            </ul>
          )}

          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              value={input}
              onChange={handleInputChange}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 focus:border-cyan-500 focus:outline-none"
              placeholder={
                awaitingTool ? 'Tick your appliances above, or press Skip…' : "Ask about a product, a price, or what's under ₱500…"
              }
              disabled={isBusy}
            />
            {isStreaming ? (
              <button
                type="button"
                onClick={stop}
                className="rounded-lg bg-slate-200 px-4 py-2 text-slate-700 hover:bg-slate-300"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input}
                className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-40"
              >
                Send
              </button>
            )}
          </form>
        </div>

        {messages.length > 0 && <SourcesPanel sources={panelSources} />}
      </div>
    </main>
  );
}
