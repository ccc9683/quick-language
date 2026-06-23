export const API_PREFIX = "/api";

type ApiJsonOptions = RequestInit & {
  fallbackError?: string;
};

export function apiPath(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_PREFIX}${normalizedPath}`;
}

export async function apiJson<T>(path: string, options: ApiJsonOptions = {}): Promise<T> {
  const { fallbackError = "请求失败，请稍后重试。", ...requestInit } = options;
  const response = await fetch(apiPath(path), requestInit);

  if (!response.ok) {
    throw new Error(await readApiError(response, fallbackError));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function jsonHeaders(headers?: HeadersInit): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...headers
  };
}

async function readApiError(response: Response, fallbackError: string): Promise<string> {
  const data = await response
    .clone()
    .json()
    .catch(() => null);

  if (data && typeof data === "object" && "detail" in data) {
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }
  }

  const text = await response.text().catch(() => "");
  return text.trim() || fallbackError;
}
