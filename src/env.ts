// Worker bindings. Every optional binding may be missing in local dev, so the
// routes that need one fail closed instead of assuming it is there.
export interface Env {
  PAGES: R2Bucket;
  PAGEPILOT_API_KEY?: string;
  PUBLIC_URL?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  OWNER_EMAIL?: string;
  ASSETS?: Fetcher;
}
