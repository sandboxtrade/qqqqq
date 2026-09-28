# v0.20.35 — Alia character

Добавлен новый полноценный персонаж **Алия** (`alia_v1`), 33 года.

## Профиль
- Алия — взрослая казашка, 33 года, Алматы.
- Профессия: дизайнер интерьеров.
- Отдельные core traits, personality, surface voice и initial intimacy baseline.
- Манера общения: спокойная взрослая уверенность, конкретность, мягкая сухая ирония, без ассистентской/терапевтической речи.

## Внешность и фото
Добавлена папка `public/assets/profiles/alia/`:
- `avatar.jpg` — канонический OpenAI reference;
- `identity-sheet.jpg` — чистый multi-view reference для WaveSpeed;
- `01.jpg`, `02.jpg`, `03.jpg` — фотографии галереи.

Worker теперь знает mapping `alia_v1 -> alia`, поэтому OpenAI/WaveSpeed автоматически используют её собственные reference assets и не смешивают Алию с другими персонажами.

## World
Для Алии добавлены отдельные activity details и ежедневный routine: работа над интерьерными проектами, встречи/дела, кафе, прогулки, чтение и отдых.

## Compatibility
- `SCHEMA_VERSION=4` не менялся.
- Firebase/Auth/Firestore paths и live-sync contracts не менялись.
- Итоговая версия: `ENGINE_VERSION=0.20.35`.
