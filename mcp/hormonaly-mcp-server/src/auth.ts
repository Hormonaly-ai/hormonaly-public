/**
 * Transport-layer authentication for the remote (HTTP) MCP transports.
 *
 * Before this module existed the HTTP transports accepted any caller and every
 * tool fell back to the container's HORMONALY_API_KEY, so the public
 * mcp.hormonaly.ai endpoint spent Hormonaly's own partner key on behalf of
 * anyone who connected, with no rate limit.
 *
 * The remote contract is now:
 *   - Every request to /mcp, /sse and /messages must carry a partner API key,
 *     either `x-api-key: hk_…` (what server.json advertises) or
 *     `Authorization: Bearer hk_…`. Anything else is 401.
 *   - The key is used ONLY for that request/session. There is no env fallback.
 *   - Only tools that authenticate with a partner key or are public are served
 *     remotely. This public package ships no session-cookie or admin tools;
 *     the exclusion below is kept as a guard.
 *   - A per-key token bucket bounds request rate per instance.

 */
import { pbkdf2Sync } from "node:crypto";

/** Partner key shape as minted by api-key-service (prefix + 32 random bytes hex). */
export const PARTNER_KEY_RE = /^hk_(live|test)_[A-Za-z0-9]{16,}$/;

type HeaderValue = string | string[] | undefined;
export type HeaderBag = Record<string, HeaderValue>;

function first(v: HeaderValue): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

/**
 * Extract a partner API key from request headers.
 * Returns the key, or `null` when a credential is present but malformed, or
 * `undefined` when no credential was supplied at all.
 */
export function extractPartnerKey(headers: HeaderBag): string | null | undefined {
  const raw = first(headers["x-api-key"]);
  if (raw !== undefined) {
    const key = raw.trim();
    return PARTNER_KEY_RE.test(key) ? key : null;
  }
  const auth = first(headers["authorization"]);
  if (auth !== undefined) {
    const m = /^Bearer\s+(\S+)\s*$/i.exec(auth.trim());
    if (!m) return null;
    return PARTNER_KEY_RE.test(m[1]) ? m[1] : null;
  }
  return undefined;
}

/** Tool-name prefixes that must never be reachable over a remote transport. */
const REMOTE_EXCLUDED_PREFIXES = ["admin_", "user_"] as const;
/** Individual session-cookie tools that are not prefix-named. */
const REMOTE_EXCLUDED_TOOLS = new Set(["monitor_protocol_updates"]);

export function isRemoteTool(name: string): boolean {
  if (REMOTE_EXCLUDED_TOOLS.has(name)) return false;
  return !REMOTE_EXCLUDED_PREFIXES.some((p) => name.startsWith(p));
}

/**
 * Short, non-reversible identifier for logs and rate-limit buckets. Never log
 * the key. Derived with a salted PBKDF2 rather than a bare hash: the input is
 * a credential, so a fingerprint that could be brute-forced from a log line
 * back to a key would defeat the point of not logging it. One iteration and
 * six bytes keep it cheap enough for every request.
 */
export function keyFingerprint(key: string): string {
  return pbkdf2Sync(key, FINGERPRINT_SALT, 1, 6, "sha256").toString("hex");
}
const FINGERPRINT_SALT = "hormonaly-mcp-key-fingerprint-v1";

/**
 * Minimal per-instance token bucket. Sufficient to stop a single key from
 * hammering one MCP instance; the platform's own per-partner limiter remains
 * the authoritative quota on every proxied API call.
 */
export class TokenBucket {
  private readonly buckets = new Map<string, { tokens: number; updatedAt: number }>();
  constructor(
    private readonly capacity: number,
    private readonly refillPerMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Returns true when the request is allowed. */
  take(id: string): boolean {
    const t = this.now();
    const b = this.buckets.get(id) ?? { tokens: this.capacity, updatedAt: t };
    b.tokens = Math.min(this.capacity, b.tokens + (t - b.updatedAt) * this.refillPerMs);
    b.updatedAt = t;
    if (b.tokens < 1) {
      this.buckets.set(id, b);
      return false;
    }
    b.tokens -= 1;
    this.buckets.set(id, b);
    if (this.buckets.size > 10_000) this.evict(t);
    return true;
  }

  private evict(t: number): void {
    for (const [id, b] of this.buckets) {
      if (t - b.updatedAt > 10 * 60_000) this.buckets.delete(id);
    }
  }
}

/** `MCP_RATE_LIMIT_PER_MINUTE` (default 120) → bucket sized for that rate. */
export function limiterFromEnv(env: NodeJS.ProcessEnv = process.env): TokenBucket {
  const perMinute = Math.max(1, parseInt(env["MCP_RATE_LIMIT_PER_MINUTE"] ?? "120", 10) || 120);
  return new TokenBucket(perMinute, perMinute / 60_000);
}
