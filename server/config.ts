import { resolve } from "node:path";

export type Config = ReturnType<typeof readConfig>;
const number = (
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  min: number,
  max: number,
) => {
  const value = env[key] === undefined ? fallback : Number(env[key]);
  if (!Number.isFinite(value) || value < min || value > max)
    throw Error(`Invalid ${key}`);
  return value;
};
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const publicOrigin = env.QUIL_PUBLIC_ORIGIN?.trim() || "";
  if (publicOrigin) { const url = new URL(publicOrigin); if (url.protocol !== "https:" || url.origin !== publicOrigin) throw Error("QUIL_PUBLIC_ORIGIN must be a complete HTTPS origin without a path"); }
  const signInRedirectUri = env.GOOGLE_SIGNIN_REDIRECT_URI ?? `${publicOrigin || "http://localhost:5173"}/api/auth/google/callback`;
  if (publicOrigin) {
    if (!env.GOOGLE_SIGNIN_CLIENT_ID || !env.GOOGLE_SIGNIN_CLIENT_SECRET) throw Error("Public access requires the separate Google sign-in client");
    if (env.GOOGLE_SIGNIN_CLIENT_ID === env.GOOGLE_CLIENT_ID) throw Error("Sign-in and agent OAuth clients must be separate");
    if (new URL(signInRedirectUri).origin !== publicOrigin || new URL(signInRedirectUri).pathname !== "/api/auth/google/callback") throw Error("The sign-in callback must use QUIL_PUBLIC_ORIGIN/api/auth/google/callback");
    if (env.GOOGLE_CLIENT_ID && (!env.GOOGLE_REDIRECT_URI || new URL(env.GOOGLE_REDIRECT_URI).origin !== publicOrigin || new URL(env.GOOGLE_REDIRECT_URI).pathname !== "/api/google/callback")) throw Error("The agent callback must use QUIL_PUBLIC_ORIGIN/api/google/callback");
  }
  const mode = env.QUIL_MODE ?? "fixture";
  if (mode !== "fixture" && mode !== "live")
    throw Error("QUIL_MODE must be fixture or live");
  if (env.OPENAI_MODEL && env.OPENAI_MODEL !== "gpt-6-luna")
    throw Error("Only gpt-6-luna has a configured price ceiling");
  return {
    mode,
    port: number(env, "QUIL_API_PORT", 8787, 1024, 65535),
    dataDir: resolve(env.QUIL_DATA_DIR ?? ".quil-data"),
    enableLive: env.QUIL_ENABLE_LIVE === "true",
    openaiKey: env.OPENAI_API_KEY ?? "",
    searchKey: env.SERPER_API_KEY ?? "",
    googleClientId: env.GOOGLE_CLIENT_ID ?? "",
    googleClientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
    googleRedirectUri:
      env.GOOGLE_REDIRECT_URI ?? "http://127.0.0.1:8787/api/google/callback",
    signInClientId: env.GOOGLE_SIGNIN_CLIENT_ID ?? "",
    signInClientSecret: env.GOOGLE_SIGNIN_CLIENT_SECRET ?? "",
    signInRedirectUri,
    publicOrigin,
    maxActiveRuns: number(env, "QUIL_MAX_ACTIVE_RUNS", 2, 1, 4),
    userDailyBudget: Math.floor(number(env, "QUIL_USER_DAILY_BUDGET_USD", 0.02, 0, 0.5) * 1e9),
    userDailySearch: number(env, "QUIL_USER_DAILY_SEARCH_REQUESTS", 20, 1, 50),
    model: "gpt-6-luna",
    // Nano-dollars avoid floating-point rounding in concurrent reservations.
    totalBudget: Math.floor(
      number(env, "QUIL_TOTAL_BUDGET_USD", 0.5, 0, 5) * 1e9,
    ),
    runBudget: Math.floor(
      number(env, "QUIL_RUN_BUDGET_USD", 0.02, 0, 0.25) * 1e9,
    ),
    maxCalls: number(env, "QUIL_MAX_MODEL_CALLS", 7, 1, 10),
    searchTotal: number(env, "QUIL_MAX_SEARCH_REQUESTS", 50, 0, 250),
    searchPerRun: number(env, "QUIL_MAX_SEARCH_PER_RUN", 4, 1, 8),
    allowedOrigins: new Set(publicOrigin ? [publicOrigin] : [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:4173",
      "http://127.0.0.1:4173",
    ]),
  } as const;
}
export function assertLiveConfigured(config: Config) {
  if (!config.enableLive || !config.openaiKey || !config.searchKey)
    throw Error(
      "Live mode needs QUIL_ENABLE_LIVE=true, OPENAI_API_KEY and SERPER_API_KEY in the server environment",
    );
}
