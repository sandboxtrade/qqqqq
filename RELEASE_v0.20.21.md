# v0.20.21 — cumulative characters + stronger photo identity pipeline

База: накопительный v0.20.20. SCHEMA_VERSION остаётся 4.

## Сохранено из v0.20.20
- Kira, Valeria, Mei и Alina со всеми их personality/voice/world/photo routing изменениями.
- No-refusal photo mode, character-specific voice/expression guidance.
- Асинхронный WaveSpeed fallback через `/yuzukiPhotoResult` и `providerTaskId`.

## Фото
- Для обычных фото OpenAI остаётся первым провайдером; используются длинный timeout и повтор временных ошибок.
- Обычные фото получают отдельную нейтральную retry-ветку до WaveSpeed.
- WaveSpeed получает отдельный identity-heavy prompt.
- Добавлена автоматическая поддержка `public/assets/profiles/<slug>/identity-sheet.jpg`.
- Для WaveSpeed при наличии sheet порядок references: `identity-sheet.jpg` -> `avatar.jpg` -> optional extra reference.
- OpenAI по умолчанию использует обычный `avatar.jpg`, чтобы multi-view collage не усложнял обычные генерации.
- В response diagnostics добавлены `referenceDebug` и `primaryAttempts`.

## Папки
В patch уже включены папки для всех текущих персонажей, чтобы можно было просто загрузить `avatar.jpg` и `identity-sheet.jpg` без ручного создания директорий.
