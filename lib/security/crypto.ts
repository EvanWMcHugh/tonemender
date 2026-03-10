// lib/security.ts
import crypto from "crypto";

/**
 * Default token size (32 bytes = 256 bits = 64 hex chars)
 * This is secure for auth tokens, reset tokens, email verification, etc.
 */
const DEFAULT_TOKEN_BYTES = 32;

/**
 * Generates a cryptographically secure random hex token
 * @param bytes number of random bytes (default 32 → 64 hex chars)
 */
export function generateToken(bytes: number = DEFAULT_TOKEN_BYTES): string {
  if (!Number.isInteger(bytes) || bytes <= 0 || bytes > 1024) {
    throw new Error("generateToken: bytes must be a positive integer ≤ 1024");
  }

  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Returns a SHA-256 hex digest of the input string
 */
export function sha256Hex(input: string): string {
  if (typeof input !== "string" || input.length === 0) {
    throw new Error("sha256Hex: input must be a non-empty string");
  }

  // Normalize input to avoid subtle hashing differences
  const normalized = input.normalize("NFKC");

  return crypto.createHash("sha256").update(normalized).digest("hex");
}