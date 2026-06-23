import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";

import { createLearningItem } from "../features/learning-book/api";
import TranslateDetailPanel from "../features/translator/TranslateDetailPanel";
import { translateText } from "../features/translator/api";
import type { TranslateResult } from "../features/translator/types";
import {
  addInputHistory,
  loadInputHistory,
  removeInputHistory
} from "../shared/inputHistory";
import { speakEnglish, stopSpeaking } from "../shared/speech";

const INPUT_HISTORY_STORAGE_KEY = "llp_translator_input_history";

function TranslatorPage() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<TranslateResult | null>(null);
  const [detailExpanded, setDetailExpanded] = useState(false);
  const [wordSaved, setWordSaved] = useState(false);
  const [savingWord, setSavingWord] = useState(false);
  const [favoriteNotice, setFavoriteNotice] = useState("");
  const [inputHistory, setInputHistory] = useState<string[]>(() =>
    loadInputHistory(INPUT_HISTORY_STORAGE_KEY)
  );
  const [historyMenuOpen, setHistoryMenuOpen] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const abortReasonRef = useRef<"clear" | "stop" | null>(null);
  const inputAreaRef = useRef<HTMLDivElement | null>(null);

  const hasInput = Boolean(text.trim());
  const canClear = hasInput || Boolean(result) || Boolean(error) || loading;
  const showHistoryButton = inputFocused || historyMenuOpen;

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

  function cancelSpeech() {
    stopSpeaking();
  }

  function abortTranslate(reason: "clear" | "stop") {
    if (!abortControllerRef.current) {
      return;
    }

    abortReasonRef.current = reason;
    abortControllerRef.current.abort();
    abortControllerRef.current = null;
  }

  async function handleTranslate() {
    const input = text.trim();
    if (!input) {
      setError("请输入英文单词、短语或句子。");
      setResult(null);
      setDetailExpanded(false);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setLoading(true);
    setError("");
    setDetailExpanded(false);
    setWordSaved(false);
    setFavoriteNotice("");

    try {
      setResult(await translateText(input, controller.signal));
      setInputHistory(addInputHistory(INPUT_HISTORY_STORAGE_KEY, input));
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        if (abortReasonRef.current === "stop") {
          setError("已停止当前操作。");
        }
        return;
      }

      setResult(null);
      setError(err instanceof Error ? err.message : "翻译失败，请稍后重试。");
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      abortReasonRef.current = null;
      setLoading(false);
    }
  }

  async function handleSpeak() {
    const result = await speakEnglish(text);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setError("");
  }

  function handleClear() {
    abortTranslate("clear");
    cancelSpeech();
    setText("");
    setResult(null);
    setDetailExpanded(false);
    setWordSaved(false);
    setFavoriteNotice("");
    setError("");
    setLoading(false);
  }

  function handleStop() {
    abortTranslate("stop");
    cancelSpeech();
    setLoading(false);
  }

  function handleSelectHistory(historyItem: string) {
    setText(historyItem);
    setHistoryMenuOpen(false);
    setInputFocused(true);
  }

  function handleRemoveHistory(event: MouseEvent<HTMLButtonElement>, historyItem: string) {
    event.stopPropagation();
    setInputHistory(removeInputHistory(INPUT_HISTORY_STORAGE_KEY, historyItem));
  }

  async function handleSaveWord() {
    if (!result || result.kind !== "term") {
      return;
    }

    setSavingWord(true);
    setFavoriteNotice("");

    try {
      await createLearningItem({
        type: "word",
        source_text: result.detail?.headword || text.trim(),
        phonetic: result.ipa,
        part_of_speech: result.part_of_speech,
        meaning: result.chinese,
        detail_json: result.detail ? JSON.stringify(result.detail) : null
      });
      setWordSaved(true);
      setFavoriteNotice("已收藏到 Learning Book。");
    } catch (err) {
      setFavoriteNotice(err instanceof Error ? err.message : "收藏失败，请稍后重试。");
    } finally {
      setSavingWord(false);
    }
  }

  return (
    <main className="page">
      <section className="translator">
        <h1>Translator</h1>
        <p className="subtitle">输入英文，快速获得中文翻译。</p>

        <div className="translator-input-area" ref={inputAreaRef}>
          <textarea
            className="translator-input"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onFocus={() => setInputFocused(true)}
            placeholder="输入英文单词、短语、句子或段落..."
            rows={7}
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

        <div className="actions">
          <button onClick={handleTranslate} disabled={loading}>
            {loading ? "翻译中..." : "翻译"}
          </button>
          <button className="secondary" onClick={handleSpeak} disabled={!hasInput}>
            朗读
          </button>
          <button className="secondary" onClick={handleClear} disabled={!canClear}>
            清空
          </button>
          <button className="danger" onClick={handleStop} disabled={!loading && !hasInput}>
            停止
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        <div className="result">
          {result ? (
            result.kind === "term" ? (
              <>
                <div className="result-row">
                  <span>中文</span>
                  <strong>{result.chinese}</strong>
                </div>
                <div className="result-row">
                  <span>音标</span>
                  <strong>{result.ipa || "暂无"}</strong>
                </div>
                <div className="result-row">
                  <span>词性</span>
                  <strong>{result.part_of_speech || "暂无"}</strong>
                </div>
                <div className="favorite-actions">
                  <button
                    className="favorite-button"
                    disabled={savingWord}
                    onClick={handleSaveWord}
                    type="button"
                  >
                    {wordSaved ? "★ 已收藏" : savingWord ? "收藏中..." : "☆ 收藏"}
                  </button>
                </div>
                {favoriteNotice && <div className="favorite-notice">{favoriteNotice}</div>}
                {result.detail && (
                  <>
                    <div className="detail-actions">
                      <button
                        className="more-toggle"
                        onClick={() => setDetailExpanded((expanded) => !expanded)}
                        type="button"
                      >
                        {detailExpanded ? "less" : "more"}
                      </button>
                    </div>
                    {detailExpanded && <TranslateDetailPanel detail={result.detail} />}
                  </>
                )}
              </>
            ) : (
              <div className="paragraph-result">{result.chinese}</div>
            )
          ) : (
            <div className="empty">翻译结果会显示在这里。</div>
          )}
        </div>
      </section>
    </main>
  );
}

export default TranslatorPage;
