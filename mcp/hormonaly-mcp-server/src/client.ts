—/**
 * Hormonaly API HTTP client
 * Handles authentication and request routing for all API endpoints.
 */

export interface HoromnalyConfig {
  apiUrl: string;
  helixApiKey?: string;
  sessionToken?: string;
  adminSessionToken?: string;
}

export class HoromnalyClient {
  private config: HoromnalyConfig;

  get apiUrl(): string {
    return this.config.apiUrl;
  }

  constructor(config: HoromnalyConfig) {
    this.config = config;
  }

  async fetch(path: string, options: RequestInit = {}, authMode: "helix" | "session" | "admin" | "public" = "public"): Promise<Response> {
    const url = `${this.config.apiUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };
    if (authMode === "helix" && this.config.helixApiKey) {
      headers["Authorization"] = `Bearer ${this.config.helixApiKey}`;
    } else if (authMode === "session" && this.config.sessionToken) {
      headers["Cookie"] = `connect.sid=${this.config.sessionToken}`;
    } else if (authMode === "admin" && this.config.adminSessionToken) {
      headers["Cookie"] = `connect.sid=${this.config.adminSessionToken}`;
    }
    const res = await fetch(url, { ...options, headers });
    return res;
  }

  async get<T = unknown>(path: string, authMode: "helix" | "session" | "admin" | "public" = "public"): Promise<T> {
    const res = await this.fetch(path, {}, authMode);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GET ${path} → HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
    return res.json() as Promise<T>;
  }

  async post<T = unknown>(path: string, body: unknown, authMode: "helix" | "session" | "admin" | "public" = "public"): Promise<T> {
    const res = await this.fetch(path, { method: "POST", body: JSON.stringify(body) }, authMode);
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`POST ${path} → HTTP ${res.status}: ${errBody.slice(0, 300)}`);
    }
    return res.json() as Promise<T>;
  }
}

/** Load config from environment variables */
export function loadConfig(overrides: Partial<HoromnalyConfig> = {}): HoromnalyConfig {
  return {
    apiUrl: overrides.apiUrl ?? process.env["HORMONALY_API_URL"] ?? "https://hormonaly.ai",
    helixApiKey: overrides.helixApiKey ?? process.env["HORMONALY_API_KEY"],
    sessionToken: overrides.sessionToken ?? process.env["HORMONALY_SESSION_TOKEN"],
    adminSessionToken: overrides.adminSessionToken ?? process.env["HORMONALY_ADMIN_SESSION_TOKEN"],
    ...overrides,
  };
}
