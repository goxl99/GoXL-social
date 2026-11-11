import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

const ALLOWED = [180, 192, 512];

/** GoXL app icon for the install manifest and the home-screen shortcut. Public and cacheable. */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const n = Number((await params).size.replace(/\.png$/, ''));
  const size = ALLOWED.includes(n) ? n : 192;
  const font = await readFile(path.join(process.cwd(), 'src/assets/fonts/montserrat-latin-700-normal.woff'));
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, background: '#0F2A1E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: size * 0.62, height: size * 0.62, borderRadius: size * 0.16, background: '#C8E600', color: '#0F2A1E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.3, fontWeight: 700, letterSpacing: -size * 0.012 }}>GX</div>
      </div>
    ),
    { width: size, height: size, fonts: [{ name: 'Montserrat', data: font, weight: 700 }], headers: { 'Cache-Control': 'public, max-age=86400, immutable' } },
  );
}
