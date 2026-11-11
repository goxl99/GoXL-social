/** Prefix for raw <img>/<a> URLs, which Next does not rewrite for the base path. */
export const bp = (p: string) => (process.env.NEXT_PUBLIC_BASE_PATH ?? '/business-live') + p;
export const IST = { timeZone: 'Asia/Kolkata' } as const;
export const fmtDT = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('en-IN', { ...IST, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '-');
export const fmtD = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('en-IN', { ...IST, day: 'numeric', month: 'short', year: 'numeric' }) : '-');
