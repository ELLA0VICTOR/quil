import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.resolve("@mozaik-ai/core"));
const { pairDevice } = await import(
  pathToFileURL(require.resolve("@mozaik-ai/cloud-sdk")).href
);
// The official SDK opens the browser approval flow and caches its key outside
// this repository. It never prints the installed project key.
await pairDevice();
