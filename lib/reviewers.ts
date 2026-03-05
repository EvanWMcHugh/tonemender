/**
 * Reviewer allowlists.
 * Keep exports as arrays to avoid breaking existing `.includes()` usage across the app.
 */

export const REVIEWER_FREE_EMAILS = ["free@tonemender.com"] as const;
export const REVIEWER_PRO_EMAILS = ["pro@tonemender.com"] as const;

export const ALL_REVIEWER_EMAILS = [
  ...REVIEWER_FREE_EMAILS,
  ...REVIEWER_PRO_EMAILS,
] as const;

// ✅ Force these to be Set<string> so `.has()` accepts normalized strings
const REVIEWER_SET: ReadonlySet<string> = new Set<string>(
  ALL_REVIEWER_EMAILS as readonly string[]
);

const PRO_REVIEWER_SET: ReadonlySet<string> = new Set<string>(
  REVIEWER_PRO_EMAILS as readonly string[]
);

function normalizeEmail(email?: string | null): string | null {
  if (!email) return null;
  return email.trim().toLowerCase();
}

export function isReviewer(email?: string | null): boolean {
  const normalized = normalizeEmail(email);
  return !!normalized && REVIEWER_SET.has(normalized);
}

export function isProReviewer(email?: string | null): boolean {
  const normalized = normalizeEmail(email);
  return !!normalized && PRO_REVIEWER_SET.has(normalized);
}