import { apiJson, apiPath, jsonHeaders } from "../../shared/api";
import type {
  PartnerChatResponse,
  PartnerClearMemoryResponse,
  PartnerHistoryResponse
} from "./types";

export const PARTNER_ENDPOINT = apiPath("/partner");

export async function getPartnerHistory(limit = 30): Promise<PartnerHistoryResponse> {
  const searchParams = new URLSearchParams({ limit: String(limit) });
  return apiJson<PartnerHistoryResponse>(`/partner/history?${searchParams.toString()}`, {
    fallbackError: "读取聊天记录失败，请稍后重试。"
  });
}

export async function sendPartnerMessage(message: string): Promise<PartnerChatResponse> {
  return apiJson<PartnerChatResponse>("/partner/chat", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ message }),
    fallbackError: "发送失败，请稍后重试。"
  });
}

export async function clearPartnerHistory(): Promise<void> {
  await apiJson<void>("/partner/clear-history", {
    method: "POST",
    fallbackError: "清空聊天失败，请稍后重试。"
  });
}

export async function clearPartnerMemory(): Promise<PartnerClearMemoryResponse> {
  return apiJson<PartnerClearMemoryResponse>("/partner/clear-memory", {
    method: "POST",
    fallbackError: "清空记忆失败，请稍后重试。"
  });
}
