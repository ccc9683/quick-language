import { useEffect, useState } from "react";

import { deleteLearningItem, fetchLearningItems } from "../features/learning-book/api";
import type { LearningItem, LearningItemType } from "../features/learning-book/types";
import TranslateDetailPanel from "../features/translator/TranslateDetailPanel";
import { translateText } from "../features/translator/api";
import type { TranslateDetail } from "../features/translator/types";
import { speakEnglish } from "../shared/speech";

function LearningBookPage() {
  const [activeType, setActiveType] = useState<LearningItemType>("word");
  const [items, setItems] = useState<LearningItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadItems(activeType);
  }, [activeType]);

  async function loadItems(type: LearningItemType) {
    setLoading(true);
    setError("");

    try {
      setItems(await fetchLearningItems(type));
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取收藏失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    setError("");

    try {
      await deleteLearningItem(id);
      setItems((currentItems) => currentItems.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败，请稍后重试。");
    }
  }

  async function speak(text: string) {
    const result = await speakEnglish(text);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setError("");
  }

  return (
    <main className="page">
      <section className="translator">
        <h1>Learning Book</h1>
        <p className="subtitle">统一查看已收藏的单词和句子。</p>

        <div className="book-tabs" role="tablist" aria-label="Learning book type">
          <button
            className={activeType === "word" ? "book-tab active" : "book-tab"}
            onClick={() => setActiveType("word")}
            type="button"
          >
            Words
          </button>
          <button
            className={activeType === "sentence" ? "book-tab active" : "book-tab"}
            onClick={() => setActiveType("sentence")}
            type="button"
          >
            Sentences
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        <div className="book-list">
          {loading ? (
            <div className="empty">加载中...</div>
          ) : items.length > 0 ? (
            items.map((item) =>
              item.type === "word" ? (
                <WordCard item={item} key={item.id} onDelete={handleDelete} onSpeak={speak} />
              ) : (
                <SentenceCard item={item} key={item.id} onDelete={handleDelete} onSpeak={speak} />
              )
            )
          ) : (
            <div className="empty">暂无收藏内容。</div>
          )}
        </div>
      </section>
    </main>
  );
}

function WordCard({
  item,
  onDelete,
  onSpeak
}: {
  item: LearningItem;
  onDelete: (id: number) => void;
  onSpeak: (text: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<TranslateDetail | null>(() => parseStoredDetail(item));
  const [detailPhonetic, setDetailPhonetic] = useState<string | null>(item.phonetic);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [meaningVisible, setMeaningVisible] = useState(false);

  async function handleToggleMore() {
    if (expanded) {
      setExpanded(false);
      return;
    }

    const savedDetail = detail ?? parseStoredDetail(item);
    if (savedDetail) {
      setDetail(savedDetail);
      setExpanded(true);
      return;
    }

    setLoadingDetail(true);
    setDetailError("");

    try {
      // Older favorites may only have a simple meaning. There is no update API yet,
      // so fetched detail is displayed in memory only for this page session.
      const fetched = await fetchWordDetail(item.source_text);
      setDetail(fetched.detail);
      setDetailPhonetic(fetched.phonetic || item.phonetic);
    } catch {
      setDetail(buildFallbackDetail(item));
      setDetailError("暂时只能显示已保存的基础信息。");
    } finally {
      setLoadingDetail(false);
      setExpanded(true);
    }
  }

  return (
    <article className="book-card book-card-word">
      <div className="word-card-top">
        <div className="word-card-main">
          <h2>{item.source_text}</h2>
          {item.phonetic && <span>{item.phonetic}</span>}
          {item.part_of_speech && <span>{item.part_of_speech}</span>}
        </div>
        <div className="book-card-actions">
          <button
            className="secondary compact meaning-toggle"
            onClick={() => setMeaningVisible((visible) => !visible)}
            type="button"
          >
            {meaningVisible ? "隐藏中文" : "显示中文"}
          </button>
          <button
            className="secondary compact"
            disabled={loadingDetail}
            onClick={handleToggleMore}
            type="button"
          >
            {expanded ? "less" : loadingDetail ? "..." : "more"}
          </button>
          <button className="secondary compact" onClick={() => onSpeak(item.source_text)} type="button">
            朗读
          </button>
          <button className="danger compact" onClick={() => onDelete(item.id)} type="button">
            删除
          </button>
        </div>
      </div>
      <div className="word-meaning-row">
        {meaningVisible && item.meaning && <p>{item.meaning}</p>}
        {meaningVisible && !item.meaning && <p>暂无中文释义</p>}
      </div>
      {expanded && detail && (
        <div className="book-card-detail">
          <TranslateDetailPanel detail={detail} phonetic={detailPhonetic} />
          {detailError && <div className="favorite-notice">{detailError}</div>}
        </div>
      )}
    </article>
  );
}

function SentenceCard({
  item,
  onDelete,
  onSpeak
}: {
  item: LearningItem;
  onDelete: (id: number) => void;
  onSpeak: (text: string) => void;
}) {
  const englishText = item.target_text || "";

  return (
    <article className="book-card">
      <div className="book-card-main">
        <h2>{item.source_text}</h2>
        {englishText && <p>{englishText}</p>}
      </div>
      <div className="book-card-actions">
        <button
          className="secondary compact"
          disabled={!englishText}
          onClick={() => onSpeak(englishText)}
          type="button"
        >
          朗读英文
        </button>
        <button className="danger compact" onClick={() => onDelete(item.id)} type="button">
          删除
        </button>
      </div>
    </article>
  );
}

async function fetchWordDetail(sourceText: string): Promise<{
  detail: TranslateDetail;
  phonetic: string | null;
}> {
  const result = await translateText(sourceText);
  if (result.kind !== "term" || !result.detail) {
    throw new Error("Translate detail is unavailable.");
  }

  return {
    detail: result.detail,
    phonetic: result.ipa
  };
}

function parseStoredDetail(item: LearningItem): TranslateDetail | null {
  if (!item.detail_json) {
    return null;
  }

  try {
    const parsed = JSON.parse(item.detail_json) as unknown;
    return normalizeDetail(parsed, item);
  } catch {
    return null;
  }
}

function normalizeDetail(value: unknown, item: LearningItem): TranslateDetail | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const detail = value as Record<string, unknown>;
  const headword = readString(detail.headword) || item.source_text;
  if (!headword) {
    return null;
  }

  return {
    headword,
    pos: readString(detail.pos) || item.part_of_speech,
    meanings: readStringArray(detail.meanings, splitMeanings(item.meaning)),
    usages: readUsageArray(detail.usages),
    synonyms: readStringArray(detail.synonyms),
    common_mistakes: readMistakeArray(detail.common_mistakes)
  };
}

function buildFallbackDetail(item: LearningItem): TranslateDetail {
  return {
    headword: item.source_text,
    pos: item.part_of_speech,
    meanings: splitMeanings(item.meaning),
    usages: [],
    synonyms: [],
    common_mistakes: []
  };
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value.filter(
    (item): item is string => typeof item === "string" && Boolean(item.trim())
  );
  return items.length > 0 ? items : fallback;
}

function readUsageArray(value: unknown): TranslateDetail["usages"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((usage) => {
    if (!usage || typeof usage !== "object") {
      return [];
    }

    const usageData = usage as Record<string, unknown>;
    const pattern = readString(usageData.pattern);
    const exampleEn = readString(usageData.example_en);
    const exampleZh = readString(usageData.example_zh);
    if (!pattern || !exampleEn || !exampleZh) {
      return [];
    }

    return [{ pattern, example_en: exampleEn, example_zh: exampleZh }];
  });
}

function readMistakeArray(value: unknown): TranslateDetail["common_mistakes"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((mistake) => {
    if (!mistake || typeof mistake !== "object") {
      return [];
    }

    const mistakeData = mistake as Record<string, unknown>;
    const wrong = readString(mistakeData.wrong);
    const correct = readString(mistakeData.correct);
    const note = readString(mistakeData.note);
    if (!wrong || !correct || !note) {
      return [];
    }

    return [{ wrong, correct, note }];
  });
}

function splitMeanings(meaning: string | null): string[] {
  if (!meaning) {
    return [];
  }

  return meaning
    .split(/[,，;；、\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default LearningBookPage;
