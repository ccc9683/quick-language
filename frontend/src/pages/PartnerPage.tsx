import { useEffect, useRef, useState } from "react";

import {
  clearPartnerHistory,
  clearPartnerMemory,
  getPartnerHistory,
  sendPartnerMessage
} from "../features/partner/api";
import type { PartnerMemory, PartnerMessage } from "../features/partner/types";
import { transcribeSpeech } from "../features/speech/api";
import { RecordingDiagnosticsPanel } from "../shared/RecordingDiagnosticsPanel";
import {
  canUseMediaRecorderUpload,
  collectRecordingDiagnostics,
  getErrorMessage,
  getErrorName,
  logRecordingDiagnostics,
  readMicrophonePermissionState,
  sanitizeDiagnosticMessage,
  selectSupportedAudioMimeType,
  type RecordingDiagnostics,
  type RecordingDiagnosticsPatch
} from "../shared/recordingDiagnostics";
import {
  speakEnglish,
  stopSpeaking,
} from "../shared/speech";

const DEFAULT_MEMORY: PartnerMemory = {
  name: "",
  level: "beginner",
  favorite_topics: [],
  style: "simple English"
};

type RecordingFlowState =
  | "idle"
  | "requesting_permission"
  | "recording"
  | "stopping"
  | "transcribing"
  | "ready"
  | "error";

function PartnerPage() {
  const [messages, setMessages] = useState<PartnerMessage[]>([]);
  const [memory, setMemory] = useState<PartnerMemory>(DEFAULT_MEMORY);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState("");
  const [recordingState, setRecordingState] = useState<RecordingFlowState>("idle");
  const [recordingDiagnostics, setRecordingDiagnostics] = useState<RecordingDiagnostics>(() =>
    collectRecordingDiagnostics({ recordingState: "idle", stage: "partner_init" })
  );
  const [showRecordingDiagnostics, setShowRecordingDiagnostics] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<number | "latest" | null>(null);
  const recordingDiagnosticsRef = useRef<RecordingDiagnostics | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const selectedMimeTypeRef = useRef("");
  const messageListRef = useRef<HTMLDivElement | null>(null);

  if (recordingDiagnosticsRef.current === null) {
    recordingDiagnosticsRef.current = recordingDiagnostics;
  }

  const isRecording = recordingState === "recording";
  const isTranscribing = recordingState === "transcribing";
  const speechSupported = canUseMediaRecorderUpload(recordingDiagnostics);

  useEffect(() => {
    updateRecordingDiagnostics({ recordingState: "idle", stage: "partner_page_loaded" });
    void refreshMicrophonePermission("partner_permission_query");
    void loadHistory();

    return () => {
      stopUploadStream();
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    messageListRef.current?.scrollTo({
      top: messageListRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages]);

  async function loadHistory() {
    setLoadingHistory(true);
    setError("");

    try {
      const data = await getPartnerHistory();
      setMessages(data.messages);
      setMemory(data.memory);
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取聊天记录失败，请稍后重试。");
    } finally {
      setLoadingHistory(false);
    }
  }

  function updateRecordingDiagnostics(patch: RecordingDiagnosticsPatch): RecordingDiagnostics {
    const diagnostics = collectRecordingDiagnostics({
      ...(recordingDiagnosticsRef.current ?? recordingDiagnostics),
      ...patch
    });
    recordingDiagnosticsRef.current = diagnostics;
    setRecordingDiagnostics(diagnostics);
    logRecordingDiagnostics("partner", diagnostics);
    return diagnostics;
  }

  async function refreshMicrophonePermission(stage: string): Promise<void> {
    const permissionState = await readMicrophonePermissionState();
    updateRecordingDiagnostics({ permissionState, stage });
  }

  async function handleSend() {
    const message = inputText.trim();
    if (!message) {
      setError("请输入想练习的内容。");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await sendPartnerMessage(message);
      setInputText("");
      setMemory(response.updated_memory);
      await loadHistory();
      void speakAssistantReply(response.reply, "latest");
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  async function handleClearHistory() {
    setError("");
    try {
      await clearPartnerHistory();
      setMessages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "清空聊天失败，请稍后重试。");
    }
  }

  async function handleClearMemory() {
    setError("");
    try {
      const response = await clearPartnerMemory();
      setMemory(response.memory);
    } catch (err) {
      setError(err instanceof Error ? err.message : "清空记忆失败，请稍后重试。");
    }
  }

  function startRecording() {
    if (
      recordingState === "requesting_permission" ||
      recordingState === "recording" ||
      recordingState === "stopping" ||
      recordingState === "transcribing"
    ) {
      return;
    }

    const diagnostics = updateRecordingDiagnostics({
      recordingState,
      stage: "start_clicked",
      startError: "",
      stopError: "",
      lastErrorName: "",
      lastErrorMessage: "",
      blobSize: null,
      audioDurationMs: null
    });

    if (!canUseMediaRecorderUpload(diagnostics)) {
      setRecordingState("error");
      setError(getUnsupportedRecordingMessage(diagnostics));
      updateRecordingDiagnostics({
        recordingState: "error",
        stage: getUnsupportedRecordingStage(diagnostics),
        lastErrorName: "RecordingUnsupported",
        lastErrorMessage: getUnsupportedRecordingMessage(diagnostics)
      });
      return;
    }

    void startUploadRecording();
  }

  function stopRecording() {
    if (recordingState !== "recording") {
      return;
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      setRecordingState("error");
      setError("录音停止异常：录音器已经不存在，请重新开始录音。");
      updateRecordingDiagnostics({
        recordingState: "error",
        stage: "stop_missing_recorder",
        stopError: "MediaRecorder reference is empty",
        lastErrorName: "StopError",
        lastErrorMessage: "MediaRecorder reference is empty"
      });
      return;
    }

    setRecordingState("stopping");
    updateRecordingDiagnostics({ recordingState: "stopping", stage: "stopping" });

    try {
      if (recorder.state === "recording") {
        recorder.requestData();
      }
    } catch (err) {
      updateRecordingDiagnostics({
        recordingState: "stopping",
        stage: "request_data_error",
        stopError: getErrorMessage(err),
        lastErrorName: getErrorName(err),
        lastErrorMessage: getErrorMessage(err)
      });
    }

    try {
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
    } catch (err) {
      const message = getErrorMessage(err);
      finishUploadRecording();
      setRecordingState("error");
      setError(`停止录音异常：${message}`);
      updateRecordingDiagnostics({
        recordingState: "error",
        stage: "stop_error",
        stopError: message,
        lastErrorName: getErrorName(err),
        lastErrorMessage: message
      });
    }
  }

  async function startUploadRecording() {
    const diagnostics = updateRecordingDiagnostics({
      recordingState: "requesting_permission",
      stage: "requesting_permission"
    });

    if (!canUseMediaRecorderUpload(diagnostics)) {
      setRecordingState("error");
      setError(getUnsupportedRecordingMessage(diagnostics));
      updateRecordingDiagnostics({
        recordingState: "error",
        stage: getUnsupportedRecordingStage(diagnostics),
        lastErrorName: "RecordingUnsupported",
        lastErrorMessage: getUnsupportedRecordingMessage(diagnostics)
      });
      return;
    }

    setRecordingState("requesting_permission");
    const permissionState = await readMicrophonePermissionState();
    updateRecordingDiagnostics({ permissionState, stage: "permission_result" });

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      updateRecordingDiagnostics({
        permissionState: "granted",
        recordingState: "requesting_permission",
        stage: "permission_granted"
      });
    } catch (err) {
      const message = getGetUserMediaFailureMessage(err);
      setRecordingState("error");
      setError(message);
      updateRecordingDiagnostics({
        permissionState: isPermissionDeniedError(err) ? "denied" : permissionState,
        recordingState: "error",
        stage: isPermissionDeniedError(err) ? "permission_denied" : "get_user_media_error",
        lastErrorName: getErrorName(err),
        lastErrorMessage: getErrorMessage(err)
      });
      return;
    }

    let recorder: MediaRecorder;
    const selectedMimeType = selectSupportedAudioMimeType();
    try {
      recorder = new MediaRecorder(
        stream,
        selectedMimeType ? { mimeType: selectedMimeType } : undefined
      );
    } catch (err) {
      stream.getTracks().forEach((track) => track.stop());
      const message = getErrorMessage(err);
      setRecordingState("error");
      setError(`MediaRecorder 初始化失败：${message}`);
      updateRecordingDiagnostics({
        selectedMimeType,
        recordingState: "error",
        stage: "mediarecorder_init_error",
        lastErrorName: getErrorName(err),
        lastErrorMessage: message
      });
      return;
    }

    audioChunksRef.current = [];
    mediaStreamRef.current = stream;
    mediaRecorderRef.current = recorder;
    selectedMimeTypeRef.current = recorder.mimeType || selectedMimeType || "audio/webm";
    recordingStartedAtRef.current = Date.now();

    recorder.ondataavailable = (event) => {
      const blobSize = audioChunksRef.current.reduce((sum, chunk) => sum + chunk.size, 0);
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
      updateRecordingDiagnostics({
        selectedMimeType: event.data.type || selectedMimeTypeRef.current,
        recordingState: recorder.state === "recording" ? "recording" : "stopping",
        stage: "dataavailable",
        blobSize: blobSize + event.data.size
      });
    };
    recorder.onerror = (event) => {
      const recorderError = event as Event & { error?: DOMException };
      const message = recorderError.error
        ? getErrorMessage(recorderError.error)
        : "MediaRecorder runtime error";
      setError(`录音运行异常：${message}`);
      finishUploadRecording();
      setRecordingState("error");
      updateRecordingDiagnostics({
        recordingState: "error",
        stage: "mediarecorder_error",
        lastErrorName: recorderError.error ? getErrorName(recorderError.error) : "MediaRecorderError",
        lastErrorMessage: message
      });
    };
    recorder.onstop = () => {
      const durationMs =
        recordingStartedAtRef.current === null ? null : Date.now() - recordingStartedAtRef.current;
      updateRecordingDiagnostics({
        selectedMimeType: recorder.mimeType || selectedMimeTypeRef.current,
        recordingState: "stopping",
        stage: "stopped",
        audioDurationMs: durationMs
      });
      void handleUploadRecordingComplete(recorder.mimeType || selectedMimeTypeRef.current, durationMs);
    };

    try {
      setError("");
      recorder.start();
      setRecordingState("recording");
      updateRecordingDiagnostics({
        selectedMimeType: recorder.mimeType || selectedMimeTypeRef.current,
        recordingState: "recording",
        stage: "recording",
        startError: "",
        lastErrorName: "",
        lastErrorMessage: ""
      });
    } catch (err) {
      const message = getErrorMessage(err);
      finishUploadRecording();
      setRecordingState("error");
      setError(`录音启动异常：${message}`);
      updateRecordingDiagnostics({
        selectedMimeType,
        recordingState: "error",
        stage: "start_error",
        startError: message,
        lastErrorName: getErrorName(err),
        lastErrorMessage: message
      });
    }
  }

  async function handleUploadRecordingComplete(mimeType: string, durationMs: number | null) {
    const chunks = [...audioChunksRef.current];
    const audio = new Blob(chunks, { type: mimeType || "audio/webm" });
    const blobSize = audio.size;
    finishUploadRecording();

    updateRecordingDiagnostics({
      selectedMimeType: audio.type || mimeType || "audio/webm",
      recordingState: "stopping",
      stage: "blob_ready",
      blobSize,
      audioDurationMs: durationMs
    });

    if (blobSize <= 0) {
      setRecordingState("error");
      setError("录音数据为空，请确认麦克风没有被系统或浏览器静音后重试。");
      updateRecordingDiagnostics({
        recordingState: "error",
        stage: "blob_empty",
        blobSize,
        audioDurationMs: durationMs,
        lastErrorName: "EmptyBlob",
        lastErrorMessage: "Audio blob size is 0"
      });
      return;
    }

    setRecordingState("transcribing");
    setError("");
    updateRecordingDiagnostics({
      recordingState: "transcribing",
      stage: "transcribing",
      blobSize,
      audioDurationMs: durationMs
    });

    try {
      const transcript = await transcribeSpeech(audio);
      if (!transcript) {
        setRecordingState("error");
        setError("转写服务返回空文本，请靠近麦克风或换更安静的环境重试。");
        updateRecordingDiagnostics({
          recordingState: "error",
          stage: "transcribe_empty",
          lastErrorName: "EmptyTranscript",
          lastErrorMessage: "Speech transcription returned empty text"
        });
        return;
      }
      setInputText(transcript);
      setRecordingState("ready");
      updateRecordingDiagnostics({ recordingState: "ready", stage: "transcribe_ready" });
    } catch (err) {
      const message = getTranscriptionFailureMessage(err);
      setRecordingState("error");
      setError(message);
      updateRecordingDiagnostics({
        recordingState: "error",
        stage: isBackendTranscriptionConfigError(err)
          ? "backend_provider_key_config_error"
          : "upload_transcribe_error",
        lastErrorName: getErrorName(err),
        lastErrorMessage: getErrorMessage(err)
      });
    }
  }

  function finishUploadRecording() {
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    selectedMimeTypeRef.current = "";
    recordingStartedAtRef.current = null;
    stopUploadStream();
  }

  function stopUploadStream() {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }

  async function speakAssistantReply(text: string, id: number | "latest") {
    setSpeakingMessageId(id);
    const result = await speakEnglish(text, {
      onEnd: () => setSpeakingMessageId(null),
      onError: () => setSpeakingMessageId(null)
    });

    if (!result.ok) {
      setSpeakingMessageId(null);
    }
  }

  return (
    <main className="page">
      <section className="translator partner-page">
        <h1>Partner</h1>
        <p className="subtitle">和耐心的英语练习朋友进行简单日常对话。</p>

        {error && <div className="error">{error}</div>}

        <div className="partner-memory" aria-label="Partner memory">
          <span>Level: {memory.level}</span>
          {memory.name && <span>Name: {memory.name}</span>}
          {memory.favorite_topics.length > 0 && (
            <span>Topics: {memory.favorite_topics.join(", ")}</span>
          )}
        </div>

        <div className="partner-chat" ref={messageListRef}>
          {loadingHistory ? (
            <div className="empty">加载聊天记录中...</div>
          ) : messages.length > 0 ? (
            messages.map((message) => (
              <div className={`chat-row ${message.role}`} key={message.id}>
                <div className="chat-bubble">
                  <p>{message.content}</p>
                  {message.role === "assistant" && (
                    <button
                      className="chat-speak-button"
                      onClick={() => void speakAssistantReply(message.content, message.id)}
                      type="button"
                    >
                      {speakingMessageId === message.id ? "朗读中" : "朗读"}
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="empty">聊天记录会显示在这里。</div>
          )}
        </div>

        {!speechSupported && (
          <div className="notice">{getUnsupportedRecordingMessage(recordingDiagnostics)}</div>
        )}

        <button
          className="secondary diagnostics-toggle"
          onClick={() => setShowRecordingDiagnostics((visible) => !visible)}
          type="button"
        >
          {showRecordingDiagnostics ? "隐藏录音诊断" : "显示录音诊断"}
        </button>

        {showRecordingDiagnostics && <RecordingDiagnosticsPanel diagnostics={recordingDiagnostics} />}

        <div className="partner-composer">
          <div className="partner-input-area">
            <textarea
              className="translator-input"
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  void handleSend();
                }
              }}
              placeholder="Type or speak something..."
              rows={4}
            />
          </div>

          <div className="actions partner-actions">
            <button disabled={loading} onClick={handleSend} type="button">
              {loading ? "Sending..." : "Send"}
            </button>
            <button
              className="secondary"
              disabled={
                loading ||
                recordingState === "requesting_permission" ||
                recordingState === "stopping" ||
                isTranscribing
              }
              onClick={isRecording ? stopRecording : startRecording}
              type="button"
            >
              {getSpeechButtonText(recordingState)}
            </button>
            <button className="secondary" onClick={handleClearHistory} type="button">
              Clear Chat
            </button>
            <button className="secondary" onClick={handleClearMemory} type="button">
              Clear Memory
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

export default PartnerPage;

function getSpeechButtonText(recordingState: RecordingFlowState): string {
  if (recordingState === "requesting_permission") {
    return "请求权限...";
  }

  if (recordingState === "stopping") {
    return "停止中...";
  }

  if (recordingState === "transcribing") {
    return "识别中...";
  }

  if (recordingState === "recording") {
    return "停止录音";
  }

  return "说话";
}

function getUnsupportedRecordingMessage(diagnostics: RecordingDiagnostics): string {
  if (!diagnostics.isSecureContext) {
    return "当前页面不是 HTTPS/安全上下文，手机浏览器通常会阻止麦克风。请通过 HTTPS 或 localhost 访问。";
  }

  if (!diagnostics.hasNavigatorMediaDevices || !diagnostics.hasGetUserMedia) {
    return "当前浏览器没有 getUserMedia，无法请求麦克风权限。请升级浏览器或换 Chrome/Edge 重试。";
  }

  if (!diagnostics.hasMediaRecorder) {
    return "当前浏览器不支持 MediaRecorder，无法生成可上传的录音文件。请换 Chrome/Edge 或支持录音的浏览器。";
  }

  return "当前浏览器录音能力不可用，请查看录音诊断后重试。";
}

function getUnsupportedRecordingStage(diagnostics: RecordingDiagnostics): string {
  if (!diagnostics.isSecureContext) {
    return "secure_context_error";
  }

  if (!diagnostics.hasNavigatorMediaDevices || !diagnostics.hasGetUserMedia) {
    return "get_user_media_unsupported";
  }

  if (!diagnostics.hasMediaRecorder) {
    return "mediarecorder_unsupported";
  }

  return "recording_unsupported";
}

function isPermissionDeniedError(err: unknown): boolean {
  const name = getErrorName(err);
  return name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError";
}

function getGetUserMediaFailureMessage(err: unknown): string {
  const name = getErrorName(err);
  if (isPermissionDeniedError(err)) {
    return "麦克风权限被拒绝，请在浏览器地址栏或系统设置中允许麦克风后重试。";
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "没有找到可用麦克风，请检查设备麦克风或系统权限。";
  }

  if (name === "NotReadableError" || name === "TrackStartError") {
    return "麦克风正被系统或其他应用占用，请关闭占用后重试。";
  }

  return `麦克风权限请求失败：${getErrorMessage(err)}`;
}

function getTranscriptionFailureMessage(err: unknown): string {
  const detail = getErrorMessage(err);
  if (isBackendTranscriptionConfigError(err)) {
    return `后端转写 provider/key/config 配置错误或本地转写模型不可用：${detail}`;
  }

  return `上传/转写失败：${detail}`;
}

function isBackendTranscriptionConfigError(err: unknown): boolean {
  const detail = sanitizeDiagnosticMessage(getErrorMessage(err)).toLowerCase();
  return (
    detail.includes("api key") ||
    detail.includes("apikey") ||
    detail.includes("token") ||
    detail.includes("provider") ||
    detail.includes("unauthorized") ||
    detail.includes("401") ||
    detail.includes("403") ||
    detail.includes("faster-whisper") ||
    detail.includes("not installed") ||
    detail.includes("model failed to load") ||
    detail.includes("local speech model")
  );
}
