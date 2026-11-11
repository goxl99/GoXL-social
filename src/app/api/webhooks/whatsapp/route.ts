import { after } from 'next/server';
import { handleWhatsAppPayload, signatureOk } from '@/lib/inbound';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Meta calls this once to verify the webhook URL.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && u.searchParams.get('hub.mode') === 'subscribe' && u.searchParams.get('hub.verify_token') === token) {
    return new Response(u.searchParams.get('hub.challenge') ?? '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!signatureOk(raw, req.headers.get('x-hub-signature-256'), process.env.META_APP_SECRET)) return new Response('Invalid signature', { status: 401 });
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return new Response('Bad request', { status: 400 }); }
  after(async () => { try { await handleWhatsAppPayload(payload); } catch (e) { console.error('whatsapp webhook failed', e); } });
  return new Response('OK', { status: 200 });
}
