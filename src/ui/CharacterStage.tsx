import { useMemo } from "react";
import { AssetScene } from "../avatar/AssetScene";
import {
  deriveAvatarCue,
  resolveAvatarVisualState,
} from "../avatar/avatar-model";
import type { RuntimeState } from "../engine/runtime";

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

export function CharacterStage({
  runtime,
  busy = false,
  onQuietAction,
  quietActionDisabled = false,
}: {
  runtime: RuntimeState | null;
  busy?: boolean;
  onQuietAction?: (text: string) => void;
  quietActionDisabled?: boolean;
}) {
  const mood = runtime?.emotion.mood ?? 0.5;
  const moodLabel =
    runtime?.world.isAwake === false
      ? "отдыхает"
      : mood > 0.7
        ? "хорошее настроение"
        : mood < 0.36
          ? "немного закрыта"
          : "спокойная";
  const resolvedCue = deriveAvatarCue(runtime);
  const visualState = useMemo(
    () => resolveAvatarVisualState(runtime, resolvedCue, busy),
    [runtime, resolvedCue, busy],
  );

  const currentActivity = runtime
    ? (activityLabel[runtime.world.currentActivity] ?? runtime.world.currentActivity)
    : "загрузка";
  const currentTime = runtime ? (timeLabel[runtime.world.timeOfDay] ?? runtime.world.timeOfDay) : "";

  return (
    <section
      className={`stage live-photo-stage cue-${visualState.cue} ${busy ? "is-thinking" : ""}`}
      data-visual-cue={visualState.cue}
    >
      <div className="stage-ambient" />
      <div className="stage-emotion-wash" aria-hidden="true" />
      <div className="stage-grid" />

      <div className="live-avatar">
        <AssetScene
          assetId={runtime?.appearance?.assetId}
          visualState={visualState}
          warmIntimacy={runtime?.intimacy?.adultModeEnabled === true}
        />
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

    </section>
  );
}
