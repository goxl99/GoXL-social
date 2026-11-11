const VERSION = process.env.META_GRAPH_VERSION || 'v23.0';
const G = `https://graph.facebook.com/${VERSION}`;

type Opts = { method?: 'GET' | 'POST'; token: string; body?: Record<string, unknown> };
async function graph<T = Record<string, any>>(path: string, { method = 'GET', token, body }: Opts): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(G + path, {
      method, signal: ctrl.signal,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message ?? `Meta API error ${res.status}`);
    return json as T;
  } finally { clearTimeout(timer); }
}

export const verifyWhatsApp = (phoneNumberId: string, token: string) => graph<{ display_phone_number?: string; verified_name?: string }>(`/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`, { token });
export const verifyPage = (pageId: string, token: string) => graph<{ name?: string }>(`/${encodeURIComponent(pageId)}?fields=name`, { token });
export const verifyInstagram = (igId: string, token: string) => graph<{ username?: string }>(`/${encodeURIComponent(igId)}?fields=username`, { token });

export const sendWhatsAppText = (phoneNumberId: string, token: string, to: string, text: string) =>
  graph(`/${encodeURIComponent(phoneNumberId)}/messages`, { method: 'POST', token, body: { messaging_product: 'whatsapp', to: to.replace(/\D/g, ''), type: 'text', text: { body: text, preview_url: true } } });
export const sendWhatsAppImage = (phoneNumberId: string, token: string, to: string, link: string, caption: string) =>
  graph(`/${encodeURIComponent(phoneNumberId)}/messages`, { method: 'POST', token, body: { messaging_product: 'whatsapp', to: to.replace(/\D/g, ''), type: 'image', image: { link, caption } } });

export async function publishFacebook(pageId: string, token: string, format: 'post' | 'story', imageUrl: string, caption: string) {
  const id = encodeURIComponent(pageId);
  if (format === 'post') {
    const r = await graph<{ id: string; post_id?: string }>(`/${id}/photos`, { method: 'POST', token, body: { url: imageUrl, caption, published: true } });
    return r.post_id ?? r.id;
  }
  const photo = await graph<{ id: string }>(`/${id}/photos`, { method: 'POST', token, body: { url: imageUrl, published: false } });
  const story = await graph<{ post_id?: string; success?: boolean }>(`/${id}/photo_stories`, { method: 'POST', token, body: { photo_id: photo.id } });
  return story.post_id ?? photo.id;
}

export async function publishInstagram(igId: string, token: string, format: 'post' | 'story', imageUrl: string, caption: string) {
  const id = encodeURIComponent(igId);
  const container = await graph<{ id: string }>(`/${id}/media`, { method: 'POST', token, body: format === 'story' ? { image_url: imageUrl, media_type: 'STORIES' } : { image_url: imageUrl, caption } });
  const out = await graph<{ id: string }>(`/${id}/media_publish`, { method: 'POST', token, body: { creation_id: container.id } });
  return out.id;
}
