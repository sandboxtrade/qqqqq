import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import type { ChatMessage } from "../app/store";
import { Icon } from "./components";

function timeOf(timestamp: number) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

const BOTTOM_THRESHOLD_PX = 72;
const starterPrompts = [
  "Как ты сейчас?",
  "О чём ты хочешь поговорить?",
  "Побудем немного вместе?",
];

export function ChatScreen({
  characterName,
  messages,
  ready,
  busy,
  onSend,
  draft,
  onDraftChange,
  streamingText,
  phase,
  onRetry,
  onDismissFailed,
  hasOlderMessages,
  loadingOlder,
  onLoadOlder,
}: {
  characterName: string;
  streamingText: string;
  phase: string;
  onRetry: (messageId: string) => Promise<void>;
  onDismissFailed: (messageId: string) => Promise<void>;
  hasOlderMessages: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => Promise<void>;
  messages: ChatMessage[];
  ready: boolean;
  busy: boolean;
  onSend: (text: string) => Promise<void>;
  draft: string;
  onDraftChange: (text: string) => void;
}) {
  const [showNewMessages, setShowNewMessages] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const nearBottomRef = useRef(true);
  const mountedRef = useRef(false);

  const updateBottomState = () => {
    const node = scrollRef.current;
    if (!node) return;
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    const nearBottom = distance <= BOTTOM_THRESHOLD_PX;
    nearBottomRef.current = nearBottom;
    if (nearBottom) setShowNewMessages(false);
  };

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    nearBottomRef.current = true;
    setShowNewMessages(false);
    endRef.current?.scrollIntoView({ behavior, block: "end" });
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const height = Math.min(textarea.scrollHeight, 96);
    textarea.style.height = `${Math.max(22, height)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 96 ? "auto" : "hidden";
  }, [draft]);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      window.requestAnimationFrame(() => scrollToBottom("auto"));
      return;
    }
    if (nearBottomRef.current) {
      window.requestAnimationFrame(() => scrollToBottom("smooth"));
    } else {
      setShowNewMessages(true);
    }
  }, [messages.at(-1)?.id, streamingText]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value || !ready || busy) return;
    onDraftChange("");
    nearBottomRef.current = true;
    void onSend(value);
  };

  return (
    <section className="chat-screen">
      <div className="chat-scroll" ref={scrollRef} onScroll={updateBottomState}>
        {messages.length > 0 && hasOlderMessages && (
          <button
            className="load-older"
            type="button"
            disabled={loadingOlder}
            onClick={() => {
              const node = scrollRef.current;
              const previousHeight = node?.scrollHeight ?? 0;
              const previousTop = node?.scrollTop ?? 0;
              void onLoadOlder().then(() => {
                window.requestAnimationFrame(() => {
                  if (!node) return;
                  node.scrollTop = previousTop + Math.max(0, node.scrollHeight - previousHeight);
                  updateBottomState();
                });
              });
            }}
          >
            {loadingOlder ? "Загружаем…" : "Показать более ранние сообщения"}
          </button>
        )}

        {!messages.length && (
          <div className="empty-chat">
            <Icon name="sparkle" size={22} />
            <strong>Разговор начинается здесь</strong>
            <span>
              Она будет помнить важные вещи, менять состояние и возвращаться к незакрытым темам.
            </span>
          </div>
        )}

        {messages.map((message) => (
          <article key={message.id} className={`message-row ${message.role}`}>
            <div className={`bubble ${message.role}`}>
              {message.proactive && <span className="proactive-label">сама написала</span>}
              {message.kind === "image" ? (
                <figure className={`chat-photo photo-${message.imageStatus ?? "ready"}`}>
                  {message.imageStatus === "pending" ? (
                    <div className="chat-photo-placeholder" role="status">
                      <span className="photo-loader" aria-hidden="true" />
                      <strong>готовит фото…</strong>
                      <small>это отдельное сообщение, не живая сцена</small>
                    </div>
                  ) : message.imageStatus === "failed" ? (
                    <div className="chat-photo-placeholder photo-failed" role="status">
                      <strong>фото не отправилось</strong>
                      <small>на следующем этапе сюда подключится повтор генерации</small>
                    </div>
                  ) : message.imageUrl ? (
                    <img
                      src={message.imageUrl}
                      alt={message.imageAlt || `Фото от ${characterName}`}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="chat-photo-placeholder">
                      <strong>фото</strong>
                    </div>
                  )}
                  {message.text ? <figcaption>{message.text}</figcaption> : null}
                </figure>
              ) : (
                <p>{message.text}</p>
              )}
              <time>
                {timeOf(message.timestamp)}
                {message.delivery === "pending"
                  ? " · отправляется"
                  : message.delivery === "failed"
                    ? " · нет ответа"
                    : message.delivery === "skipped"
                      ? " · пропущено"
                      : ""}
              </time>
              {message.role === "user" && message.delivery === "failed" && (
                <div className="failed-message-actions">
                  <button type="button" disabled={busy} onClick={() => void onRetry(message.id)}>
                    Повторить
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      onDraftChange(message.text);
                      void onDismissFailed(message.id);
                      window.requestAnimationFrame(() => textareaRef.current?.focus());
                    }}
                  >
                    Изменить
                  </button>
                  <button type="button" disabled={busy} onClick={() => void onDismissFailed(message.id)}>
                    Пропустить
                  </button>
                </div>
              )}
            </div>
          </article>
        ))}

        {streamingText && (
          <article className="message-row character">
            <div className="bubble character streaming">
              <p>{streamingText}</p>
              <small>ответ ещё не сохранён</small>
            </div>
          </article>
        )}

        {busy && !streamingText && (
          <div className="typing">
            <span />
            <span />
            <span />
          </div>
        )}

        {busy && (
          <div className="send-phase" role="status">
            {phase}
          </div>
        )}

        <div ref={endRef} />
        {showNewMessages && (
          <button className="new-messages-button" type="button" onClick={() => scrollToBottom("smooth")}>
            Новые сообщения ↓
          </button>
        )}
      </div>

      {ready && !busy && !draft.trim() && messages.length === 0 && (
        <div className="starter-row" aria-label="Быстрые подсказки">
          {starterPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="starter-chip"
              onClick={() => {
                nearBottomRef.current = true;
                void onSend(prompt);
              }}
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      <form className="composer" onSubmit={submit}>
        <div className="composer-field">
          <Icon name="sparkle" size={18} />
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onDraftChange(event.target.value)}
            onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            maxLength={12000}
            placeholder={ready ? `Напиши ${characterName}…` : "Инициализация…"}
            disabled={!ready || busy}
          />
        </div>
        <button
          className="send-button"
          type="submit"
          disabled={!ready || busy || !draft.trim()}
          aria-label="Отправить"
        >
          <Icon name="send" size={20} />
        </button>
      </form>
    </section>
  );
}
