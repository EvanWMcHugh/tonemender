// lib/security/crypto.ts
import "server-only";
import crypto from "crypto";

/**
 * Default token size:
 * 32 bytes = 256 bits = 64 hex characters.
 *
 * Suitable for auth tokens, reset tokens, email verification tokens,
 * session tokens, and other high-entropy secrets.
 */
const DEFAULT_TOKEN_BYTES = 32;
const MAX_TOKEN_BYTES = 1024;

/**
 * Generates a cryptographically secure random hex token.
 *
 * @param bytes Number of random bytes to generate.
 * Default: 32 bytes -> 64 hex characters.
 */
export function generateToken(bytes: number = DEFAULT_TOKEN_BYTES): string {
  if (!Number.isInteger(bytes) || bytes <= 0 || bytes > MAX_TOKEN_BYTES) {
    throw new Error(
      `generateToken: bytes must be a positive integer <= ${MAX_TOKEN_BYTES}`
    );
  }

  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Returns a SHA-256 hex digest of the exact input provided.
 *
 * Accepts either a string or a Buffer.
 * This helper does not normalize or transform input.
 */
export function sha256Hex(input: string | Buffer): string {
  if (typeof input !== "string" && !Buffer.isBuffer(input)) {
    throw new Error("sha256Hex: input must be a string or Buffer");
  }

  if (input.length === 0) {
    throw new Error("sha256Hex: input must be non-empty");
  }

  return crypto.createHash("sha256").update(input).digest("hex");
}