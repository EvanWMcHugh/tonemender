// lib/security.ts
import crypto from "crypto";

/**
 * Generates a cryptographically secure random hex token
 * @param bytes number of random bytes (default 32 → 64 hex chars)
 */
export function generateToken(bytes: number = 32): string {
  if (!Number.isInteger(bytes) || bytes <= 0) {
    throw new Error("generateToken: bytes must be a positive integer");
  }

  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Returns a SHA-256 hex digest of the input string
 */
export function sha256Hex(input: string): string {
  if (typeof input !== "string" || !input.length) {
    throw new Error("sha256Hex: input must be a non-empty string");
  }

  return crypto.createHash("sha256").update(input).digest("hex");
}