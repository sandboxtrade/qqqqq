Yuzuki Cloudflare Runtime Fix

Причина проблемы:
предыдущий Cloudflare client patch добавил transport src/ai/cloud-language.ts,
но не включил src/engine/runtime.ts, который реально вызывает renderCloudLanguage().
Из-за этого Yuzuki продолжала отвечать только Local Brain, а POST /yuzukiSpeak не появлялся.

Что исправлено:
- src/engine/runtime.ts импортирует renderCloudLanguage;
- после локального рендера вызывает Cloudflare language layer для подходящих сообщений;
- передает только компактный уже определенный Local Brain контекст;
- применяет Local Guard к облачному тексту;
- при любой ошибке/skip остается локальный ответ;
- cloud telemetry остается только в runtime trace и не записывается в character event.

Установка:
1. Распаковать архив.
2. Скопировать папку src поверх корня репозитория sandboxtrade/qqqqq с заменой файла.
3. Дождаться GitHub Pages deploy.
4. Открыть приложение заново.
5. В DevTools -> Network фильтр yuzukiSpeak.
6. Отправить не короткое сообщение.

Проверено вместе с текущим Cloudflare transport:
- Cloud language transport PASS
- 170 regression checks PASS
- 73 Local Dialogue groups PASS
- 120 canonical NLU scenarios PASS
- 400-turn stress PASS
- AI transport PASS
