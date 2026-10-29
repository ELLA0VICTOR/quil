import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
const apiPort = Number(process.env.QUIL_API_PORT || 8787);
for (const port of [5173, apiPort]) {
  const probe = createServer();
  try {
    await new Promise((resolve, reject) => {
      probe.once("error", reject);
      probe.listen(port, port === apiPort ? "127.0.0.1" : "localhost", resolve);
    });
    await new Promise((resolve) => probe.close(resolve));
  } catch {
    console.error(
      `Port ${port} is already in use. Keep your existing Quil servers, or stop them before running dev:all.`,
    );
    process.exit(1);
  }
}
const children = [
  spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    stdio: "inherit",
    windowsHide: true,
  }),
  spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "localhost", "--strictPort"],
    {
      stdio: "inherit",
      windowsHide: true,
      env: { ...process.env, QUIL_API_URL: `http://127.0.0.1:${apiPort}` },
    },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) if (child.exitCode === null) child.kill();
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
for (const child of children) {
  child.once("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.once("exit", (code) => stop(code || 0));
}
