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

function normalizeEmail(email?: string | null): string | null {
  return email ? email.trim().toLowerCase() : null;
}

export function isReviewer(email?: string | null): boolean {
  const e = normalizeEmail(email);
  return !!e && (ALL_REVIEWER_EMAILS as readonly string[]).includes(e);
}

export function isProReviewer(email?: string | null): boolean {
  const e = normalizeEmail(email);
  return !!e && (REVIEWER_PRO_EMAILS as readonly string[]).includes(e);
}