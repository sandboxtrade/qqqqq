import { FormEvent, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import type { ChatMessage } from '../../app/store';
import { Icon } from '../components/Icon';

function timeOf(timestamp: number) {
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

export function ChatScreen({ messages, ready, busy, onSend }: { messages: ChatMessage[]; ready: boolean; busy: boolean; onSend: (text: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length, busy]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value || !ready || busy) return;
    setText('');
    void onSend(value);
  };

  return (
    <section className="chat-screen">
      <div className="chat-scroll">
        {!messages.length && (
          <div className="empty-chat">
            <Icon name="sparkle" size={22} />
            <strong>Разговор начинается здесь</strong>
            <span>Она будет помнить важные вещи и возвращаться к незакрытым темам.</span>
          </div>
        )}
        {messages.map((message) => (
          <article key={message.id} className={`message-row ${message.role}`}>
            <div className={`bubble ${message.role}`}>
              {message.proactive && <span className="proactive-label">сама написала</span>}
              <p>{message.text}</p>
              <time>{timeOf(message.timestamp)}</time>
            </div>
          </article>
        ))}
        {busy && <div className="typing"><span /><span /><span /></div>}
        <div ref={endRef} />
      </div>

      <form className="composer" onSubmit={submit}>
        <div className="composer-field">
          <Icon name="sparkle" size={18} />
          <textarea
            value={text}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setText(event.target.value)}
            onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            placeholder={ready ? 'Напиши ей…' : 'Инициализация…'}
            disabled={!ready || busy}
          />
        </div>
        <button className="send-button" type="submit" disabled={!ready || busy || !text.trim()} aria-label="Отправить">
          <Icon name="send" size={20} />
        </button>
      </form>
    </section>
  );
}
