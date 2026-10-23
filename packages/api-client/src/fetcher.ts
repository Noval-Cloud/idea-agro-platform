let baseUrl = "";
let accessToken: () => Promise<string | null> = async () => null;

/** Sets the API's origin, such as `https://api.example.org`, before the first call. */
export function setApiBaseUrl(url: string): void {
  baseUrl = url.replace(/\/$/, "");
}

/** Sets where calls get the signed-in person's token from; calls go without one while it answers null. */
export function setAccessToken(provider: () => Promise<string | null>): void {
  accessToken = provider;
}

/** The fetch every generated call goes through: it answers with the status, the headers and the parsed body. */
export async function apiFetch<T>(url: string, options: RequestInit): Promise<T> {
  const headers = new Headers(options.headers);
  const token = await accessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${baseUrl}${url}`, { ...options, headers });
  const text = [204, 205, 304].includes(response.status) ? "" : await response.text();
  const data: unknown = text ? JSON.parse(text) : {};
  return { data, status: response.status, headers: response.headers } as T;
}
