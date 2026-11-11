import { after } from 'next/server';
import { appSecretForPayload, handleWhatsAppPayload, signatureOk, verifyTokenValid } from '@/lib/inbound';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Meta calls this once to verify the webhook URL.
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get('hub.mode') === 'subscribe' && (await verifyTokenValid(u.searchParams.get('hub.verify_token')))) {
    return new Response(u.searchParams.get('hub.challenge') ?? '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return new Response('Bad request', { status: 400 }); }
  if (!signatureOk(raw, req.headers.get('x-hub-signature-256'), await appSecretForPayload(payload))) return new Response('Invalid signature', { status: 401 });
  after(async () => { try { await handleWhatsAppPayload(payload); } catch (e) { console.error('whatsapp webhook failed', e); } });
  return new Response('OK', { status: 200 });
}
