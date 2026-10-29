import { spawn } from "node:child_process";
import { readConfig } from "../server/config.ts";
import { createApi } from "../server/http.ts";

// A separate fixture API and preview leave the owner's live environment and
// ledger untouched. This command cannot make provider requests.
const api = createApi({
  ...readConfig({
    QUIL_DATA_DIR: `.quil-data/browser-qa-${process.pid}`,
    QUIL_API_PORT: "8788",
  }),
  allowedOrigins: new Set(["http://127.0.0.1:4174"]),
});
await new Promise((resolve, reject) => {
  api.server.once("error", reject);
  api.server.listen(8788, "127.0.0.1", resolve);
});
let preview, check;
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  check?.kill();
  preview?.kill();
  await api.close();
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    process.exitCode = 1;
    void close();
  });
try {
  preview = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      "4174",
      "--strictPort",
    ],
    {
      stdio: "inherit",
      windowsHide: true,
      env: { ...process.env, QUIL_API_URL: "http://127.0.0.1:8788" },
    },
  );
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (preview.exitCode !== null)
      throw Error("Fixture preview could not start");
    try {
      const health = await (
        await fetch("http://127.0.0.1:4174/api/health")
      ).json();
      if (health.mode === "fixture") {
        ready = true;
        break;
      }
    } catch {
      /* Wait briefly for this local process. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw Error("Fixture preview did not become ready");
  check = spawn(process.execPath, ["scripts/browser-qa.mjs"], {
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, QUIL_QA_URL: "http://127.0.0.1:4174" },
  });
  const code = await new Promise((resolve, reject) => {
    check.once("error", reject);
    check.once("exit", resolve);
  });
  process.exitCode = typeof code === "number" ? code : 1;
} finally {
  await close();
}
