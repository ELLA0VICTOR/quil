import { existsSync } from "node:fs";
import { readConfig } from "./config.ts";
import { createApi } from "./http.ts";

if (existsSync(".env")) process.loadEnvFile(".env");
const config = readConfig();
const api = await createApi(config);
api.server.on("error", (error) => {
  console.error(`Quil API could not start: ${error.message}`);
  process.exitCode = 1;
  void api.close();
});
api.server.listen(config.port, config.bindHost, () => {
  console.log(
    `Quil: ${config.publicOrigin || `http://127.0.0.1:${config.port}`} (${config.mode})`,
  );
  console.log(
    config.mode === "fixture"
      ? "Mozaik fixture mode. No paid model or search requests."
      : "Live mode configured. Persistent model/search limits apply.",
  );
});
let closing = false;
const close = () => {
  if (closing) return;
  closing = true;
  void api.close();
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
