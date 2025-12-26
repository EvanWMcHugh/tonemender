export const REVIEWER_FREE_EMAILS = [
  "free@tonemender.com",
];

export const REVIEWER_PRO_EMAILS = [
  "pro@tonemender.com",
];

export const ALL_REVIEWER_EMAILS = [
  ...REVIEWER_FREE_EMAILS,
  ...REVIEWER_PRO_EMAILS,
];

function normalize(email?: string | null) {
  return email?.toLowerCase() ?? null;
}

export function isReviewer(email?: string | null) {
  const e = normalize(email);
  return !!e && ALL_REVIEWER_EMAILS.includes(e);
}

export function isProReviewer(email?: string | null) {
  const e = normalize(email);
  return !!e && REVIEWER_PRO_EMAILS.includes(e);
}