// lib/auth/reviewers.ts

/**
 * Internal reviewer accounts used for controlled review/testing flows.
 *
 * These accounts may be used for:
 * - App Store / Play review access
 * - CAPTCHA bypass
 * - controlled free/pro reviewer experiences
 *
 * Keep this list extremely small and explicit.
 */

const FREE_REVIEWER_EMAIL = "free@tonemender.com";
const PRO_REVIEWER_EMAIL = "pro@tonemender.com";

function normalizeEmail(email?: string | null): string {
  return (email ?? "").trim().toLowerCase();
}

export function isFreeReviewer(email?: string | null): boolean {
  return normalizeEmail(email) === FREE_REVIEWER_EMAIL;
}

export function isProReviewer(email?: string | null): boolean {
  return normalizeEmail(email) === PRO_REVIEWER_EMAIL;
}

export function isReviewerEmail(email?: string | null): boolean {
  const normalized = normalizeEmail(email);
  return normalized === FREE_REVIEWER_EMAIL || normalized === PRO_REVIEWER_EMAIL;
}

export function getReviewerMode(email?: string | null): "free" | "pro" | null {
  const normalized = normalizeEmail(email);

  if (normalized === FREE_REVIEWER_EMAIL) return "free";
  if (normalized === PRO_REVIEWER_EMAIL) return "pro";

  return null;
}