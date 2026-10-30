import type { IncomingMessage, ServerResponse } from "node:http";
import { waitUntil } from "@vercel/functions";
import { createApi } from "../server/http.ts";
import { readConfig } from "../server/config.ts";

let app: ReturnType<typeof createApi> | undefined;
export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
) {
  try {
    app ??= createApi(readConfig(), { onBackground: (work) => waitUntil(work) }).catch(
      (error) => {
        app = undefined;
        throw error;
      },
    );
    await (await app).handle(request, response);
  } catch {
    if (response.headersSent) response.destroy();
    else {
      response.writeHead(503, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      response.end(
        JSON.stringify({
          error:
            "Quil could not open its database. Check the server configuration and try again.",
        }),
      );
    }
  }
}
