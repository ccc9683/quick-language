export type RecordingDiagnostics = {
  userAgent: string;
  platform: string;
  isSecureContext: boolean;
  hasNavigatorMediaDevices: boolean;
  hasGetUserMedia: boolean;
  hasMediaRecorder: boolean;
  hasSpeechRecognition: boolean;
  mimeTypeSupport: Record<string, boolean>;
  supportedMimeTypes: string[];
  selectedMimeType: string;
  permissionState: string;
  recordingState: string;
  stage: string;
  startError: string;
  stopError: string;
  lastErrorName: string;
  lastErrorMessage: string;
  blobSize: number | null;
  audioDurationMs: number | null;
  updatedAt: string;
};

export type RecordingDiagnosticsPatch = Partial<
  Pick<
    RecordingDiagnostics,
    | "selectedMimeType"
    | "permissionState"
    | "recordingState"
    | "stage"
    | "startError"
    | "stopError"
    | "lastErrorName"
    | "lastErrorMessage"
    | "blobSize"
    | "audioDurationMs"
  >
>;

export const RECORDING_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav"
];

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: {
    platform?: string;
  };
};

type WindowWithSpeechRecognition = Window & {
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
};

export function collectRecordingDiagnostics(
  patch: RecordingDiagnosticsPatch = {}
): RecordingDiagnostics {
  const nav = navigator as NavigatorWithUserAgentData;
  const mediaRecorder = getMediaRecorderConstructor();
  const mimeTypeSupport = getMimeTypeSupport(mediaRecorder);

  return {
    userAgent: nav.userAgent || "unknown",
    platform: nav.userAgentData?.platform || nav.platform || "unknown",
    isSecureContext: window.isSecureContext,
    hasNavigatorMediaDevices: Boolean(nav.mediaDevices),
    hasGetUserMedia: typeof nav.mediaDevices?.getUserMedia === "function",
    hasMediaRecorder: Boolean(mediaRecorder),
    hasSpeechRecognition: hasSpeechRecognitionConstructor(),
    mimeTypeSupport,
    supportedMimeTypes: RECORDING_MIME_TYPES.filter((mimeType) => mimeTypeSupport[mimeType]),
    selectedMimeType: patch.selectedMimeType ?? "",
    permissionState: patch.permissionState ?? "unknown",
    recordingState: patch.recordingState ?? "idle",
    stage: patch.stage ?? "init",
    startError: sanitizeDiagnosticMessage(patch.startError ?? ""),
    stopError: sanitizeDiagnosticMessage(patch.stopError ?? ""),
    lastErrorName: sanitizeDiagnosticMessage(patch.lastErrorName ?? ""),
    lastErrorMessage: sanitizeDiagnosticMessage(patch.lastErrorMessage ?? ""),
    blobSize: patch.blobSize ?? null,
    audioDurationMs: patch.audioDurationMs ?? null,
    updatedAt: new Date().toISOString()
  };
}

export async function readMicrophonePermissionState(): Promise<string> {
  if (!navigator.permissions?.query) {
    return "permissions_api_unavailable";
  }

  try {
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return status.state;
  } catch (err) {
    return `permission_query_error:${getErrorName(err)}`;
  }
}

export function selectSupportedAudioMimeType(): string {
  const mediaRecorder = getMediaRecorderConstructor();
  if (!mediaRecorder || typeof mediaRecorder.isTypeSupported !== "function") {
    return "";
  }

  return RECORDING_MIME_TYPES.find((mimeType) => mediaRecorder.isTypeSupported(mimeType)) ?? "";
}

export function canUseMediaRecorderUpload(diagnostics: RecordingDiagnostics): boolean {
  return (
    diagnostics.isSecureContext &&
    diagnostics.hasNavigatorMediaDevices &&
    diagnostics.hasGetUserMedia &&
    diagnostics.hasMediaRecorder
  );
}

export function logRecordingDiagnostics(context: string, diagnostics: RecordingDiagnostics): void {
  console.info(`[llp-recording:${context}]`, diagnostics);
}

export function getErrorName(err: unknown): string {
  if (err instanceof DOMException || err instanceof Error) {
    return err.name || "Error";
  }

  return "UnknownError";
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof DOMException || err instanceof Error) {
    return sanitizeDiagnosticMessage(err.message || err.name || "Unknown error");
  }

  return "Unknown error";
}

export function sanitizeDiagnosticMessage(message: string): string {
  return message
    .replace(/((?:api[_-]?key|token|authorization)\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]")
    .replace(/(Bearer\s+)[^\s,;]+/gi, "$1[redacted]");
}

function getMediaRecorderConstructor(): typeof MediaRecorder | null {
  return typeof MediaRecorder === "undefined" ? null : MediaRecorder;
}

function getMimeTypeSupport(mediaRecorder: typeof MediaRecorder | null): Record<string, boolean> {
  return Object.fromEntries(
    RECORDING_MIME_TYPES.map((mimeType) => [
      mimeType,
      Boolean(mediaRecorder?.isTypeSupported?.(mimeType))
    ])
  );
}

function hasSpeechRecognitionConstructor(): boolean {
  const speechWindow = window as WindowWithSpeechRecognition;
  return Boolean(speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition);
}
