# v0.20.19 — Kira, Valeria, Mei

База: v0.20.18. SCHEMA_VERSION остаётся 4.

Добавлены три полноценных взрослых персонажа:

- Kira — 22, `kira_v1`, Санкт-Петербург. Творческая, атмосферная, наблюдательная; фотография и дизайн.
- Valeria — 20, `valeria_v1`, Москва. Luxury-среда, высокая уверенность, избирательность и сухая ирония.
- Mei — 20, `mei_v1`, Москва. Японка; мягкая, умная, игривая; маркетинг и медиа.

Для каждой добавлены:

- отдельный CharacterCore;
- Personality;
- обязательный per-character voiceProfile;
- Social profile / bio / interests / gallery metadata;
- отдельный initial intimacy baseline;
- visualProfile + expressionGuidance;
- отдельный world/activity detail set;
- отдельный daily routine;
- Cloudflare reference routing;
- character-specific no-refusal photo fallback.

Канонические reference paths подготовлены, но avatar.jpg намеренно не включены:

- `public/assets/profiles/kira/avatar.jpg`
- `public/assets/profiles/valeria/avatar.jpg`
- `public/assets/profiles/mei/avatar.jpg`

После загрузки этих файлов Worker автоматически будет использовать соответственно:

- `profile.kira.avatar`
- `profile.valeria.avatar`
- `profile.mei.avatar`

Важно: до загрузки `avatar.jpg` запросы на AI-photo для этих персонажей не должны считаться готовыми к production — image-edit требует reference текущего персонажа.

Firebase/Auth/Firestore/App Check/live-sync/persistence contracts не менялись. SCHEMA_VERSION=4.
