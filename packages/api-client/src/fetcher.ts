let baseUrl = "";

/** Sets the API's origin, such as `https://api.example.org`, before the first call. */
export function setApiBaseUrl(url: string): void {
  baseUrl = url.replace(/\/$/, "");
}

/** The API's full address of a path, for what loads by URL rather than through a call, such as images. */
export function apiUrl(path: string): string {
  return `${baseUrl}${path}`;
}

/**
 * The fetch every generated call goes through: it answers with the status, the headers and the parsed body.
 * It never adds credentials: private calls pass their own `Authorization` header in `options`.
 */
export async function apiFetch<T>(url: string, options: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${url}`, options);
  const text = [204, 205, 304].includes(response.status) ? "" : await response.text();
  const data: unknown = text ? JSON.parse(text) : {};
  return { data, status: response.status, headers: response.headers } as T;
}
