# v0.20.20 — Alina + cumulative v0.20.19 character pack

База: v0.20.19. SCHEMA_VERSION остаётся 4.

## Добавлено
- Новый взрослый персонаж Alina, 20 лет: `alina_v1`.
- Отдельные personality и `ALINA_VOICE_STYLE`.
- Тёмная альтернативная эстетика без карикатурного goth-roleplay.
- Отдельный world/activity распорядок и стартовая relationship/intimacy динамика.
- Отдельный `expressionGuidance` для фотографий.
- Reference routing: `alina_v1 -> profile.alina.avatar`.
- Канонический путь: `public/assets/profiles/alina/avatar.jpg`.

## Важно
- Этот patch накопительный: он также содержит изменения v0.20.19 для Kira, Valeria и Mei, поскольку предыдущий пакет ещё не был установлен.
- `avatar.jpg` Alina в пакет не включён: загрузите выбранный канонический референс по указанному пути.
- Firebase/Auth/Firestore/App Check/live-sync/persistence контракты не менялись.
- После замены `cloudflare/worker.js` нужен отдельный Deploy Worker `shy-unit-ebfb`.
