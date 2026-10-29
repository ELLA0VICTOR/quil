import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { isIP } from "node:net";
import type { Candidate, WebsiteCheck } from "../shared/mission.ts";

export function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || b === 2)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0)
    );
  }
  // Only global-unicast IPv6; exclude mapped IPv4, local and documentation space.
  return (
    isIP(address) === 6 &&
    /^[23]/.test(address) &&
    !/^(?:2002:|2001:(?:db8|0:|0000:|10:|20:))/i.test(address)
  );
}
export type Page = {
  status: number;
  html: string;
  url: string;
  truncated?: boolean;
};
export async function loadPublicPage(
  value: string,
  signal: AbortSignal,
): Promise<Page> {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
  let url = new URL(value);
  for (let redirects = 0; redirects <= 2; redirects++) {
    if (
      !/^https?:$/.test(url.protocol) ||
      url.username ||
      url.password ||
      (url.port && !["80", "443"].includes(url.port))
    )
      throw Error("Unsupported website address");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = await Promise.race([
      lookup(host, { all: true }),
      new Promise<never>((_, reject) => {
        const abort = () => reject(Error("Website lookup timed out"));
        if (deadline.aborted) abort();
        else deadline.addEventListener("abort", abort, { once: true });
      }),
    ]);
    if (
      !addresses.length ||
      addresses.some((row) => !publicAddress(row.address))
    )
      throw Error("Website address is not public");
    const pinned =
      addresses.find((address) => address.family === 4) ?? addresses[0];
    const page = await new Promise<Page & { location?: string }>(
      (resolve, reject) => {
        const request = (
          url.protocol === "https:" ? httpsRequest : httpRequest
        )(
          url,
          {
            signal: deadline,
            agent: false,
            headers: {
              "User-Agent": "Quil/1.0 (single-page website review)",
              Accept: "text/html",
              "Accept-Encoding": "identity",
            },
            lookup: (_hostname, options, callback) => {
              // Pin the checked address; do not perform another DNS lookup on connect.
              if (options.all) callback(null, [pinned]);
              else callback(null, pinned.address, pinned.family);
            },
          },
          (response) => {
            const status = response.statusCode ?? 0;
            if ([301, 302, 303, 307, 308].includes(status)) {
              response.destroy();
              resolve({
                status,
                html: "",
                url: url.href,
                location: response.headers.location,
              });
              return;
            }
            if (
              !/text\/html|application\/xhtml\+xml/i.test(
                response.headers["content-type"] ?? "",
              )
            ) {
              response.destroy();
              reject(Error("Website did not return an HTML page"));
              return;
            }
            let size = 0;
            const chunks: Buffer[] = [];
            response.on("data", (chunk: Buffer) => {
              if (size + chunk.length > 200_000) {
                chunks.push(chunk.subarray(0, Math.max(0, 200_000 - size)));
                resolve({
                  status,
                  html: Buffer.concat(chunks).toString("utf8"),
                  url: url.href,
                  truncated: true,
                });
                response.destroy();
              } else {
                size += chunk.length;
                chunks.push(chunk);
              }
            });
            response.on("error", reject);
            response.on("end", () =>
              resolve({
                status,
                html: Buffer.concat(chunks).toString("utf8"),
                url: url.href,
              }),
            );
          },
        );
        request.on("error", reject);
        request.end();
      },
    );
    if (!page.location) return page;
    url = new URL(page.location, url);
  }
  throw Error("Website redirected too many times");
}

export async function investigateWebsite(
  candidate: Candidate,
  signal: AbortSignal,
  loader = loadPublicPage,
): Promise<WebsiteCheck> {
  const base = {
    candidateId: candidate.id,
    url: candidate.website,
    checkedAt: new Date().toISOString(),
    bookingLinks: [] as string[],
  };
  if (!candidate.website)
    return {
      ...base,
      status: "not_listed",
      reason:
        "No standalone website was listed. This does not establish that none exists.",
    };
  try {
    const page = await loader(candidate.website, signal);
    const contactEmails = [
      ...new Set(
        [
          ...page.html.matchAll(/href\s*=\s*["']mailto:([^"'?<>\s]+)/gi),
        ].flatMap((match) => {
          try {
            const address = decodeURIComponent(match[1]);
            return /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(
              address,
            )
              ? [address.toLowerCase()]
              : [];
          } catch {
            return [];
          }
        }),
      ),
    ].slice(0, 5);
    const bookingLinks = [
      ...page.html.matchAll(
        /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
      ),
    ]
      .flatMap((match) => {
        const label = match[2].replace(/<[^>]*>/g, " ");
        if (
          !/book(?:ing)?\s+(?:now|online|appointment)|schedule\s+(?:now|an? appointment)|fresha|booksy|loviebooking|setmore|acuityscheduling|simplybook|gettimely/i.test(
            label + " " + match[1],
          )
        )
          return [];
        try {
          const link = new URL(match[1], page.url);
          return /^https?:$/.test(link.protocol) &&
            !link.username &&
            !link.password
            ? [link.href]
            : [];
        } catch {
          return [];
        }
      })
      .slice(0, 5);
    return {
      ...base,
      url: page.url,
      httpStatus: page.status,
      bookingLinks,
      contactEmails,
      status:
        page.status >= 200 && page.status < 300 ? "reachable" : "inconclusive",
      reason:
        page.status >= 200 && page.status < 300
          ? `The listed website returned an HTML page.${page.truncated ? " Only the first part was read to keep the check small." : ""} This is not a full functional, ownership or booking test.`
          : "The website returned an error response; blocking or a temporary problem is possible.",
    };
  } catch {
    signal.throwIfAborted();
    return {
      ...base,
      status: "inconclusive",
      reason:
        "The bounded website check could not confirm a page. Do not claim that the website is absent or broken.",
    };
  }
}
