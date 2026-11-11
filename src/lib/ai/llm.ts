import { admin } from '@/lib/supabase/admin';
import { getSecret } from '@/lib/secrets';

export type Provider = 'anthropic' | 'openai';
export type AIConfig = { provider: Provider; key: string; model: string };
export type Msg = { role: 'user' | 'assistant'; content: string };

export const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
  openai: process.env.OPENAI_MODEL || 'gpt-4o-mini',
};

/** The account's own key first; GoXL's platform key (server environment) only as a fallback. Null means rules-only mode. */
export async function resolveAI(bid: string): Promise<AIConfig | null> {
  const { data: b } = await admin().from('businesses').select('ai_provider,ai_model').eq('id', bid).single();
  const provider = (b?.ai_provider === 'openai' ? 'openai' : 'anthropic') as Provider;
  let key: string | null = null;
  try { key = await getSecret(bid, provider === 'openai' ? 'ai_openai_key' : 'ai_anthropic_key'); } catch { key = null; }
  key = key || (provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY) || null;
  return key ? { provider, key, model: b?.ai_model || DEFAULT_MODEL[provider] } : null;
}

/** One text completion. Returns null on any failure so callers can fall back. */
export async function complete(ai: AIConfig, system: string, messages: Msg[], maxTokens = 700, timeoutMs = 20000): Promise<{ text: string } | { error: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    if (ai.provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'x-api-key': ai.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: ai.model, max_tokens: maxTokens, system, messages }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return { error: j?.error?.message ?? `Anthropic error ${res.status}` };
      return { text: String(j?.content?.[0]?.text ?? '') };
    }
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: `Bearer ${ai.key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: ai.model, max_tokens: maxTokens, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, ...messages] }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { error: j?.error?.message ?? `OpenAI error ${res.status}` };
    return { text: String(j?.choices?.[0]?.message?.content ?? '') };
  } catch (e) {
    return { error: (e as Error).name === 'AbortError' ? 'The AI provider took too long to answer.' : (e as Error).message };
  } finally { clearTimeout(timer); }
}
