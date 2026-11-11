'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Re-fetches server data every few seconds so new messages appear without a manual reload. Pauses while the tab is hidden. */
export default function AutoRefresh({ every = 8000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible' && !(document.activeElement instanceof HTMLTextAreaElement && document.activeElement.value)) router.refresh(); }, every);
    return () => clearInterval(t);
  }, [router, every]);
  return null;
}
