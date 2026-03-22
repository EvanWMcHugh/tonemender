const REVIEWER_EMAILS = {
  free: "free@tonemender.com",
  pro: "pro@tonemender.com",
} as const;

type ReviewerMode = keyof typeof REVIEWER_EMAILS;

function normalizeEmail(email?: string | null): string {
  return (email ?? "").trim().toLowerCase();
}

export function getReviewerMode(email?: string | null): ReviewerMode | null {
  const normalized = normalizeEmail(email);

  for (const [mode, value] of Object.entries(REVIEWER_EMAILS)) {
    if (normalized === value) {
      return mode as ReviewerMode;
    }
  }

  return null;
}

export function isReviewerEmail(email?: string | null): boolean {
  return getReviewerMode(email) !== null;
}

export function isFreeReviewer(email?: string | null): boolean {
  return getReviewerMode(email) === "free";
}

export function isProReviewer(email?: string | null): boolean {
  return getReviewerMode(email) === "pro";
}