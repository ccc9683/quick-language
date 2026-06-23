import { apiJson, apiPath } from "../../shared/api";

export const SPEECH_TRANSCRIBE_ENDPOINT = apiPath("/speech/transcribe");

export async function transcribeSpeech(audio: Blob): Promise<string> {
  const data = await apiJson<{ text?: string }>("/speech/transcribe", {
    method: "POST",
    headers: {
      "Content-Type": audio.type || "audio/webm"
    },
    body: audio,
    fallbackError: "语音上传识别失败，请稍后重试。"
  });
  return data.text?.trim() ?? "";
}
