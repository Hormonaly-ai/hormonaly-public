/**
 * Hormonaly API HTTP client.
 *
 * Authenticates with a partner API key only (`Authorization: Bearer hk_...`).
 * There is no session-cookie mode: never copy a browser cookie into this server.
 */

export interface HoromnalyConfig {
  apiUrl: string;
  helixApiKey?: string;
}

export type AuthMode = "helix" | "public";

export class HoromnalyClient {
  private config: HoromnalyConfig;

  get apiUrl(): string {
    return this.config.apiUrl;
  }

  constructor(config: HoromnalyConfig) {
    this.config = config;
  }

  /**
   * A client with one setting replaced and everything else carried over.
   * Never re-reads the environment, so a per-request client built from a
   * caller's key cannot pick up a key set on the host.
   */
  with(overrides: Partial<HoromnalyConfig>): HoromnalyClient {
    return new HoromnalyClient({ ...this.config, ...overrides });
  }

  async fetch(path: string, options: RequestInit = {}, authMode: AuthMode = "public"): Promise<Response> {
    const url = `${this.config.apiUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };
    if (authMode === "helix" && this.config.helixApiKey) {
      headers["Authorization"] = `Bearer ${this.config.helixApiKey}`;
    }
    return fetch(url, { ...options, headers });
  }

  async get<T = unknown>(path: string, authMode: AuthMode = "public"): Promise<T> {
    const res = await this.fetch(path, {}, authMode);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GET ${path} → HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
    return res.json() as Promise<T>;
  }

  async post<T = unknown>(path: string, body: unknown, authMode: AuthMode = "public"): Promise<T> {
    const res = await this.fetch(path, { method: "POST", body: JSON.stringify(body) }, authMode);
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`POST ${path} → HTTP ${res.status}: ${errBody.slice(0, 300)}`);
    }
    return res.json() as Promise<T>;
  }
}

/** Load config from environment variables. */
export function loadConfig(overrides: Partial<HoromnalyConfig> = {}): HoromnalyConfig {
  return {
    // api.hormonaly.ai is the partner API host; hormonaly.ai is the website,
    // behind Cloudflare bot protection, and can answer server calls with 403.
    apiUrl: overrides.apiUrl ?? process.env["HORMONALY_API_URL"] ?? "https://api.hormonaly.ai",
    helixApiKey: overrides.helixApiKey ?? process.env["HORMONALY_API_KEY"],
    ...overrides,
  };
}
