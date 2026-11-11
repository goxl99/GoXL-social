import type { Product } from '@/lib/ai/assistant';
import { complete, type AIConfig } from '@/lib/ai/llm';

export const CATEGORIES: Record<string, string> = {
  new_arrival: 'New arrival', offer: 'Offer or discount', festival: 'Festival greeting', restock: 'Back in stock', daily: 'Daily product highlight',
};
export const STYLES: Record<string, string> = { brand: 'Brand colours', forest: 'Deep forest', paper: 'Light paper' };
export const LANGS: Record<string, string> = { en: 'English', hi: 'Hindi', gu: 'Gujarati' };

const inr = (n: number) => '₹' + Number(n).toLocaleString('en-IN');
const offerOf = (p: Product) => (p.discount_price && p.discount_price < p.price ? p.discount_price : p.price);
const tag = (s: string) => '#' + s.replace(/[^\p{L}\p{N}]+/gu, '');

export type Copy = { headline: string; caption: string; hashtags: string };
type B = { name: string; city: string | null; phone: string | null };

export function templateCopy(b: B, p: Product, category: string, lang: 'en' | 'hi' | 'gu'): Copy {
  const price = offerOf(p), save = p.price - price;
  const opts = p.variants.length ? p.variants.join(', ') : '';
  const T = {
    en: {
      new_arrival: [`New: ${p.name}`, `Just in at ${b.name}: ${p.name}. ${p.description ?? ''} ${inr(price)}.${opts ? ` Available in ${opts}.` : ''} Message us to order.`],
      offer: [save > 0 ? `Save ${inr(save)}` : `${p.name} at ${inr(price)}`, `${p.name} now ${inr(price)}${save > 0 ? ` (MRP ${inr(p.price)}, you save ${inr(save)})` : ''}. Limited stock. Message us to order.`],
      festival: [`Festival offers at ${b.name}`, `Celebrate with ${p.name} at ${inr(price)}. Message us to order and we will deliver to your door.`],
      restock: [`Back in stock: ${p.name}`, `${p.name} is back at ${inr(price)}. Grab yours before it sells out. Message us to order.`],
      daily: [p.name, `${p.name}: ${p.description ?? 'a customer favourite'} ${inr(price)}. Message us to order.`],
    },
    hi: {
      new_arrival: [`नया: ${p.name}`, `${b.name} में आ गया: ${p.name}। कीमत ${inr(price)}।${opts ? ` उपलब्ध: ${opts}।` : ''} ऑर्डर के लिए मैसेज करें।`],
      offer: [save > 0 ? `${inr(save)} की बचत` : `${p.name} ${inr(price)} में`, `${p.name} अब ${inr(price)} में${save > 0 ? ` (MRP ${inr(p.price)})` : ''}। सीमित स्टॉक। ऑर्डर के लिए मैसेज करें।`],
      festival: [`${b.name} में त्योहार ऑफ़र`, `${p.name} सिर्फ ${inr(price)} में। ऑर्डर के लिए मैसेज करें।`],
      restock: [`फिर से उपलब्ध: ${p.name}`, `${p.name} फिर से ${inr(price)} में उपलब्ध है। ऑर्डर के लिए मैसेज करें।`],
      daily: [p.name, `${p.name} ${inr(price)} में। ऑर्डर के लिए मैसेज करें।`],
    },
    gu: {
      new_arrival: [`નવું: ${p.name}`, `${b.name} માં આવી ગયું: ${p.name}. કિંમત ${inr(price)}.${opts ? ` ઉપલબ્ધ: ${opts}.` : ''} ઓર્ડર માટે મેસેજ કરો.`],
      offer: [save > 0 ? `${inr(save)} ની બચત` : `${p.name} ${inr(price)} માં`, `${p.name} હવે ${inr(price)} માં${save > 0 ? ` (MRP ${inr(p.price)})` : ''}. મર્યાદિત સ્ટોક. ઓર્ડર માટે મેસેજ કરો.`],
      festival: [`${b.name} માં તહેવાર ઓફર`, `${p.name} માત્ર ${inr(price)} માં. ઓર્ડર માટે મેસેજ કરો.`],
      restock: [`ફરી ઉપલબ્ધ: ${p.name}`, `${p.name} ફરી ${inr(price)} માં ઉપલબ્ધ છે. ઓર્ડર માટે મેસેજ કરો.`],
      daily: [p.name, `${p.name} ${inr(price)} માં. ઓર્ડર માટે મેસેજ કરો.`],
    },
  }[lang] as unknown as Record<string, [string, string]>;
  const [headline, caption] = T[category] ?? T.daily;
  const tags = [tag(b.name), p.category ? tag(p.category) : '', b.city ? tag(b.city) : '', '#ShopLocal'].filter(Boolean);
  return { headline: headline.slice(0, 60), caption: caption.replace(/\s+/g, ' ').trim(), hashtags: [...new Set(tags)].join(' ') };
}

/** Uses the account's AI provider when configured; every rupee amount must match the product's real prices, else falls back to the template. */
export async function generateCopy(b: B & { tone: string | null }, p: Product, category: string, lang: 'en' | 'hi' | 'gu', ai: AIConfig | null): Promise<Copy & { source: 'ai' | 'template' }> {
  const fallback = { ...templateCopy(b, p, category, lang), source: 'template' as const };
  if (!ai) return fallback;
  const allowed = new Set([p.price, offerOf(p), p.price - offerOf(p)]);
  const system = `You write short social media posts for small Indian businesses. Language: ${LANGS[lang]}. Tone: ${b.tone ?? 'Warm and simple'}. Use only the facts given. Mention only these prices: selling price ${offerOf(p)}, MRP ${p.price}. Never invent discounts, stock claims, delivery promises or offers. Reply with ONE JSON object only: {"headline": string (max 45 chars), "caption": string (max 350 chars, ends with a call to message the business), "hashtags": string (4 to 6 hashtags)}`;
  const user = JSON.stringify({ business: b.name, city: b.city, post_type: CATEGORIES[category], product: { name: p.name, category: p.category, description: p.description, variants: p.variants, sizes: p.sizes, selling_price: offerOf(p), mrp: p.price } });
  const r = await complete(ai, system, [{ role: 'user', content: user }], 500);
  if ('error' in r) return fallback;
  try {
    const t = r.text;
    const j = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
    if (typeof j.headline !== 'string' || typeof j.caption !== 'string' || !j.headline.trim() || !j.caption.trim()) return fallback;
    const nums = [...`${j.headline} ${j.caption}`.matchAll(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/gi)].map((m) => Number(m[1].replace(/,/g, '')));
    if (!nums.every((n) => allowed.has(n))) return fallback;
    return { headline: j.headline.trim().slice(0, 60), caption: j.caption.trim().slice(0, 600), hashtags: String(j.hashtags ?? fallback.hashtags).slice(0, 200), source: 'ai' };
  } catch { return fallback; }
}

export const fullCaption = (c: { caption: string; hashtags: string | null }, code?: string | null) =>
  [c.caption, c.hashtags, code ? `Ref ${code}` : ''].filter(Boolean).join('\n\n');

export const TARGETS: Record<string, [string, string]> = {
  instagram_post: ['instagram', 'post'], instagram_story: ['instagram', 'story'],
  facebook_post: ['facebook', 'post'], facebook_story: ['facebook', 'story'], whatsapp_status: ['whatsapp', 'status'],
};
export const TARGET_LABELS: Record<string, string> = {
  instagram_post: 'Instagram post', instagram_story: 'Instagram story', facebook_post: 'Facebook post', facebook_story: 'Facebook story', whatsapp_status: 'WhatsApp status (share manually)',
};
