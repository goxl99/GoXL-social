import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { admin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIZES: Record<string, [number, number]> = { post: [1080, 1350], square: [1080, 1080], story: [1080, 1920] };
const inr = (n: number) => '₹' + Number(n).toLocaleString('en-IN');
const font = (f: string) => readFile(path.join(process.cwd(), 'src/assets/fonts', f));

async function loadImage(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    let buf = Buffer.from(await res.arrayBuffer());
    let type = res.headers.get('content-type') ?? 'image/jpeg';
    if (type.includes('webp')) {
      try {
        const sharp = (await import('sharp')).default;
        buf = await sharp(buf).png().toBuffer();
        type = 'image/png';
      } catch { return null; }
    }
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch { return null; }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 });
  const db = admin();
  const { data: c } = await db.from('creatives').select('*, product:products(name,price,discount_price,image_paths), business:businesses(name,brand_primary,brand_accent,logo_path)').eq('id', id).maybeSingle();
  if (!c) return new Response('Not found', { status: 404 });
  const r = new URL(req.url).searchParams.get('r') ?? 'post';
  const [w, h] = SIZES[r] ?? SIZES.post;
  const story = r === 'story';
  const biz = c.business as { name: string; brand_primary: string; brand_accent: string; logo_path: string | null };
  const prod = c.product as { name: string; price: number; discount_price: number | null; image_paths: string[] } | null;
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/gx-business-assets/`;
  const photo = await loadImage(c.extra_image_path ? base + c.extra_image_path : prod?.image_paths?.[0] ? base + prod.image_paths[0] : null);
  const logo = await loadImage(biz.logo_path ? base + biz.logo_path : null);

  const paper = c.style === 'paper';
  const bg = c.style === 'brand' ? biz.brand_primary : c.style === 'forest' ? '#1B4332' : '#F5F7F2';
  const fg = paper ? '#1B4332' : '#FFFFFF';
  const accent = c.style === 'paper' ? '#1B4332' : biz.brand_accent;
  const accentFg = c.style === 'paper' ? '#FFFFFF' : '#1B4332';
  const price = prod ? (prod.discount_price && prod.discount_price < prod.price ? prod.discount_price : prod.price) : null;
  const mrp = prod && prod.discount_price && prod.discount_price < prod.price ? prod.price : null;
  const photoH = Math.round(h * (story ? 0.42 : 0.5));

  const fonts = await Promise.all([font('montserrat-latin-500-normal.woff'), font('montserrat-latin-700-normal.woff'), font('noto-sans-devanagari-devanagari-700-normal.woff'), font('noto-sans-gujarati-gujarati-700-normal.woff')]);
  const img = new ImageResponse(
    (
      <div style={{ width: w, height: h, display: 'flex', flexDirection: 'column', background: bg, color: fg, fontFamily: 'Montserrat', padding: 64, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {logo ? <img src={logo} width={72} height={72} style={{ borderRadius: 16, objectFit: 'cover' }} alt="" /> : <div style={{ width: 72, height: 72, borderRadius: 16, background: accent, color: accentFg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, fontWeight: 700 }}>{biz.name[0]}</div>}
          <div style={{ fontSize: 34, fontWeight: 700 }}>{biz.name}</div>
        </div>
        {photo ? (
          <div style={{ display: 'flex', height: photoH, borderRadius: 28, overflow: 'hidden', border: `6px solid ${accent}` }}>
            <img src={photo} width={w - 128 - 12} height={photoH - 12} style={{ objectFit: 'cover' }} alt="" />
          </div>
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: c.headline.length > 28 ? 64 : 84, fontWeight: 700, lineHeight: 1.1, display: 'flex' }}>{c.headline}</div>
          {price !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ display: 'flex', background: accent, color: accentFg, fontSize: 56, fontWeight: 700, padding: '12px 32px', borderRadius: 18 }}>{inr(price)}</div>
              {mrp !== null && <div style={{ display: 'flex', fontSize: 36, fontWeight: 500, textDecoration: 'line-through', opacity: 0.7 }}>{inr(mrp)}</div>}
            </div>
          )}
          <div style={{ display: 'flex', fontSize: 28, fontWeight: 500, opacity: 0.85 }}>Message us to order</div>
        </div>
      </div>
    ),
    { width: w, height: h, fonts: [{ name: 'Montserrat', data: fonts[0], weight: 500 }, { name: 'Montserrat', data: fonts[1], weight: 700 }, { name: 'Montserrat', data: fonts[2], weight: 700 }, { name: 'Montserrat', data: fonts[3], weight: 700 }], headers: { 'Cache-Control': 'public, max-age=300' } },
  );
  // Instagram only accepts JPEG, so ?f=jpg converts the PNG output.
  if (new URL(req.url).searchParams.get('f') === 'jpg') {
    try {
      const sharp = (await import('sharp')).default;
      const jpg = await sharp(Buffer.from(await img.arrayBuffer())).jpeg({ quality: 90 }).toBuffer();
      return new Response(new Uint8Array(jpg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=300' } });
    } catch { return new Response('Image conversion failed', { status: 500 }); }
  }
  return img;
}
