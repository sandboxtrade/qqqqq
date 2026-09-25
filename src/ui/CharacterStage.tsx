import { useEffect, useMemo, useState } from "react";
import { AssetScene } from "../avatar/AssetScene";
import {
  deriveAvatarCue,
  resolveAvatarVisualState,
  type AvatarVisualCue,
} from "../avatar/avatar-model";
import { defaultCharacter } from "../character/character";
import type { RuntimeState } from "../engine/runtime";
import type { AppTab } from "./components";

const activityLabel: Record<string, string> = {
  sleeping: "спит",
  waking_up: "просыпается",
  breakfast: "завтракает",
  personal_project: "занята своим делом",
  reading: "читает",
  music: "слушает музыку",
  walk: "гуляет",
  cooking: "готовит",
  errands: "по делам",
  cafe_break: "в кафе",
  relaxing: "отдыхает",
  chatting: "с тобой",
  idle: "свободна",
};

const timeLabel: Record<string, string> = {
  night: "ночь",
  morning: "утро",
  day: "день",
  evening: "вечер",
};

const relationshipLabel: Record<string, string> = {
  new: "знакомство",
  familiar: "приятели",
  close: "близкие",
  deep: "глубокая связь",
};

export function CharacterStage({
  runtime,
  busy = false,
  visualCue = null,
  visualCueKey = null,
  onNavigate,
  onQuietAction,
  quietActionDisabled = false,
}: {
  runtime: RuntimeState | null;
  busy?: boolean;
  visualCue?: AvatarVisualCue | null;
  visualCueKey?: string | null;
  onNavigate: (tab: AppTab) => void;
  onQuietAction?: (text: string) => void;
  quietActionDisabled?: boolean;
}) {
  const [transientCue, setTransientCue] = useState<AvatarVisualCue | null>(null);

  useEffect(() => {
    if (!visualCue || !visualCueKey) {
      setTransientCue(null);
      return;
    }
    setTransientCue(visualCue);
    const timer = window.setTimeout(() => setTransientCue(null), 6500);
    return () => window.clearTimeout(timer);
  }, [visualCue, visualCueKey]);

  const mood = runtime?.emotion.mood ?? 0.5;
  const moodLabel =
    runtime?.world.isAwake === false
      ? "отдыхает"
      : mood > 0.7
        ? "хорошее настроение"
        : mood < 0.36
          ? "немного закрыта"
          : "спокойная";
  const resolvedCue = transientCue ?? deriveAvatarCue(runtime);
  const visualState = useMemo(
    () => resolveAvatarVisualState(runtime, resolvedCue, busy),
    [runtime, resolvedCue, busy],
  );

  const currentActivity = runtime
    ? (activityLabel[runtime.world.currentActivity] ?? runtime.world.currentActivity)
    : "загрузка";
  const currentTime = runtime ? (timeLabel[runtime.world.timeOfDay] ?? runtime.world.timeOfDay) : "";
  const relationshipStage = runtime
    ? (relationshipLabel[runtime.relationship.stage] ?? runtime.relationship.stage)
    : "связь";
  const warmth = runtime
    ? runtime.relationship.closeness >= 0.74
      ? "ощутимо тянется к тебе"
      : runtime.relationship.closeness >= 0.5
        ? "становится ближе"
        : "привыкает к тебе"
    : "";
  const topSummary = runtime
    ? busy
      ? "собирает ответ"
      : `${currentTime} · ${moodLabel}`
    : "подготовка сцены";

  return (
    <section
      className={`stage live-photo-stage cue-${visualState.cue} ${busy ? "is-thinking" : ""}`}
      data-visual-cue={visualState.cue}
    >
      <div className="stage-ambient" />
      <div className="stage-emotion-wash" aria-hidden="true" />
      <div className="stage-grid" />

      <div className="live-avatar">
        <AssetScene assetId={runtime?.appearance?.assetId} visualState={visualState} />
      </div>

      {runtime?.romance?.phase === "private" && (
        <div className="quiet-moment" role="status">
          <strong>Тихий момент вдвоём</strong>
          <span>Без спешки и лишних слов</span>
          <div className="quiet-actions">
            <button
              type="button"
              disabled={quietActionDisabled}
              onClick={() => onQuietAction?.("Вернёмся к разговору")}
            >
              Вернуться к разговору
            </button>
            <button
              type="button"
              disabled={quietActionDisabled}
              onClick={() => onQuietAction?.("Стоп")}
            >
              Остановиться
            </button>
          </div>
        </div>
      )}

      <div className="stage-topline">
        <div className="presence-pill">
          <span
            className={
              runtime?.world.isAwake === false ? "presence-dot sleeping" : "presence-dot"
            }
          />
          {busy ? "думает…" : currentActivity}
        </div>
        <div className="stage-meta-pills" aria-hidden="true">
          {currentTime ? <span className="stage-meta-pill">{currentTime}</span> : null}
          <span className="stage-meta-pill subtle">{busy ? "ответ" : moodLabel}</span>
        </div>
      </div>

      <div className="stage-bottom">
        <div className="character-title">
          <div>
            <h1>{defaultCharacter.name}</h1>
            <p>{topSummary}</p>
          </div>
          <span className="relationship-badge">{relationshipStage}</span>
        </div>

        <div className="stage-summary-row">
          <span className="stage-summary-pill">{currentActivity}</span>
          {warmth ? <span className="stage-summary-pill">{warmth}</span> : null}
        </div>

        <div className="quick-actions">
          <button type="button" onClick={() => onNavigate("chat")}>Написать</button>
          <button type="button" onClick={() => onNavigate("together")}>Побыть вместе</button>
          <button
            type="button"
            disabled={quietActionDisabled}
            onClick={() => onQuietAction?.("Как ты сейчас?")}
          >
            Как ты?
          </button>
        </div>
      </div>
    </section>
  );
}
