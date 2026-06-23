import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";

import { createLearningItem } from "../features/learning-book/api";
import { submitSayIt } from "../features/say-it/api";
import type { SayItResponse } from "../features/say-it/types";
import {
  addInputHistory,
  loadInputHistory,
  removeInputHistory
} from "../shared/inputHistory";
import { RecordingDiagnosticsPanel } from "../shared/RecordingDiagnosticsPanel";
import {
  collectRecordingDiagnostics,
  getErrorMessage,
  getErrorName,
  logRecordingDiagnostics,
  readMicrophonePermissionState,
  type RecordingDiagnostics,
  type RecordingDiagnosticsPatch
} from "../shared/recordingDiagnostics";
import {
  createSpeechRecognition,
  isSpeechRecognitionSupported,
  speakEnglish,
  stopSpeaking as stopBrowserSpeaking,
  type BrowserSpeechRecognition
} from "../shared/speech";

const SAY_IT_INPUT_HISTORY_STORAGE_KEY = "llp_say_it_input_history";

type ClarificationState = {
  originalText: string;
  ambiguousText: string;
  options: string[];
};

function SayItPage() {
  const [inputText, setInputText] = useState("");
  const [result, setResult] = useState<SayItResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [clarificationState, setClarificationState] = useState<ClarificationState | null>(null);
  const [lastSentenceSourceText, setLastSentenceSourceText] = useState("");
  const [sentenceSaved, setSentenceSaved] = useState(false);
  const [savingSentence, setSavingSentence] = useState(false);
  const [favoriteNotice, setFavoriteNotice] = useState("");
  const [inputHistory, setInputHistory] = useState<string[]>(() =>
    loadInputHistory(SAY_IT_INPUT_HISTORY_STORAGE_KEY)
  );
  const [historyMenuOpen, setHistoryMenuOpen] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [recordingDiagnostics, setRecordingDiagnostics] = useState<RecordingDiagnostics>(() =>
    collectRecordingDiagnostics({ recordingState: "idle", stage: "say_it_init" })
  );
  const [showRecordingDiagnostics, setShowRecordingDiagnostics] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const recordingDiagnosticsRef = useRef<RecordingDiagnostics | null>(null);
  const inputAreaRef = useRef<HTMLDivElement | null>(null);

  if (recordingDiagnosticsRef.current === null) {
    recordingDiagnosticsRef.current = recordingDiagnostics;
  }

  const showHistoryButton = inputFocused || historyMenuOpen;

  useEffect(() => {
    setSpeechSupported(isSpeechRecognitionSupported());
    updateRecordingDiagnostics({ recordingState: "idle", stage: "say_it_page_loaded" });
    void refreshMicrophonePermission("say_it_permission_query");

    return () => {
      recognitionRef.current?.abort();
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    function handleDocumentPointerDown(event: PointerEvent) {
      if (!inputAreaRef.current?.contains(event.target as Node)) {
        setHistoryMenuOpen(false);
        setInputFocused(false);
      }
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
    };
  }, []);

  function updateRecordingDiagnostics(patch: RecordingDiagnosticsPatch): RecordingDiagnostics {
    const diagnostics = collectRecordingDiagnostics({
      ...(recordingDiagnosticsRef.current ?? recordingDiagnostics),
      ...patch
    });
    recordingDiagnosticsRef.current = diagnostics;
    setRecordingDiagnostics(diagnostics);
    logRecordingDiagnostics("say-it", diagnostics);
    return diagnostics;
  }

  async function refreshMicrophonePermission(stage: string): Promise<void> {
    const permissionState = await readMicrophonePermissionState();
    updateRecordingDiagnostics({ permissionState, stage });
  }

  async function sendRequest(text: string, clarification?: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      setError("请输入中文或英文。");
      return;
    }

    setLoading(true);
    setError("");
    setSentenceSaved(false);
    setFavoriteNotice("");

    try {
      const pendingText = clarification ? clarificationState?.originalText : "";
      const response = await submitSayIt({
        text: trimmed,
        pending_text: pendingText || undefined,
        clarification
      });

      setResult(response);
      setClarificationState(
        response.type === "clarification"
          ? {
              originalText: response.original_text || trimmed,
              ambiguousText: response.ambiguous_text || "",
              options: response.options
            }
          : null
      );
      setLastSentenceSourceText(response.english_text ? trimmed : "");

      if (!clarification) {
        setInputHistory(addInputHistory(SAY_IT_INPUT_HISTORY_STORAGE_KEY, trimmed));
      }

      if (response.english_text) {
        void speak(response.english_text, false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Say it 请求失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  function handleSend() {
    void sendRequest(inputText);
  }

  function handleClarification(option: string) {
    const correctedText = buildClarifiedText(clarificationState, option);
    setInputText(correctedText);
    void sendRequest(correctedText, option);
  }

  function handleSelectHistory(historyItem: string) {
    setInputText(historyItem);
    setHistoryMenuOpen(false);
    setInputFocused(true);
  }

  function handleRemoveHistory(event: MouseEvent<HTMLButtonElement>, historyItem: string) {
    event.stopPropagation();
    setInputHistory(removeInputHistory(SAY_IT_INPUT_HISTORY_STORAGE_KEY, historyItem));
  }

  async function handleSaveSentence() {
    const englishText = result?.english_text?.trim();
    const sourceText = (lastSentenceSourceText || inputText).trim();
    if (!englishText || !sourceText) {
      return;
    }

    setSavingSentence(true);
    setFavoriteNotice("");

    try {
      await createLearningItem({
        type: "sentence",
        source_text: sourceText,
        target_text: englishText
      });
      setSentenceSaved(true);
      setFavoriteNotice("已收藏到 Learning Book。");
    } catch (err) {
      setFavoriteNotice(err instanceof Error ? err.message : "收藏失败，请稍后重试。");
    } finally {
      setSavingSentence(false);
    }
  }

  function startRecording() {
    if (!speechSupported || isRecording) {
      if (!speechSupported) {
        const message = "当前浏览器不支持 Web Speech Recognition，请使用 Chrome 或 Edge。";
        setError(message);
        updateRecordingDiagnostics({
          recordingState: "error",
          stage: "speech_recognition_unsupported",
          lastErrorName: "SpeechRecognitionUnsupported",
          lastErrorMessage: message
        });
      }
      return;
    }

    updateRecordingDiagnostics({
      recordingState: "starting",
      stage: "say_it_start_clicked",
      startError: "",
      stopError: "",
      lastErrorName: "",
      lastErrorMessage: "",
      blobSize: null,
      audioDurationMs: null
    });

    if (!window.isSecureContext) {
      updateRecordingDiagnostics({
        recordingState: "starting",
        stage: "secure_context_warning",
        lastErrorName: "InsecureContext",
        lastErrorMessage:
          "当前页面不是 HTTPS/安全上下文，浏览器可能会阻止麦克风或语音识别。"
      });
    }

    const recognition = createSpeechRecognition({
      lang: "zh-CN",
      onResult: (transcript) => {
        setInputText(transcript);
        updateRecordingDiagnostics({
          recordingState: "ready",
          stage: "say_it_result",
          lastErrorName: "",
          lastErrorMessage: ""
        });
      },
      onError: (errorCode) => {
        setIsRecording(false);
        const message = getSpeechRecognitionFailureMessage(errorCode);
        setError(message);
        updateRecordingDiagnostics({
          permissionState: isSpeechRecognitionPermissionDenied(errorCode) ? "denied" : undefined,
          recordingState: "error",
          stage: isSpeechRecognitionPermissionDenied(errorCode)
            ? "permission_denied"
            : "speech_recognition_error",
          lastErrorName: errorCode || "SpeechRecognitionError",
          lastErrorMessage: message
        });
      },
      onEnd: () => {
        setIsRecording(false);
        recognitionRef.current = null;
        const currentRecordingState = recordingDiagnosticsRef.current?.recordingState;
        updateRecordingDiagnostics({
          recordingState:
            currentRecordingState === "error" || currentRecordingState === "ready"
              ? currentRecordingState
              : "idle",
          stage: "say_it_end"
        });
      }
    });

    if (!recognition) {
      setSpeechSupported(false);
      updateRecordingDiagnostics({
        recordingState: "error",
        stage: "speech_recognition_unsupported",
        lastErrorName: "SpeechRecognitionUnsupported",
        lastErrorMessage: "SpeechRecognition constructor is unavailable"
      });
      return;
    }

    recognitionRef.current = recognition;
    setError("");
    setIsRecording(true);
    updateRecordingDiagnostics({ recordingState: "recording", stage: "say_it_recording" });

    try {
      recognition.start();
    } catch (err) {
      recognitionRef.current = null;
      setIsRecording(false);
      const message = getErrorMessage(err);
      setError(`语音识别启动失败：${message}`);
      updateRecordingDiagnostics({
        recordingState: "error",
        stage: "start_error",
        startError: message,
        lastErrorName: getErrorName(err),
        lastErrorMessage: message
      });
    }
  }

  function stopRecording() {
    if (!isRecording) {
      return;
    }

    updateRecordingDiagnostics({ recordingState: "stopping", stage: "say_it_stopping" });

    try {
      recognitionRef.current?.stop();
    } catch (err) {
      const message = getErrorMessage(err);
      recognitionRef.current = null;
      setError(`停止语音识别异常：${message}`);
      updateRecordingDiagnostics({
        recordingState: "error",
        stage: "stop_error",
        stopError: message,
        lastErrorName: getErrorName(err),
        lastErrorMessage: message
      });
    }
    setIsRecording(false);
  }

  async function speak(text = result?.english_text ?? "", showFailure = true) {
    const englishText = text.trim();
    if (englishText) {
      setIsSpeaking(true);
    }

    const speechResult = await speakEnglish(englishText, {
      onEnd: () => setIsSpeaking(false),
      onError: (message) => {
        setIsSpeaking(false);
        if (showFailure) {
          setError(message);
        }
      }
    });

    if (!speechResult.ok) {
      setIsSpeaking(false);
      if (showFailure) {
        setError(speechResult.error);
      }
      return;
    }

    if (showFailure) {
      setError("");
    }
  }

  function stopSpeaking() {
    stopBrowserSpeaking();
    setIsSpeaking(false);
  }

  return (
    <main className="page">
      <section className="translator say-it">
        <h1>Say it</h1>
        <p className="subtitle">输入中文获得自然英文表达，或输入英文进行纠错。</p>

        <div className="translator-input-area" ref={inputAreaRef}>
          <textarea
            className="translator-input"
            value={inputText}
            onChange={(event) => setInputText(event.target.value)}
            onFocus={() => setInputFocused(true)}
            placeholder="例如：我想去超市买东西 / I want to going to the store"
            rows={6}
          />

          {showHistoryButton && (
            <button
              aria-expanded={historyMenuOpen}
              aria-label="打开输入历史"
              className="history-toggle"
              onClick={() => setHistoryMenuOpen((open) => !open)}
              type="button"
            >
              ▼
            </button>
          )}

          {historyMenuOpen && (
            <div className="history-menu">
              {inputHistory.length > 0 ? (
                inputHistory.map((historyItem) => (
                  <div className="history-row" key={historyItem}>
                    <button
                      className="history-item"
                      onClick={() => handleSelectHistory(historyItem)}
                      type="button"
                    >
                      {historyItem}
                    </button>
                    <button
                      aria-label={`删除历史记录 ${historyItem}`}
                      className="history-remove"
                      onClick={(event) => handleRemoveHistory(event, historyItem)}
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                ))
              ) : (
                <div className="history-empty">暂无历史记录</div>
              )}
            </div>
          )}
        </div>

        {!speechSupported && (
          <div className="notice">{getSayItUnsupportedMessage(recordingDiagnostics)}</div>
        )}

        <button
          className="secondary diagnostics-toggle"
          onClick={() => setShowRecordingDiagnostics((visible) => !visible)}
          type="button"
        >
          {showRecordingDiagnostics ? "隐藏录音诊断" : "显示录音诊断"}
        </button>

        {showRecordingDiagnostics && (
          <RecordingDiagnosticsPanel diagnostics={recordingDiagnostics} title="Say It 录音诊断" />
        )}

        <div className="actions">
          <button onClick={handleSend} disabled={loading}>
            {loading ? "处理中..." : "发送"}
          </button>
          <button
            className="secondary"
            disabled={!speechSupported || loading}
            onMouseDown={startRecording}
            onMouseLeave={stopRecording}
            onMouseUp={stopRecording}
            onTouchEnd={stopRecording}
            onTouchStart={(event) => {
              event.preventDefault();
              startRecording();
            }}
            type="button"
          >
            {isRecording ? "停止录音" : "开始录音"}
          </button>
          <button
            className="secondary"
            disabled={!result?.english_text}
            onClick={() => void speak()}
            type="button"
          >
            朗读
          </button>
          <button
            className="danger"
            disabled={!isSpeaking}
            onClick={stopSpeaking}
            type="button"
          >
            停止
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        <div className="result say-it-result">
          {result ? (
            <>
              {result.display_text && <div className="paragraph-result">{result.display_text}</div>}

              {result.question && (
                <div className="clarification">
                  <strong>{result.question}</strong>
                  <div className="option-list">
                    {result.options.map((option) => (
                      <button
                        className="secondary"
                        disabled={loading}
                        key={option}
                        onClick={() => handleClarification(option)}
                        type="button"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {result.english_text && (
                <>
                  <div className="result-row">
                    <span>英文</span>
                    <strong>{result.english_text}</strong>
                  </div>
                  <div className="favorite-actions">
                    <button
                      className="favorite-button"
                      disabled={savingSentence}
                      onClick={handleSaveSentence}
                      type="button"
                    >
                      {sentenceSaved ? "★ 已收藏" : savingSentence ? "收藏中..." : "☆ 收藏句子"}
                    </button>
                  </div>
                  {favoriteNotice && <div className="favorite-notice">{favoriteNotice}</div>}
                </>
              )}

              {result.explanation && (
                <div className="result-row">
                  <span>说明</span>
                  <strong>{result.explanation}</strong>
                </div>
              )}
            </>
          ) : (
            <div className="empty">Say it 的结果会显示在这里。</div>
          )}
        </div>
      </section>
    </main>
  );
}

export default SayItPage;

function buildClarifiedText(state: ClarificationState | null, selectedOption: string): string {
  if (!state) {
    return selectedOption;
  }

  if (state.ambiguousText && state.originalText.includes(state.ambiguousText)) {
    return state.originalText.replace(state.ambiguousText, selectedOption);
  }

  return state.originalText;
}

function getSayItUnsupportedMessage(diagnostics: RecordingDiagnostics): string {
  if (!diagnostics.isSecureContext) {
    return "当前页面不是 HTTPS/安全上下文，手机浏览器通常会阻止麦克风。请通过 HTTPS 或 localhost 访问。";
  }

  return "当前浏览器不支持 Web Speech Recognition，请使用 Chrome 或 Edge，或在 Partner 中使用录音上传。";
}

function getSpeechRecognitionFailureMessage(errorCode: string): string {
  if (isSpeechRecognitionPermissionDenied(errorCode)) {
    return "麦克风权限被拒绝，请在浏览器地址栏或系统设置中允许麦克风后重试。";
  }

  if (errorCode === "audio-capture") {
    return "没有找到可用麦克风，请检查设备麦克风或系统权限。";
  }

  if (errorCode === "network") {
    return "浏览器语音识别服务连接失败，请检查网络或改用 Partner 录音上传。";
  }

  if (errorCode === "no-speech") {
    return "没有检测到语音，请靠近麦克风再试一次。";
  }

  return `语音识别失败：${errorCode || "unknown"}`;
}

function isSpeechRecognitionPermissionDenied(errorCode: string): boolean {
  return errorCode === "not-allowed" || errorCode === "service-not-allowed";
}
