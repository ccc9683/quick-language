import { apiJson, apiPath, jsonHeaders } from "../../shared/api";
import type { SayItRequest, SayItResponse } from "./types";

export const SAY_IT_ENDPOINT = apiPath("/say-it");

export async function submitSayIt(payload: SayItRequest): Promise<SayItResponse> {
  return apiJson<SayItResponse>("/say-it", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
    fallbackError: "Say it 请求失败，请稍后重试。"
  });
}
