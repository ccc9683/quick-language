import { apiJson, apiPath, jsonHeaders } from "../../shared/api";
import type { LearningItem, LearningItemCreate, LearningItemType } from "./types";

export const LEARNING_ITEMS_ENDPOINT = apiPath("/learning-items");

export async function createLearningItem(payload: LearningItemCreate): Promise<LearningItem> {
  return apiJson<LearningItem>("/learning-items", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
    fallbackError: "收藏失败，请稍后重试。"
  });
}

export async function fetchLearningItems(
  type: LearningItemType,
  limit = 50
): Promise<LearningItem[]> {
  const searchParams = new URLSearchParams({
    type,
    limit: String(limit)
  });
  return apiJson<LearningItem[]>(`/learning-items?${searchParams.toString()}`, {
    fallbackError: "读取收藏失败，请稍后重试。"
  });
}

export async function deleteLearningItem(id: number): Promise<void> {
  await apiJson<void>(`/learning-items/${id}`, {
    method: "DELETE",
    fallbackError: "删除失败，请稍后重试。"
  });
}
