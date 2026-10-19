# Game2 v0.21.6 — Deploy TypeScript Fix

База: полный архив `Game2-Alexandra-v0.21.5-dark-economy.zip`. Обновление накопительное, GitHub и Cloudflare не изменялись.

## Причины ошибок GitHub Actions

- `src/storage/player-data.ts`: тип поля `kind` операции пополнения расширялся до `string`, несовместимого с `VirtualTransactionKind`. Уточнён как `"topup" as const`.
- `src/engine/runtime.ts`: `contextText` используется в обработке экономического события, но отсутствовал в интерфейсе `TurnInput`. Добавлено `contextText?: string` без изменения остальных параметров.
- `tests/dark-economy.mjs`: абсолютный путь к локальному TypeScript заменён на `import ts from "typescript"`, чтобы CI работал на GitHub-hosted runner.
- Добавлен `tests/deploy-typecheck.mjs`: проверка TypeScript-контракта и строгая компиляция модуля кошелька с временными заглушками Firebase.

## Без изменений

Чат, фотогенерация WaveSpeed Z-Image Turbo LoRA, память, отношения, профиль, оформление, экономика, Firestore и формат сохранений. `SCHEMA_VERSION = 4`.

## Ограничения

Полная `npm run typecheck` и `npm run build` требуют установки npm-зависимостей. В текущем окружении registry.npmjs.org не разрешается, поэтому production-сборка не подтверждена. Для проверки на GitHub выполнить `npm ci && npm run verify`.
