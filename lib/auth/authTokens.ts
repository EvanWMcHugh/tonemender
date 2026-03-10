// lib/authTokens.ts

/**
 * Auth token helpers.
 *
 * Re-exported from security.ts so authentication-related
 * code can import from a clear auth-specific module.
 */

export { generateToken, sha256Hex } from "@/lib/security/crypto";