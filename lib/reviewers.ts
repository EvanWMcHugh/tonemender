export const REVIEWER_FREE_EMAILS = [
  "reviewer-free@yourdomain.com",
];

export const REVIEWER_PRO_EMAILS = [
  "reviewer-pro@yourdomain.com",
];

export const ALL_REVIEWER_EMAILS = [
  ...REVIEWER_FREE_EMAILS,
  ...REVIEWER_PRO_EMAILS,
];

export function isReviewer(email?: string | null) {
  return !!email && ALL_REVIEWER_EMAILS.includes(email);
}

export function isProReviewer(email?: string | null) {
  return !!email && REVIEWER_PRO_EMAILS.includes(email);
}