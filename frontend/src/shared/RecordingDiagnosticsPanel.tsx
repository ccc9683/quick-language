import type { RecordingDiagnostics } from "./recordingDiagnostics";
import { RECORDING_MIME_TYPES } from "./recordingDiagnostics";

type RecordingDiagnosticsPanelProps = {
  diagnostics: RecordingDiagnostics;
  title?: string;
};

export function RecordingDiagnosticsPanel({
  diagnostics,
  title = "录音诊断"
}: RecordingDiagnosticsPanelProps) {
  const mimeSupport = RECORDING_MIME_TYPES.map(
    (mimeType) => `${mimeType}: ${diagnostics.mimeTypeSupport[mimeType] ? "yes" : "no"}`
  ).join(" / ");

  return (
    <details className="recording-diagnostics" open>
      <summary>{title}</summary>
      <dl className="recording-diagnostics-grid">
        <dt>userAgent</dt>
        <dd>{diagnostics.userAgent}</dd>
        <dt>platform</dt>
        <dd>{diagnostics.platform}</dd>
        <dt>secure context</dt>
        <dd>{formatBoolean(diagnostics.isSecureContext)}</dd>
        <dt>navigator.mediaDevices</dt>
        <dd>{formatBoolean(diagnostics.hasNavigatorMediaDevices)}</dd>
        <dt>getUserMedia</dt>
        <dd>{formatBoolean(diagnostics.hasGetUserMedia)}</dd>
        <dt>MediaRecorder</dt>
        <dd>{formatBoolean(diagnostics.hasMediaRecorder)}</dd>
        <dt>SpeechRecognition</dt>
        <dd>{formatBoolean(diagnostics.hasSpeechRecognition)}</dd>
        <dt>MIME type 支持</dt>
        <dd>{mimeSupport || "unknown"}</dd>
        <dt>permission</dt>
        <dd>{diagnostics.permissionState}</dd>
        <dt>state</dt>
        <dd>{diagnostics.recordingState}</dd>
        <dt>stage</dt>
        <dd>{diagnostics.stage}</dd>
        <dt>selected MIME</dt>
        <dd>{diagnostics.selectedMimeType || "default"}</dd>
        <dt>start error</dt>
        <dd>{diagnostics.startError || "none"}</dd>
        <dt>stop error</dt>
        <dd>{diagnostics.stopError || "none"}</dd>
        <dt>last error</dt>
        <dd>{formatLastError(diagnostics)}</dd>
        <dt>audio blob size</dt>
        <dd>{diagnostics.blobSize === null ? "unknown" : `${diagnostics.blobSize} bytes`}</dd>
        <dt>duration</dt>
        <dd>
          {diagnostics.audioDurationMs === null ? "unknown" : `${diagnostics.audioDurationMs} ms`}
        </dd>
        <dt>updated</dt>
        <dd>{diagnostics.updatedAt}</dd>
      </dl>
    </details>
  );
}

function formatBoolean(value: boolean): string {
  return value ? "yes" : "no";
}

function formatLastError(diagnostics: RecordingDiagnostics): string {
  if (!diagnostics.lastErrorName && !diagnostics.lastErrorMessage) {
    return "none";
  }

  return [diagnostics.lastErrorName, diagnostics.lastErrorMessage].filter(Boolean).join(": ");
}
