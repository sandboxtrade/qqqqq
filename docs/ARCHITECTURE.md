# Game2 / Alexandra v0.21.2 — архитектура

`alexandra_v1` — единственный активный персонаж. Оставлены Firebase Auth, Firestore, App Check, live-sync, память, механические emotion/relationship/intimacy/world, правила инициативы и `SCHEMA_VERSION = 4`. Новое хранилище или миграции не вводились; фото в IndexedDB на текущем устройстве.

## Чат

`ChatScreen -> app/store -> engine/runtime -> ai/cloud-language -> /yuzukiSpeak -> GPT`.

GPT получает механическое состояние и возвращает `messages`, bounded emotional/relationship/intimacy deltas и `photoDecision`. При согласии GPT пишет **готовый английский промпт**, начинающийся с `g2girl01`; Worker проверяет механические ограничения, подписывает промпт короткоживущим HMAC-токеном и возвращает решение. После сохранения ответа `src/app/store.ts` запускает очередь `queueGeneratedPhotoDelivery` и прежнее долговечное локальное журналирование задачи.

Затем `src/ai/cloud-photo.ts -> POST /yuzukiPhoto` отправляет решение с подписанным промптом. Worker сверяет подпись, пользовательский Firebase Auth + App Check, лимит запросов, LoRA, и делает единственный submit в `wavespeed-ai/z-image/turbo-lora`. Клиент сохраняет taskId/taskToken и опрашивает `POST /yuzukiPhotoResult`. Подписанный токен задачи связан с аккаунтом и ID задачи. Полученное изображение сохраняется локально, а сообщение фиксируется прежним форматом событий.

## Рядом

`App/world.currentActivity -> presence-photo.ts -> POST /alexandraPresencePhoto`.

Worker принимает только activity из разрешённого перечня, а GPT выбирает естественную сцену в рамках текущей активности, без произвольной внешности и без смены занятия. Тот же WaveSpeed Z-Image Turbo LoRA создаёт фото. Результат опрашивается с подписанным taskToken, сохраняется в IndexedDB. Сохранены ограничение обновления раз в 30 минут, TTL 3 часа и серверный лимит 4 обращения/час (process-local). Для незавершённой задачи «Рядом» создан локальный журнал возобновления опроса без повторного submit.

## Провайдеры

**Активный генератор новых фото только `wavespeed-ai/z-image/turbo-lora`.** LoRA задаётся серверной `ALEXANDRA_LORA_URL`, сила `ALEXANDRA_LORA_SCALE` (по умолчанию 0.85), разрешение 1024*1536, seed -1. Параметры соответствуют WaveSpeed API.

В v0.21.10 устаревшие реализации gpt-image-2 / Seedream / Qwen удалены из **исполняемого** `cloudflare/worker.js` (раньше хранились внутри неиспользуемого `alexPhotoProviders`). Резервная копия доступна отдельно как архив предыдущей версии или независимый backup. Активная фотогенерация остаётся WaveSpeed Z-Image Turbo LoRA; OpenAI GPT используется для диалога и промптов, не для генерации изображений.

## Ограничения

Внешняя LoRA ещё не подключена; реальная генерация не проверена. Подписанный prompt нельзя поменять без провала HMAC; однако локальные счётчики вызовов Worker не эквивалентны глобальному квотированию Cloudflare KV/Durable Object. Гарантированная server-wide idempotency задач потребует отдельного постоянного сервера или KV/Durable Object — добавлять его сейчас не стали во избежание изменения существующего формата и фундамента.
