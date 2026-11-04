/**
 * The OpenAI moderation endpoint, through fetch.
 *
 * Used on the user message (input guard) and on the final answer text
 * (answer guard). If the endpoint fails, the result is `{ flagged: false,
 * error }`: a moderation outage must not stop the shop answering. The caller
 * logs the error.
 */
export type Moderation = { flagged: boolean; categories: string[]; error?: string };

export async function moderate(text: string): Promise<Moderation> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { flagged: false, categories: [], error: 'OPENAI_API_KEY is not set' };
  try {
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: text }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { flagged: false, categories: [], error: `moderation HTTP ${res.status}` };
    const body = (await res.json()) as { results: { flagged: boolean; categories: Record<string, boolean> }[] };
    const r = body.results[0];
    return {
      flagged: r.flagged,
      categories: Object.entries(r.categories)
        .filter(([, v]) => v)
        .map(([k]) => k),
    };
  } catch (e) {
    return { flagged: false, categories: [], error: e instanceof Error ? e.message : String(e) };
  }
}
