import { admin } from '@/lib/supabase/admin';
import { getSecret } from '@/lib/secrets';
import { recordPaid, razorpaySignatureOk } from '@/lib/orders';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Each account has its own webhook URL (?b=<business id>) and its own webhook secret.
export async function POST(req: Request) {
  const bid = new URL(req.url).searchParams.get('b') ?? '';
  if (!uuid.test(bid)) return new Response('Bad request', { status: 400 });
  const raw = await req.text();
  const secret = await getSecret(bid, 'razorpay_webhook_secret');
  if (!razorpaySignatureOk(raw, req.headers.get('x-razorpay-signature'), secret)) return new Response('Invalid signature', { status: 401 });
  let ev: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { ev = JSON.parse(raw); } catch { return new Response('Bad request', { status: 400 }); }
  const db = admin();
  const linkId: string | undefined = ev?.payload?.payment_link?.entity?.id;
  if (!linkId) return new Response('OK');
  const { data: p } = await db.from('payments').select('id,amount,status').eq('business_id', bid).eq('provider_link_id', linkId).maybeSingle();
  if (!p) return new Response('OK');
  if (ev.event === 'payment_link.paid') {
    const paid = Number(ev?.payload?.payment_link?.entity?.amount_paid ?? ev?.payload?.payment?.entity?.amount);
    if (paid === Math.round(Number(p.amount) * 100)) await recordPaid(bid, p.id, ev?.payload?.payment?.entity?.id ?? null, ev);
    else console.error('razorpay amount mismatch', linkId, paid, p.amount);
  } else if (ev.event === 'payment_link.expired' || ev.event === 'payment_link.cancelled') {
    await db.from('payments').update({ status: 'failed' }).eq('id', p.id).eq('status', 'pending');
  }
  return new Response('OK');
}
