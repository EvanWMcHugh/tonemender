import crypto from "crypto";

/**
 * Generate a cryptographically secure random token
 * (returned as hex string)
 */
export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * SHA-256 hash helper (hex output)
 */
export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Backwards-compatible alias
 * (so existing imports don’t break)
 */
export const sha256 = sha256Hex;