export const ACCOUNT_TYPES = ['business', 'creator', 'agency'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export const ACCOUNT_LABEL: Record<AccountType, string> = { business: 'Business owner', creator: 'Personal brand or influencer', agency: 'Agency' };
export const label = (t: string | null | undefined) => ACCOUNT_LABEL[(t as AccountType) in ACCOUNT_LABEL ? (t as AccountType) : 'business'];
/** Services, courses and digital offers have no stock count; they are stored with this large number. */
export const UNLIMITED = 100000;
