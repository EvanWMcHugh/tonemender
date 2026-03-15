const FREE_REVIEWER_EMAIL = "free@tonemender.com";
const PRO_REVIEWER_EMAIL = "pro@tonemender.com";

function normalizeEmail(email?: string | null) {
  return (email ?? "").trim().toLowerCase();
}

export function isReviewerEmail(email?: string | null) {
  const normalized = normalizeEmail(email);
  return normalized === FREE_REVIEWER_EMAIL || normalized === PRO_REVIEWER_EMAIL;
}

export function isFreeReviewer(email?: string | null) {
  return normalizeEmail(email) === FREE_REVIEWER_EMAIL;
}

export function isProReviewer(email?: string | null) {
  return normalizeEmail(email) === PRO_REVIEWER_EMAIL;
}

export function getReviewerMode(email?: string | null): "free" | "pro" | null {
  if (isFreeReviewer(email)) return "free";
  if (isProReviewer(email)) return "pro";
  return null;
}