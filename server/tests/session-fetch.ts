const cookies = new Map<string,string>();
export const sessionFetch: typeof fetch = async (input, options = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const headers = new Headers(options.headers);
  if (!headers.has("Cookie") && cookies.has(url.origin)) headers.set("Cookie", cookies.get(url.origin)!);
  const response = await fetch(input, { ...options, headers });
  const cookie = response.headers.get("set-cookie");
  if (cookie) cookies.set(url.origin, cookie.split(";")[0]);
  return response;
};
