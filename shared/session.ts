export type SessionView = {
  user: { id: string; authenticated: boolean; email?: string; name?: string };
  signInConfigured: boolean;
  signInRedirectUri: string;
  development: boolean;
  mode: "fixture" | "live";
  legacyImported?: boolean;
  adoptedGuestId?: string;
};
