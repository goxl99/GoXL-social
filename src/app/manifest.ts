import type { MetadataRoute } from 'next';

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '/business-live';

/** Lets people install GoXL Commerce from any modern browser (Add to Home screen / Install app). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'GoXL Commerce',
    short_name: 'GoXL',
    description: 'Promote everywhere. Respond instantly. Convert intelligently. Deliver successfully.',
    id: `${base}/`,
    start_url: `${base}/dashboard`,
    scope: `${base}/`,
    display: 'standalone',
    background_color: '#0F2A1E',
    theme_color: '#0F2A1E',
    icons: [
      { src: `${base}/pwa-icon/192`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${base}/pwa-icon/512`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${base}/pwa-icon/512`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
