export type BrowserSpeechRecognitionEvent = Event & {
  results: {
    length: number;
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
};

export type BrowserSpeechRecognitionErrorEvent = Event & {
  error?: string;
};

export type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type SpeechRecognitionOptions = {
  lang?: string;
  onResult: (transcript: string) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
};

type SpeakOptions = {
  rate?: number;
  onEnd?: () => void;
  onError?: (error: string) => void;
  voiceWaitMs?: number;
};

export type SpeakEnglishResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
    };

export const SPEECH_SYNTHESIS_UNAVAILABLE_MESSAGE =
  "当前浏览器朗读不可用，请检查浏览器语音合成支持或系统声音设置。";

const EMPTY_SPEECH_TEXT_MESSAGE = "没有可朗读的英文文本。";
const DEFAULT_VOICE_WAIT_MS = 600;

export function getSpeechRecognitionConstructor(): BrowserSpeechRecognitionConstructor | null {
  const speechWindow = window as Window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };

  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return Boolean(getSpeechRecognitionConstructor());
}

export function createSpeechRecognition({
  lang = "zh-CN",
  onResult,
  onError,
  onEnd
}: SpeechRecognitionOptions): BrowserSpeechRecognition | null {
  const SpeechRecognition = getSpeechRecognitionConstructor();
  if (!SpeechRecognition) {
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = lang;
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.onresult = (event) => {
    const lastResult = event.results[event.results.length - 1];
    const transcript = lastResult?.[0]?.transcript?.trim();
    if (transcript) {
      onResult(transcript);
    }
  };
  recognition.onerror = (event) => {
    onError?.(event.error ?? "unknown");
  };
  recognition.onend = () => {
    onEnd?.();
  };

  return recognition;
}

export async function speakEnglish(
  text: string,
  options: SpeakOptions = {}
): Promise<SpeakEnglishResult> {
  const englishText = text.trim();
  if (!englishText) {
    return {
      ok: false,
      error: EMPTY_SPEECH_TEXT_MESSAGE
    };
  }

  if (!isSpeechSynthesisSupported()) {
    return {
      ok: false,
      error: SPEECH_SYNTHESIS_UNAVAILABLE_MESSAGE
    };
  }

  const synthesis = window.speechSynthesis;
  synthesis.cancel();
  const voices = await loadSpeechSynthesisVoices(synthesis, options.voiceWaitMs);

  synthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(englishText);
  utterance.lang = "en-US";
  utterance.rate = options.rate ?? 0.9;
  utterance.pitch = 1;
  utterance.volume = 1;
  utterance.voice = selectEnglishVoice(voices);
  utterance.onend = () => options.onEnd?.();
  utterance.onerror = () => options.onError?.(SPEECH_SYNTHESIS_UNAVAILABLE_MESSAGE);

  try {
    synthesis.speak(utterance);
  } catch {
    options.onError?.(SPEECH_SYNTHESIS_UNAVAILABLE_MESSAGE);
    return {
      ok: false,
      error: SPEECH_SYNTHESIS_UNAVAILABLE_MESSAGE
    };
  }

  return {
    ok: true
  };
}

export function stopSpeaking(): void {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function isSpeechSynthesisSupported(): boolean {
  return "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

function selectEnglishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const englishVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));

  return (
    englishVoices.find((voice) => voice.lang.toLowerCase() === "en-us") ??
    englishVoices.find((voice) => voice.lang.toLowerCase().startsWith("en-us")) ??
    englishVoices[0] ??
    null
  );
}

function loadSpeechSynthesisVoices(
  synthesis: SpeechSynthesis,
  voiceWaitMs = DEFAULT_VOICE_WAIT_MS
): Promise<SpeechSynthesisVoice[]> {
  const voices = synthesis.getVoices();
  if (voices.length > 0) {
    return Promise.resolve(voices);
  }

  return new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      synthesis.removeEventListener("voiceschanged", finish);
      resolve(synthesis.getVoices());
    };

    const timeoutId = window.setTimeout(finish, voiceWaitMs);
    synthesis.addEventListener("voiceschanged", finish);
  });
}
