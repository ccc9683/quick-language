import { apiJson, apiPath, jsonHeaders } from "../../shared/api";
import type { TranslateResult } from "./types";

export const TRANSLATE_ENDPOINT = apiPath("/translate");

export async function translateText(text: string, signal?: AbortSignal): Promise<TranslateResult> {
  return apiJson<TranslateResult>("/translate", {
    method: "POST",
    signal,
    headers: jsonHeaders(),
    body: JSON.stringify({ text }),
    fallbackError: "翻译失败，请稍后重试。"
  });
}
