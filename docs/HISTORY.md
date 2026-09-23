# Project History

Historical handoff notes retained for reference. Checksums from older archives were intentionally omitted because they do not describe the current tree.


---

## CHARACTER_ASSET_PLAN.md

# Character asset generation quick plan

Use `_HANDOFF/master-character-reference.jpeg` as Image A / master reference.

Maintain identity:
- same face structure
- same eye shape/color
- same hair
- same body proportions
- same apparent adult age
- same rendering style

Generate first:
1. master_front
2. master_3q
3. portrait_close
4. chair_01
5. sofa_01
6. bed_01
7. neutral
8. soft_smile
9. shy
10. annoyed

Recommended output: 1440×2560, 9:16. For character-only production assets, transparent PNG is preferred.

Do not generate each image independently from text. Always reference the master image so identity does not drift.


---

## START_HERE_NEW_CHAT.md

> Актуальная версия: **v0.8.0**. Начни с `_HANDOFF/V0.8.0_FINAL_STABILIZATION.md`.

Стабилизация по исходному аудиту завершена: этапы 1–7 закрыты, все 30 пунктов повторно проверены. Новых этапов в этом цикле не планируется.


---

## V0.5.2_LIVE_PHOTO_TEST.md

# v0.5.2 — Live Photo Test

Temporary single-photo animated prototype.

Implemented:
- random blinking;
- subtle breathing/body sway;
- tiny movement around the hand near the face;
- tiny lower-hand motion when visible;
- subtle hair motion;
- different idle motion while waiting for a reply;
- existing chat/Firebase/memory/cognition architecture preserved.

Limitation:
This is still one raster image. Hand/hair motion is an optical micro-motion effect using masked copies of the same image, not skeletal animation. Large movement would break the illusion, so amplitudes are intentionally tiny.

Next:
1. deploy and inspect on iPhone;
2. tune blink/hand positions if needed;
3. test Gemini conversation end-to-end;
4. then move to layered body/hair/face/clothes assets.


---

## V0.5.3_STARTUP_FIX.md

# v0.5.3 startup fix

Problem observed on GitHub Pages:
- chat composer remained on «Инициализация…» indefinitely;
- the app shell was visible, but chat could not be used.

Changes:
- Firebase initial-auth observer now has a 6 second safety timeout.
- App bootstrap no longer waits for memory recovery/consolidation, initiative generation, or world persistence.
- Heavy startup maintenance runs best-effort after the runtime state is already available.
- Bootstrap itself has a 12 second hard timeout.
- Gemini perception/reply calls have a 15 second hard timeout and fall back to local logic when AI does not answer.
- failed startup now exposes a «Повторить» action instead of leaving a permanently disabled composer.
- the v0.5.2 single-photo animation is preserved unchanged.

The core memory/Firebase architecture was not removed.


---

## V0.5.4_FIRESTORE_SANITIZE.md

# v0.5.4 — Firestore undefined-value fix

Observed production error:

`Function setDoc() called with invalid data. Unsupported field value: undefined`
for `lastMeaningfulWorldEventAt` in `world/current`.

Cause:
`WorldState.lastMeaningfulWorldEventAt` is optional. On a fresh character/world state it can legitimately be absent, but Firestore rejects explicit JavaScript `undefined` values.

Fix:
- all repository writes are sanitized recursively before `setDoc`;
- undefined object fields are omitted;
- undefined array items are removed;
- the fix covers events, state, world, initiatives, memories, knowledge and open threads, so the same class of error cannot reappear in another document;
- v0.5.3 startup timeout/non-blocking bootstrap fixes are included;
- v0.5.2 live-photo animation is included.

Do not upload v0.5.3 first. v0.5.4 supersedes it.


---

## V0.5.5_CHAT_AND_ANIMATION.md

# Virtual Companion v0.5.5 — chat and live-photo stabilization

## Обновление

Это полный исходный проект на базе v0.5.4. Скопируйте содержимое папки проекта
в корень sandboxtrade/qqqqq с заменой файлов, включая package-lock.json и .github.
Не загружайте ZIP как единственный файл репозитория. Дождитесь успешного Actions.
Старые вкладки приложения закройте, затем откройте сайт снова.

Firebase config, project ID, модель gemini-3.8-flash, user-scoped пути и правила
сохранены. Удалять Firestore или данные не нужно. Очистка истории не производится.
Старые технические сообщения остаются в истории, но исключаются из контекста модели.

## Изменения

- Один потоковый языковой запрос вместо двух последовательных запросов на каждый ход.
- Последние 20 реплик передаются вместе с локальным решением и найденной памятью.
- Thinking MINIMAL для Gemini 3 Flash, ограничение размера ответа.
- Gemini: 25 секунд на запрос с отменой, Firebase: 8 секунд на операцию,
  отправка целиком: 40 секунд. Это предел ожидания, не обещание скорости облачного сервиса.
- Ошибки AI/App Check не превращаются в реплики персонажа. Есть отдельная ошибка и повтор.
- Потоковый черновик явно отмечен как ещё не сохранённый; окончательный ответ показан
  после подтверждения сохранения. Незавершённый поток не добавляется в историю.
- Стабильный ID сообщения и детерминированный ID ответа. Повтор после неопределённого
  результата записи сначала проверяет сохранённый ответ.
- Ответ, состояние и события мира сохраняются транзакцией с проверкой revision.
- Репозиторий привязан к UID; устаревший сеанс не может писать под новым аккаунтом.
- Запуск только читает состояние. Обслуживание памяти не пишет старые снимки мира/эмоций.
- Консолидация и инициативы выполняются после готовности чата, отменяются при отправке.
- Причина ошибки фоновой обработки доступна в настройках.
- Исправлены извлечение возраста на русском и обработка старого факта после нового.
- Ответы персонажа тоже образуют память; retrieval не выполняет блокирующие записи.
- Проверка уже обработанных событий выполняется общим запросом, не 160 последовательными.
- Энергия рассчитывается по прошедшему времени, а не числу вызовов. Сон восстанавливает её.
- Очередь инициатив вновь может дать сообщение после возвращения; не вмешивается
  в недавний разговор и отменяется при начале отправки.
- Анимация: WebGL-деформация головы, плеч и руки; глаза в координатах исходного фото.
  30 кадров/с, пауза в скрытой вкладке, reduced-motion, статический fallback без WebGL.
- Интерфейс под высоту экрана, отдельные статусы отправки, видимый повтор, IME guard.

## Проверки

- npm run typecheck / npm run build: успешно с реальными установленными зависимостями.
- npm test: 15 регрессионных проверок; Firebase SDK и Gemini в этих тестах заменены
  контролируемыми имитациями. Проверяются реальные методы репозитория и движка.
- Chromium: потоковый UI, ошибка, повтор без дубликата, изменение кадров canvas,
  отсутствие JS-ошибок, размеры 390×844, 375×667, 1280×800, 390×480.
- Закрытые глаза и мобильный экран проверены по скриншотам.
- Реальный Google sign-in / App Check / Firestore / Gemini в пользовательском проекте
  НЕ проверены. Тесты не подтверждают квоты, настройки консоли, доступность модели
  или работоспособность iOS Safari на физическом устройстве.

## Проверка после публикации

1. Войти в Google. Отправить «Привет», затем «Как ты?».
2. Проверить, что ответ появляется постепенно, а в настройках Gemini — «ответил».
3. Перезагрузить страницу: обе стороны разговора должны остаться.
4. Если произошла ошибка — нажать «Повторить». Сообщение не должно продублироваться.
5. При ошибке Gemini прислать её полный текст из отдельного баннера.
6. Проверить поворот экрана и открытие клавиатуры на iPhone.

## Оставшиеся ограничения

- Это деформация одной фотографии и процедурные веки, не Live2D и не скелетная модель.
  При замене фото нужна новая калибровка координат в src/avatar/LivePhoto.tsx.
- Shared Life, одежда и комнаты остаются прежними заготовками.
- Локальная интерпретация на правилах ограничена; Gemini perception-модуль сохранён,
  но исключён из обычного критического пути отправки ради скорости.
- Восстановление памяти ограничено последними 160 raw events; история не удаляется.
- Одновременное обслуживание производной памяти на нескольких устройствах не имеет
  распределённого блокирования; транзакционная защита относится к сообщениям и снимку
  состояния. Основной сценарий — один активный чат. Это не заявляется как полная
  многоустройственная синхронизация в реальном времени.
- При облачной ошибке доступен повтор прежнего сообщения. Новое сообщение блокируется
  до повтора; отдельное редактирование/отмена pending-turn пока не реализованы.

SCHEMA_VERSION остаётся 4: новые поля revision имеют безопасное значение 0 для старых данных.
ENGINE_VERSION и package version — 0.5.5. Старые handoff-документы являются историей;
этот документ имеет приоритет для текущего поведения.


---

## V0.5.6_PERSISTENCE_HARDENING.md

# Virtual Companion v0.5.6 — persistence/config hardening

## Scope

This release is approach 1/7 of the post-v0.5.5 hardening plan. It deliberately does not change Character Brain, memory semantics, World Engine behavior, initiative policy or the live-photo animation. It only hardens configuration and the persistence boundary already introduced in v0.5.5.

## Changes

- Production is fail-closed. Missing or incomplete Firebase configuration no longer opens a volatile local chat.
- Production requires the reCAPTCHA Enterprise site key. Local in-memory persistence remains available only in development when Firebase configuration is completely absent.
- Partially filled Firebase configuration is considered an error instead of silently falling back.
- `getCompanionRepository()` asserts runtime configuration before selecting a repository.
- Direct mutable `saveSnapshot()` / `saveWorldState()` repository methods were removed from the public repository interface. Conversation state/world mutation goes through the revision-protected turn commit path.
- Added `loadRuntimeState()` so state and world are loaded as a paired persistence unit.
- `state/current` and `world/current` are now written with the same revision in one Firestore transaction.
- Firestore turn commits detect an existing state/world revision mismatch (`state-world-conflict`) instead of overwriting it.
- `commitTurn()` validates the user/reply pair, duplicate IDs and revision input.
- Every pre-existing event ID in a commit is checked for immutable-content collision. Existing identical source/world events remain idempotent.
- `appendEvent()` now rejects reuse of an event ID with different immutable content (`event-id-collision`) rather than silently ignoring the write.
- Retry remains safe across engine-version updates: idempotency comparison uses immutable event content and does not require the attempted event's current engine/schema metadata to match the already persisted historical metadata.
- A concurrent second generated reply for the same user event resolves as an already committed turn when the stored reply is correctly linked by `inReplyTo`; the saved reply remains authoritative.
- The in-memory development repository mirrors these persistence invariants.

## What was intentionally not changed

The deeper items scheduled for approaches 2–7 remain open, including schema migrations, Character Core decision ownership, memory contradiction/retrieval work, Initiative starvation, world timezone/time model, emotion mood normalization, visual cue integration, live sync, history pagination and the larger CI/test expansion.

The eight fixes supplied by the previous v0.5.5 chat were not reimplemented or reverted.

## Verification

- `npm test`: 19/19 regression checks pass.
- Added/strengthened checks for immutable event collision and paired runtime revision.
- All 52 TypeScript/TSX source files pass TypeScript `transpileModule` syntax diagnostics.
- A fresh `npm ci` in the archive-building environment did not complete because the package download step hit the container/network timeout; therefore dependency-backed `npm run typecheck` and `npm run build` could not be repeated locally for this release.
- v0.5.5 had already passed real dependency-backed typecheck/build. The deployment workflow should be used as the final build verification for v0.5.6.
- No live Google sign-in, App Check token, Firestore write or Gemini call was performed against the user's production Firebase project while preparing this archive.

## Version

- package version: 0.5.6
- ENGINE_VERSION: 0.5.6
- SCHEMA_VERSION: 4 (unchanged; full schema migration/versioning is approach 2)


---

## V0.5.7_SCHEMA_VERSIONING.md

# Virtual Companion v0.5.7 — schema versioning and controlled migration

## Scope

This release is approach 2/7. It does not change Character Brain policy, memory contradiction semantics, Initiative selection policy, World Engine behavior or the live-photo UI. It hardens how persistent data is interpreted across releases.

## Added persistence boundary

New file: `src/storage/persistence-schema.ts`.

Every Firestore read for current persistent entities now goes through an explicit decoder instead of `data() as Type`:

- raw events
- `state/current`
- `world/current`
- memories
- knowledge facts
- open threads
- initiatives
- memory-processing markers

The decoder detects a schema version, performs supported read-time migration, validates the resulting shape and only then returns a domain object.

## Version separation

- `SCHEMA_VERSION = 4`: immutable CharacterEvent schema; unchanged.
- `STORAGE_SCHEMA_VERSION = 1`: mutable/derived Firestore document schema; new.
- `MEMORY_PROCESSOR_VERSION = 1`: memory consolidation algorithm marker; new.

This separation prevents unrelated migrations from being coupled to the event log.

## Legacy migration

Documents written before v0.5.7 have no derived-document `schemaVersion`. They are considered storage schema v0 and are migrated in memory to v1.

The migration is intentionally read-only. Merely opening the app does not mass-rewrite the user's Firestore. A migrated document is persisted as v1 only when normal application logic later updates that entity.

Legacy defaults cover fields that did not exist in older documents. Current v1 documents are strict: malformed required fields, unsupported enum values, invalid numeric ranges or mismatched document IDs are rejected.

Unknown future storage/event schema versions fail closed instead of being interpreted by an older client.

## Writes

New writes of state, world, memories, knowledge, threads and initiatives are validated before Firestore and include `schemaVersion: 1`.

`state/current` and `world/current` still use the v0.5.6 atomic revision transaction; this release adds schema validation around it rather than replacing it.

## Memory rebuild/versioning

`memoryProcessed/{eventId}` now stores `processorVersion` in addition to its storage schema version.

Legacy markers are mapped to processor version 1 so v0.5.7 does not replay all existing memory. In a future release, intentionally changing the consolidation algorithm requires bumping `MEMORY_PROCESSOR_VERSION`. Old markers will then stop counting as current and a controlled rebuild can process their source events again.

## Raw events

Raw historical events remain immutable. Older supported event envelopes are normalized only in memory. Reading an event never rewrites it simply to update schema metadata.

## Verification

- Regression suite: 27/27 checks pass.
- New checks cover legacy state/world migration, rejection of future schema versions, strict current-schema required fields, schema metadata on new writes, future raw-event rejection and memory processor-version compatibility.
- `src/storage/persistence-schema.ts` and the in-memory repository pass strict standalone TypeScript checking with external type roots disabled.
- A fresh `npm ci` did not finish in the archive-building environment before the package download timeout. Partial dependencies were discarded from the final archive, so a complete dependency-backed `npm run typecheck` / `npm run build` was not claimed for this release.
- No live Firebase Auth, App Check, Firestore or Gemini calls were made.

## Next stage

Approach 3/7: Character Brain ownership — move actual preferences, boundaries, stance, agreement/disagreement/refusal and response-content decisions into the local engine before Gemini phrasing.

## Versions

- package: 0.5.7
- ENGINE_VERSION: 0.5.7
- event SCHEMA_VERSION: 4
- STORAGE_SCHEMA_VERSION: 1
- MEMORY_PROCESSOR_VERSION: 1


---

## V0.5.8_CHARACTER_BRAIN.md

# Virtual Companion v0.5.8 — Character Brain hardening

This release is approach 3/7 of the staged hardening plan. It intentionally does not change persistence schemas, memory contradiction policy, world simulation, initiative scheduling or the avatar renderer.

## Goal

Make the local Character Brain authoritative for personality-sensitive decisions before Gemini phrasing.

The response path is now conceptually:

`local perception -> interpretation -> local action decision -> local content/stance decision -> response plan -> Gemini wording -> local response guard -> persistence`

Gemini remains useful for natural wording and ordinary factual language, but it is not allowed to invent a new stable preference, reverse a local refusal, turn disagreement into agreement, or disclose hidden internal state.

## Character Core changes

`CharacterCore` now supports structured `preferenceRules` in addition to the original compact `preferences` list.

The default Yuzuki core includes local rules for:
- movie/media taste;
- quiet places vs very loud venues;
- thoughtful gifts;
- meaningful/independent conversation.

`identityVersion` is now `2` because the Character Core gained operational preference data. This is not a Firestore storage-schema migration.

## Local content decision

`CharacterDecision` now includes a `content` directive with:
- mode;
- stance;
- authoritative summary;
- reasons;
- locked/unlocked status;
- provenance;
- optional deterministic fallback;
- optional validation keywords.

When `locked=true`, Gemini may rephrase the meaning but must not choose a different position.

For ordinary factual questions, content is intentionally unlocked: Gemini may supply normal factual language, but the prompt forbids turning that factual answer into a new permanent character trait.

## Reachable autonomy actions

The local decision engine now has explicit reachable paths for:
- `ask`;
- `refuse`;
- `agree`;
- `disagree`;
- `challenge`;
- `change_topic`;
- `stay_silent`;
- `show_irritation`;
- `set_boundary`;
- existing affection/activity/acknowledge/joke paths.

`stay_silent` is represented by a persisted character reply event with `silent: true` and empty text. It completes the turn atomically but does not create a visible character bubble. Bootstrap keeps the silent completion marker so the preceding user message is not misclassified as a failed send after reload.

## Trait/Core participation

Local decisions now directly use:
- immutable traits: curiosity, assertiveness, independence, empathy, playfulness;
- slow traits: openness, patience, confidence;
- values;
- dislikes;
- boundaries;
- structured preference rules;
- communication style.

## Perception corrections

Local parsing no longer treats these as the old false positives:
- `Я люблю пиццу` -> affection;
- `Я скучаю по лету` -> affection;
- `Я не хочу идти на работу` -> boundary;
- a normal `Ты согласна со мной?` -> automatic high-pressure challenge.

Strong agreement pressure is now reserved for wording such as demands to say the user is right or commands not to argue.

`mergePerceptions()` was also hardened for future use: low-confidence model classification cannot casually overwrite a high-confidence local boundary/intent.

## Response guard

New file: `src/dialogue/response-guard.ts`.

After generation, the result is checked locally for:
- action-semantic mismatch on refusal/agreement/disagreement/challenge/boundary/topic-change/clarification;
- hidden-engine/internal-state leakage;
- required anchors for locked character preferences;
- forbidden claims;
- deterministic length caps.

If a locked response fails validation, the generated text is discarded and a local fallback is persisted instead.

Raw streaming is suppressed for locked Character Core decisions so a contradictory model draft is not briefly shown before the guard rejects it.

## Output length

Gemini max output tokens now depend on the local response plan:
- very_short: 96;
- short: 180;
- balanced: 360;
- long: 640.

A post-generation character cap is also applied as a second boundary.

## Verification

- `npm test`: 39/39 regression checks pass.
- Pure Character Brain/dialogue modules pass a strict standalone TypeScript check with the available compiler.
- All 54 TS/TSX files pass syntax transpilation.
- Firebase/Gemini are mocked by the regression suite; this is not a live-cloud verification.
- A fresh `npm ci` was attempted but timed out while downloading dependencies, so full dependency-backed `npm run typecheck` / `npm run build` were not re-confirmed in this packaging environment.

## Intentionally not changed here

Approach 4/7 remains responsible for deeper memory retrieval/contradiction cleanup and initiative-queue starvation/dedupe work.

Approach 5/7 remains responsible for world/timezone/mood-time semantics.

Approach 6/7 remains responsible for visual-cue/avatar integration.


---

## V0.5.9_MEMORY_INITIATIVE.md

# Virtual Companion v0.5.9 — Memory + Initiative hardening

Base: `virtual-companion-v0.5.8-character-brain.zip`.

This is approach 4/7. It intentionally does not change Character Brain decisions, World/Emotion rules, or the avatar/UI.

## Memory consistency

- Semantic contradiction handling now updates both layers: an older `KnowledgeFact` becomes `outdated`, and memories that are evidence for that superseded value become `outdated` too.
- Contradicting memories receive `validUntil` and `contradictionGroup`.
- The newer memory records `supersedesMemoryId` where the evidence link is available.
- Late recovery of an older event cannot reactivate an obsolete memory next to a newer fact.
- Legacy facts without `sourceMemoryIds` fall back to deterministic `memory_{eventId}` links when possible.

## Processor v2 rebuild safety

`MEMORY_PROCESSOR_VERSION` is now `2` because consolidation semantics changed.

Important migration rule:
- pre-versioned legacy `memoryProcessed` documents are treated as processor v1, not as whatever the current version happens to be;
- existing v1 markers therefore become eligible for v2 backfill;
- reprocessing an existing memory preserves reinforcement metadata (`retrievalStrength`, `accessCount`, `lastAccessedAt`) and does not revive archived/outdated status by accident.

Raw events remain immutable.

## Recovery without a fixed recent window

New helper collections/documents:

- `memoryPending/{eventId}` — work queue marker written atomically when a new raw event is first created;
- `memoryMeta/recovery` — processor version + historical backfill cursor.

Recovery does two things:
1. processes pending new events;
2. advances through historical raw events page-by-page using `(timestamp, eventId)` ordering.

This replaces dependence on only the last 120/160 raw events and avoids rescanning the entire history on every startup.

## Retrieval hardening

- A fresh/high-confidence but unrelated memory/fact can no longer pass ranking purely because of recency, confidence or retrieval strength.
- Semantic overlap now has greater weight.
- Zero-overlap candidates receive a strong penalty.
- Explicit broad recall prompts such as “помнишь…” retain a controlled high-importance fallback.
- Candidate collection combines recent memories with a second importance-sorted window, so an older but important relevant memory is not invisible merely because more than ~450 newer records exist.
- Knowledge and Open Thread runtime reads are status-filtered and bounded.

## Short-term cap

The short-term cap now evaluates a bounded union of recent and oldest active short-term candidates rather than relying on one arbitrary subset.

## Initiative queue

- If the highest-priority open thread is already deduped, selection falls through to the next eligible thread instead of starving the queue.
- World-event selection similarly falls through from an already surfaced newest event to the next shareable event.
- `expired` and `dismissed` initiatives no longer permanently poison their dedupe key.
- `surfaced` still blocks the exact same source from resurfacing every time the app opens.
- Open-thread reads are bounded to the active set used by the engine.

This stage changes only internal queue behavior. It does not redesign proactive-message UI.

## Verification

- `npm test`: 49/49 regression checks pass with Firebase SDK and Gemini mocked.
- Added regressions for memory/fact contradiction linkage, late historical recovery, relevance gating, old-important retrieval, paginated recovery, initiative starvation, expired dedupe, world-event fallthrough, processor-upgrade reinforcement preservation, and Firestore pending-queue cleanup.
- Changed pure TypeScript memory/initiative/schema modules pass a strict standalone `tsc --noEmit --strict` check with Firebase type stubs.
- A fresh `npm ci` was attempted but dependency download timed out in this environment, so a dependency-backed full `npm run typecheck` / `npm run build` was not re-confirmed here.

## Next stage

Approach 5/7: World / Emotion / time model — focus/visibility reconciliation, character timezone, client-clock robustness, availability/sleep behavior and initial mood invariants.


---

## V0.6.0_WORLD_TIME.md

# Virtual Companion v0.6.0 — World / Emotion / Time hardening

This archive completes approach 5/7 on top of v0.5.9. Character Brain, memory semantics and visual rendering were intentionally not redesigned in this pass.

## Main changes

### Persistent character timezone

`WorldState` now contains `timeZone`.

Routine resolution, time-of-day, daily initiative dedupe and own-life event generation use this persisted timezone instead of the browser's current local timezone. Existing schema-v1 world documents migrate at read time by capturing a valid system timezone once; the next normal world commit persists it.

Persistent storage schema is now `STORAGE_SCHEMA_VERSION = 2`.

### Background/focus reconciliation

The app listens for `window.focus` and `document.visibilitychange`. When the app becomes active again, elapsed world/emotion state is reconciled immediately in memory without writing an old mutable snapshot back to Firestore.

Generated world events are merged into `pendingWorldEvents` and remain immutable/idempotent.

### Stable time floor

`StableWorldClock` prevents world time from moving backwards when the device wall clock is set behind already-persisted state. When that happens it advances from the persisted floor with a monotonic timer for the current session.

This is a client-side monotonic safeguard, not a claim of authoritative server time.

### Emotion invariant

`mood` now has one canonical `deriveMood()` formula. The initial emotional state is created from that same formula, so the first tiny emotion/decay update no longer jumps mood from ~0.58 to ~0.44.

Direct `mood` deltas are ignored; mood is derived from its component emotions.

### Availability behavior

Sleeping is now a real cognition constraint:

- ordinary low-importance contact can result in `stay_silent`;
- urgent/vulnerable/high-closeness contact may wake her for a very short sleepy response;
- silent contact does not magically set `isAwake=true` or activity=`chatting`;
- an occupied character can reply briefly without abandoning the current world activity;
- response planning caps occupied replies and adds explicit world-availability constraints to Gemini.

### World event evidence

Raw world-event payloads now retain `emotionalEffect` as well as summary/location/activity/share-worthiness, improving reconstructability of historical world evidence.

## Verification

- regression suite: 56/56 passes;
- all 54 TS/TSX source files pass syntax transpilation;
- changed pure world/emotion/cognition/initiative/schema modules pass strict standalone TypeScript checking;
- Firebase and Gemini remain mocked in regression tests;
- a fresh `npm ci` was attempted, but dependency download timed out and left an incomplete `node_modules`; therefore dependency-backed full `npm run typecheck` / `npm run build` could not be re-confirmed in this environment;
- partial `node_modules` is removed from the distributable archive.

## Versions

- package / engine: `0.6.0`
- event schema: `SCHEMA_VERSION = 4`
- persistent storage schema: `STORAGE_SCHEMA_VERSION = 2`
- memory processor: `MEMORY_PROCESSOR_VERSION = 2`
- Character identity version: `2`


---

## V0.6.1_VISUAL_MOBILE.md

# Virtual Companion v0.6.1 — Visual state / mobile hardening

This archive completes approach 6/7 on top of v0.6.0. Persistence, storage schemas, Character Brain, memory semantics and world rules were intentionally not redesigned in this pass.

## Main changes

### ResponsePlan visual cue is connected to the avatar

`responsePlan.visualCue` now reaches `CharacterStage` after a saved character reply. The cue is transient (6.5 seconds), so a single `annoyed_soft`, `curious`, `warm`, etc. response does not become a permanent avatar state.

After the transient cue expires, the visible state falls back to current emotion/world state through `src/avatar/visual-state.ts`.

Supported cues remain:

- neutral
- warm
- soft_smile
- curious
- annoyed_soft
- guarded
- sad_soft
- playful

### Emotion/world driven idle profile

`resolveAvatarVisualState()` converts the current runtime into a rendering-only profile:

- motion strength;
- breathing strength;
- sway;
- head tilt bias;
- resting/closed-eye state;
- thinking motion.

This module is read-only: it does not mutate runtime emotion or world state.

Sleeping/`availability=sleeping` now closes the shader-rendered eyes and strongly reduces movement. Busy/thinking slightly changes idle motion without becoming a separate persistent character state.

### LivePhoto WebGL refinement

The existing v0.5.5 WebGL animation was retained rather than replaced.

Refinements:

- deformation regions around head/torso/hand are smaller and sharper to reduce background warping;
- motion amplitudes are lower and controlled by the visual-state profile;
- mesh reduced from 40×60 to 36×54;
- `preserveDrawingBuffer` disabled;
- render DPR capped at 1.75;
- low-power WebGL preference requested;
- animation remains capped at 30 fps;
- drawing stops while the document is hidden;
- `prefers-reduced-motion` disables continuous deformation/blinking while preserving a static/resting render;
- WebGL fallback remains the original JPG.

### Mobile UI hardening

- textarea auto-grows up to 96 px and then scrolls internally;
- textarea remains 16 px on mobile to avoid iOS focus zoom;
- send/navigation/settings touch targets enlarged;
- stage height now scales down progressively on low-height viewports;
- very short/landscape viewports hide the stage bottom card before starving the chat;
- app shell is clipped to the dynamic viewport and avoids body overscroll;
- reduced-motion also disables decorative UI transitions.

### Visual/world boundary

The current JPG is still an avatar presentation, not a literal rendering of every `world.currentLocation`. The code does not pretend that the bedroom image becomes a cafe/walk/kitchen scene. Full scene/location consistency remains for the later layered/hybrid asset system.

## Verification

- regression suite: 58/58 passes;
- all 55 TS/TSX source files pass TypeScript syntax transpilation;
- mobile layout smoke test in headless Chromium passes at 390×844, 375×667 and 844×390 without app-shell vertical overflow;
- WebGL shader execution could not be verified in the available headless Chromium because that runtime exposes no WebGL context;
- dependency-backed `npm run typecheck` / `npm run build` could not be re-confirmed because `npm ci` timed out while downloading dependencies; the partial `node_modules` was removed before packaging.

## Versions

- package / engine: `0.6.1`
- event schema: `SCHEMA_VERSION = 4`
- persistent storage schema: `STORAGE_SCHEMA_VERSION = 2`
- memory processor: `MEMORY_PROCESSOR_VERSION = 2`
- Character identity version: `2`


---

## V0.6.2_FINAL_HARDENING.md

# Virtual Companion v0.6.2 — final scaling / live-sync hardening

Date: 2026-09-22
Base: `virtual-companion-v0.6.1-visual-mobile.zip`

This release completes approach 7/7. It keeps the existing Firebase, cognition, memory, world and WebGL architecture and focuses on conversation scaling, cross-tab/device visibility, CI gates and final cleanup.

## Conversation history

Chat history is no longer restored from a fixed slice of the generic raw `events` stream. `CompanionRepository.listConversationEvents()` scans/paginates specifically for `message` and `character_action` events, so world events do not consume the visible chat-history budget.

Bootstrap loads the newest 80 conversation events. The UI can request older pages of 60 messages through a stable `(timestamp, eventId)` cursor. Older pages are merged by immutable event ID and remain chronologically ordered. The chat preserves the visible scroll anchor when a page is prepended.

## Live sync

`src/storage/live-sync.ts` adds a Firestore listener for the currently authenticated user/character. It watches recent raw events and the persisted state revision.

- new messages from another tab/device appear without reload;
- event IDs are deduplicated against local optimistic messages;
- local `pending`/`failed` delivery state is not accidentally overwritten by the listener;
- if another device successfully replies to a locally failed user event, the failed state is cleared;
- a newer persisted revision triggers a read-only runtime refresh through `loadRuntimeState()` so emotion/relationship/world catch up as well;
- auth invalidation/sign-out stops all live listeners and aborts live runtime refresh work.

The live listener intentionally watches only a bounded recent window. Complete historical navigation continues to use cursor pagination, not an unbounded realtime listener.

## CI / reproducibility

- GitHub Pages deploy now uses `npm ci`, not `npm install`.
- Deploy is gated by `npm test`, `npm run typecheck`, then `npm run build`.
- `.github/workflows/ci.yml` runs the same verification path for pushes and pull requests.
- `package-lock.json` remains the authoritative dependency tree.
- `npm run verify` runs regression tests, typecheck and production build locally/CI.

## Versions

- package / engine: `0.6.2`
- event schema: `4`
- storage schema: `2`
- memory processor: `2`
- character identityVersion: `2`

No persistence schema bump was necessary in this release. Existing v0.6.1 Firestore data is compatible.

## Regression coverage

The executable regression suite now includes 62 checks. New checks cover:

- conversation pagination independent of large volumes of world events;
- stable ordering/deduplication of live message merges;
- remote resolution of a locally failed message;
- CI/deploy workflows using locked installs and verification gates.

All 62 regression checks pass with Firebase/Gemini mocked. All TS/TSX sources also pass syntax transpilation.

## Verification limitation

A fresh `npm ci` was attempted in the build environment but the external package download timed out and left several dependency/type directories incomplete. Because of that, a dependency-backed `npm run typecheck` / `npm run build` could not be honestly re-confirmed here. The partial `node_modules` is not included in the archive. CI is now configured to run the real locked dependency-backed checks on GitHub.

Live Firebase/Auth/App Check/Gemini behavior still requires a real browser session against project `qqqq-91fc0`; regression tests use mocks and do not prove cloud credentials or quotas.

## Current architecture status

The seven stabilization approaches are complete:

1. persistence integrity and revision hardening;
2. schema versioning / migrations;
3. local Character Brain authority;
4. memory / initiative hardening;
5. world / emotion / time model;
6. visual state / mobile hardening;
7. scaling / history / live sync / CI / final audit.

The next major product stage should not be another foundation rewrite. The intended next work is the real layered character/scene system and Shared Life modules, using this v0.6.2 foundation.


---

## V0.7.0_INTIMACY_FOUNDATION.md

# Virtual Companion v0.7.0 — intimacy foundation (stage A)

Base: `v0.6.2-final-hardening`.

This release begins the adult/intimacy module without activating it in normal chat.

## Added

- `CharacterCore.adult` is an immutable architectural flag; Yuzuki remains age 24 and `adult: true`.
- `identityVersion` is now 3.
- New `src/intimacy/` module with state/types/core profile.
- Local hard gate that blocks the module when the character is not adult or adult mode is disabled.
- Structured state machine vocabulary and neutral scene/stage IDs.
- Storage privacy policy: `full`, `memories_only`, `disabled`.
- Evidence-backed intimacy preference document.
- Firestore persistence at `intimacy/state` and `intimacy/preferences` under the existing user/character scope.
- Independent optimistic revisions for both intimacy documents.
- Persistence codec validation for state, preferences, enums, bounded values and neutral scene IDs.

## Intentionally not active

`engine/runtime.ts`, current Gemini reply generation and current chat flow do not read or mutate intimacy state. Bootstrap does not create the document. No user phrase can activate the new module in v0.7.0.

## Version domains

- package / engine: `0.7.0`
- event schema: `4`
- storage schema: `2`
- memory processor: `2`
- Character Core identity version: `3`

No storage-schema bump was required because existing document shapes are unchanged; two new document types were added using the existing validated storage envelope.

## Verification

- regression suite: 68/68 passed with Firebase/Gemini mocked;
- new intimacy/schema/InMemory modules pass a separate strict TypeScript check;
- full dependency-backed typecheck/build could not be re-confirmed locally because `npm ci` timed out downloading external packages;
- CI/deploy still run locked install + tests + typecheck + build before deployment.

## Next step

Stage B: implement the local intimacy eligibility/decision/transition engine. Do not wire Gemini or visual assets directly before local decisions exist.


---

## V0.7.1_ROMANTIC_CONTEXT.md

# v0.7.1 — романтический контекст в обычном чате

База: приложенный v0.7.0. Это первый неграфический этап, не сексуальная симуляция.

## Реализовано
- `src/relationship/romance.ts`: локальное романтическое состояние, распознавание ограниченного набора русских фраз, приглашение с TTL 5 минут, подтверждение только актуального предложения, пауза и явное возобновление.
- Контекст использует отношения, настроение, доступность и локацию до применения эффектов текущего сообщения. Хорошие отношения не отменяют занятость или границы.
- Дополнительное необязательное поле `romance` в `state/current`; оно записывается той же транзакцией `commitTurn`, что ответ, эмоции и отношения. Поле имеет внутреннюю версию 1. Старые snapshots без поля читаются; основная storage schema остаётся 2, event schema 4.
- Bootstrap и live-sync восстанавливают этот контекст. Перезагрузка спустя более 30 минут не возобновляет приватный момент; пауза сохраняется до явного возобновления.
- Приватный момент: затемнение существующей сцены, без графического содержания; кнопки возврата и остановки отправляют обычный сохраняемый ход диалога.
- Игривый/романтический контекст влияет на существующую live-photo анимацию, не подменяя рисунок лица.
- В текущую очередь инициатив добавлен мягкий романтический check-in с дневной дедупликацией, учётом паузы и текущей доступности. Неактуальные ожидающие романтические инициативы снимаются.
- Gemini получает романтический контекст обычного диалога и инициатив. Критические переходы формулируются локально; служебные ошибки не становятся репликами персонажа.

## Примеры проверки
При подходящих отношениях и доступности:
1. «Ты красивая» — тёплая реакция и игривое движение.
2. «Давай побудем вдвоём» — предложение тихого вечера, если она дома и готова.
3. «Да» — актуальное предложение подтверждается, появляется затемнение.
4. «Стоп» — выход и пауза. Комплимент сам по себе её не отменяет.
5. «Можно снова флиртовать» — явное снятие паузы, без автоматического начала сцены.
6. Кнопка «Вернуться к разговору» завершает тихий момент без приостановки всей романтики.
Не изменяйте отношения в production ради проверки; тесты создают отдельные локальные fixtures.

## Ограничения этой версии
- Распознавание фраз ограниченное и локальное. Это не полное понимание произвольного русского текста.
- Основные новые реакции пока используют фиксированные фразы. Обычный разговор продолжает использовать Gemini.
- Инициативы используют прежний запуск maintenance после входа с учётом отсутствия; отдельного постоянного планировщика в открытом чате и push-уведомлений пока нет.
- Изображения, реальные выражения лица, смена поз и одежды не добавлены; сохранена исходная фотография и WebGL-анимация.
- v0.7.0 intimacy foundation сохраняется изолированным. Его adultModeEnabled и storagePolicy не активированы и не используются как настройки обычной романтической истории. В этой версии обычный чат по-прежнему сохраняется полностью.
- Ошибка сети оставляет предыдущую подтверждённую сцену до успешной записи; повтор доступен штатным механизмом.
- Запущенные старые версии приложения не знают нового поля: обновляйте все вкладки/устройства, чтобы старый клиент не записал snapshot без него.

## Проверка
- npm ci: успешно с исходным lockfile (кроме номера версии проекта).
- npm run verify: 75/75 regression checks, TypeScript, production build успешно.
- Firebase и Gemini в регрессионных тестах замоканы; live cloud smoke-test не выполнялся.
- Chromium: приглашение, подтверждение, затемнение, остановка, комплимент во время паузы; раскладки 390×844, 375×667, 1280×800, 390×480.
- Предупреждение Vite о большом JS chunk сохраняется; runtime-config.js остаётся внешним скриптом.

## Обновление
Заменить исходники репозитория содержимым папки архива, сохранив собственные изменения конфигурации, затем штатный GitHub Actions deploy. Веб-конфигурация Firebase, firestore.rules и avatar-main.jpg в этой версии не изменялись. Самостоятельно публикация не выполнялась.


---

## V0.7.2_AUTOMATIC_VISUALS.md

# v0.7.2 — automatic contextual images

Base: v0.7.1. Scope: ordinary and romantic, non-graphic character presentation.

## Implemented
- `src/avatar/asset-catalog.ts`: typed catalogue of existing images, pose, outfit, expression, compatible contexts/locations, focal point, transition group and supported animation. Only the actual reference photograph is shipped. No alternative images are invented.
- `src/avatar/appearance.ts`: deterministic selection after the local dialogue decision. Expression/context/location matching, 12-second dwell, 3-minute outfit cooldown and 30-second dwell before a wardrobe change. An incompatible location or paused context can override the hold. Private fade preserves the current image.
- `appearance` is an optional snapshot field, with inner version 1. It is saved in the existing atomic turn transaction and restored by bootstrap/live sync. Reply events retain appearanceAssetId. Older snapshots continue to read without migration writes.
- Selection occurs on committed dialogue turns, not React render or animation frames. It causes no extra Gemini call. Background world changes and standalone initiative messages do not currently run image selection.
- `AssetScene.tsx`: preload + decode with timeout, last-image retention on failure and a retry button; obsolete requests cancelled; stable composition uses a 700ms dissolve, different poses/groups use a dip through dark. Reduced-motion users get immediate decoded-image replacement.
- Reference LivePhoto preserved, with a static backing image until its first rendered frame. Other images are static: existing eye masks must never be applied to uncalibrated photos.
- Gemini receives selected-image metadata. Until visual action narration is implemented it is instructed not to claim pose/clothing changes, particularly when image loading could fail.

## Adding the user's image archive
Inspect each image, record an accurate description, pose/outfit IDs, expression, matching contexts, depicted location, focal point and transition group. Group together ONLY compatible body/camera/framing. Use unique ASCII file paths under public/assets/character and motion=still. Do not replace avatar-main.jpg while retaining the reference shader: it has fixed landmarks.

Contexts: everyday, playful, romantic, resting. No explicit-scene progression or sexual-image matching is implemented.

Catalogue example (only add after the file exists):
```ts
{
  id: "home.chair.smile",
  src: "assets/character/home-chair-smile.webp",
  description: "Юдзуки сидит в домашней одежде и улыбается",
  pose: "chair_01",
  outfit: "home_01",
  expression: "soft_smile",
  contexts: ["everyday", "romantic"],
  locations: ["living_room"],
  transitionGroup: "chair_01.camera_a",
  focalPoint: [50, 25],
  motion: "still",
}
```
Choose focalPoint based on the actual composition, not this example. Locations=[] means background-compatible anywhere; do not use it for a clearly visible contradictory location. The original reference remains a universal fallback because no other real assets are provided yet.

## Validation
81 regression checks pass, including image availability, expression selection, wardrobe cooldown, pause/location handling, deleted-ID fallback, codec roundtrip, transition groups and calibration guards. npm run verify (tests, typecheck, production build) passes with installed dependencies.
Chromium fixture test passes: dissolve, dip, deliberately failing image, last-image retention, obsolete delayed preload, reduced motion and return to calibrated canvas. Browser fixture aliases use the existing image bytes only and are not packaged as new character assets.
No live Google Auth/Firebase/Gemini smoke test or deployment was performed. The existing Vite large-chunk warning remains.

## Update
Deploy the archive's source folder through the existing workflow. Reload older app tabs/devices after deployment so old clients do not write snapshots without new optional fields. Firebase runtime config, rules and the original photograph are unchanged. See V0.7.1_ROMANTIC_CONTEXT.md for the preceding release and its limitations.


---

## V0.7.3_HARDENING_AND_LATENCY.md

# v0.7.3 — исправления и задержка ответа

База: v0.7.2, без замены архитектуры и модели. Firebase, user-scoped paths, транзакции, память, романтический контекст и визуальный каталог сохранены.

## Задержка ответа
- Проверка существующего ответа и чтение состояния теперь параллельны.
- Запись пользовательского сообщения, поиск памяти и при необходимости обновление истории также выполняются параллельно. Генерация начинается только после успешного завершения всех обязательных операций.
- Лимиты retrieval не уменьшены: 450 последних и 180 важных воспоминаний, 320 активных фактов, 160 открытых тем; после ранжирования — прежние 8/6/4. История Gemini остаётся 20 непустых реплик. Ошибка чтения памяти не превращается в пустой контекст.
- App Check прогревается без блокировки открытия чата. Параллельные проверки используют один текущий запрос токена; SDK продолжает управлять токенами. Защита не отключается, ошибки не игнорируются при вызове Gemini.
- Проверенный ответ показывается до ожидания подтверждения сохранения, с прежней пометкой о несохранённом тексте. Заблокированные решения не стримятся до проверки смысла.
- Увеличены верхние лимиты output tokens, чтобы русские ответы реже обрывались и не требовали полного повторного запроса. Длина ответа по плану и guard остаётся прежней. Минимальный thinking сохранён.
- В настройках доступны измерения до первого текста, подготовки контекста, формулировки, сохранения и всего хода. В основной чат техническая диагностика не добавляется.
- Тайм-ауты защиты от зависания не выдаются за нормальную скорость: Gemini до 25 секунд, весь ход до 40 секунд. Не обещаем фиксированную скорость внешнего сервиса.

## Исправления
- Remote revision, пришедшая во время отправки, не теряется: после её завершения клиент догоняет новое состояние. Входящая синхронизация не перезаписывает активный ход.
- Live sync учитывает подтверждение записей, включая metadata changes; локальная неподтверждённая запись не считается сохранённым ответом.
- Если ответ уже подтверждён через live sync, поздняя ошибка подтверждения commit не делает сообщение ошибочным. Учтены и скрытые silent replies. Потоковый черновик удаляется при появлении подтверждённого ответа.
- При обновлении состояния сохраняются ожидающие записи неизменяемых событий мира.
- bounded корректно отклоняет Promise.reject(null/undefined/false/0/""). Выход из Google имеет тайм-аут.
- Новый семантический факт сохраняется до вывода старого из обращения. Повтор после частичного сбоя завершает перевод предыдущих фактов и их воспоминаний в outdated, не теряя evidence.
- Переработка раннего источника уже подтверждённого позднее факта больше не делает этот же факт устаревшим со ссылкой на самого себя.
- Возраст снижает retrieval strength, но сам по себе не исключает запись из релевантного поиска. Явные outdated и существующая политика ограничения короткой памяти сохранены; raw events не удаляются.
- Фоновая обработка памяти идёт порциями по 12 событий с продолжением в простое при наличии очереди. Отправка прерывает фоновые работы; очередь и исторический cursor позволяют продолжить позже. Это размер обработки, а не сокращение памяти.
- Исправлена граница русского слова в проверке отказа, сброс временной эмоции при очистке trace, обработка асинхронной ошибки текстуры и остановка прерванного визуального перехода. Каталог проверяет допустимые значения metadata.

## Измерение
Воспроизводимый локальный сценарий: 80 мс на операцию репозитория, 120 мс на имитацию ответа модели. Сравнивались настоящие runtime v0.7.2 и v0.7.3 с одинаковым фактом и одинаковыми запросами памяти.

| Метрика | v0.7.2 | v0.7.3 |
| --- | ---: | ---: |
| До вызова модели | 330 мс | 167 мс |
| До первого текста | 450 мс | 287 мс |
| До завершения сохранения | 533 мс | 368 мс |

Это синтетический тест сетевого порядка, не замер production Firebase/Gemini и не обещание такого времени пользователю. Raw результаты: LATENCY_BENCHMARK.json.
Запуск текущего варианта: `node tests/benchmark-local.mjs`. Для сравнения задать VC_BASELINE_RUNTIME абсолютным путём к src/engine/runtime.ts распакованной v0.7.2.

## Проверка и пределы
- npm run verify: 87 regression checks, отдельные AI transport checks, TypeScript, Vite build — PASS.
- Transport checks выполняют настоящий gemini-client с подставленным Firebase AI SDK: App Check, память/история, поток, locked decision, лимиты, MAX_TOKENS, 429, отмена.
- Chromium: настоящий Zustand store с транспортными fixtures; deferred revision, поздний commit (включая silent), очистка черновика, смена auth во время отправки — PASS.
- Chromium: романтический цикл и размеры экранов из v0.7.1; переходы изображений, 404 fallback, отмена устаревшей загрузки, reduced motion и возврат к live-photo — PASS.
- Реальный Google Auth/App Check/Firestore/Gemini не проверялся. Сборка не публиковалась. Большой JS chunk остаётся предупреждением сборки.
- Это исправление найденных дефектов, не доказательство отсутствия всех возможных ошибок. Существующие ограничения лексического retrieval и фоновой обработки между несколькими устройствами сохраняются; распределённая блокировка всей консолидации не добавлялась.
- Новых изображений нет. Каталог содержит текущий reference; прежние ограничения романтического модуля и assets описаны в v0.7.1/v0.7.2.

## Обновление
Заменить исходники содержимым папки архива и использовать прежний workflow. Обновить старые открытые вкладки на всех устройствах. public/runtime-config.js, firestore.rules и avatar-main.jpg побайтно сохранены. После обновления проверить обычный разговор и сохранение после перезагрузки; если медленно, открыть настройки и посмотреть разбивку времени.


---

## V0.7.4_DIALOGUE_RELATIONSHIP_FIX.md

# v0.7.4 — Dialogue / Guard / Relationship fix

Первый этап исправлений по аудиту v0.7.3. Архитектура проекта не перестраивалась.

## Исправлено

- Короткие реплики (`Да`, `Давай`, `Почему?`) получают референт из последних реплик персонажа и больше не обязаны уходить в лишнее уточнение.
- Отрицание привязанности (`Я не люблю тебя`) не определяется как affection/warm.
- Оскорбления требуют реального адресата-персонажа: оценка предмета и пересказ чужой реплики не ставят границу от имени персонажа.
- Слова вроде `плохо` не считаются признаком грусти без личной конструкции пользователя.
- Response guard проверяет противоположный смысл, а не только наличие ключевого слова.
- Сырые Gemini chunks больше не публикуются в UI до финального response guard.
- Расширены естественные стоп-фразы романтического контекста; активная сцена переходит в устойчивый `paused`.
- Тёплое общение увеличивает attachment и понемногу восстанавливает security; извинения восстанавливают security/trust и снимают tension.
- Security восстанавливается с течением спокойного времени; пересчёт включён в общий runtime advance.
- Deep relationship stage теперь достижим естественным накоплением положительных взаимодействий.

## Проверки

- `node tests/regression.mjs`: 95/95 PASS.
- `node tests/ai-transport.mjs`: PASS.
- Добавлены регрессионные тесты на все исправления выше.
- Firebase SDK и Gemini в этих тестах подменены. Реальные облачные вызовы этими тестами не подтверждаются.
- Production typecheck/build в текущей среде не подтверждён: `npm ci` не завершился, а глобальный TypeScript не может разрешить отсутствующие typings `vite/client`, `react`, `react-dom`, `node`.

## Следующий этап

Ошибки отправки и восстановления чата: независимое состояние failed-turn, возможность продолжить после неудачного сообщения и надёжный поиск незавершённых пользовательских ходов после перезапуска/между устройствами.


---

## V0.7.5_FAILED_TURN_RECOVERY.md

# v0.7.5 — Failed turn / chat recovery

Второй этап исправлений по аудиту v0.7.3. Общая архитектура runtime/store/repository сохранена.

## Исправлено

- Неудачная реплика больше не блокирует весь composer. После ошибки можно сразу отправлять новые сообщения.
- `failedMessageId` заменён на независимый список `failedMessageIds`, поэтому одновременно могут существовать несколько проблемных ходов.
- У каждого failed user message появились отдельные действия: `Повторить`, `Изменить`, `Пропустить`.
- `Изменить` переносит исходный текст обратно в composer и закрывает recovery старого сообщения; новая отправка получает новый message id.
- `Пропустить` удаляет только recovery marker. Сам immutable user event не удаляется.
- Добавлена коллекция `turnPending`. Marker создаётся вместе с первым `appendEvent` пользовательской реплики.
- Успешный `commitTurn` удаляет `turnPending/{messageId}` в той же Firestore transaction, где сохраняется ответ и новая runtime revision.
- Retry одного и того же immutable user event заново создаёт marker, если предыдущий marker был удалён/прерван.
- Bootstrap больше не делает вывод по последней строке чата. Он читает реальные pending turns и может восстановить старую неотвеченную реплику даже после более новой завершённой пары.
- Pending turn, который оказался старше текущего окна последних сообщений, добавляется в загруженную переписку отдельно и не теряется из-за pagination window.
- Live sync умеет независимо закрыть несколько failed ids, если с другого устройства пришли соответствующие character replies.
- Глобальный error banner больше не является кнопкой повтора единственного failed message; повтор находится возле конкретной реплики.

## Гарантии

1. Сначала сохраняется immutable user event + `turnPending`.
2. Ошибка до `commitTurn` оставляет marker для восстановления.
3. Успешный `commitTurn` атомарно сохраняет ответ/state/world и удаляет marker.
4. Если ответ уже был сохранён другим устройством, retry не вызывает модель повторно и очищает устаревший marker.
5. Ручной skip не удаляет историю пользователя.

## Проверки

- `node tests/regression.mjs`: 102/102 PASS.
- `node tests/ai-transport.mjs`: PASS.
- Добавлены проверки marker lifecycle, восстановления старого unanswered turn, повторного открытия marker при retry, multi-failure live resolution и отсутствия глобальной блокировки новых сообщений.
- Изменённые TS/TSX файлы дополнительно прошли `typescript.transpileModule` без syntax diagnostics.
- Firebase SDK и Gemini в regression tests подменены; live cloud поведение тестами не подтверждено.
- Полный `tsc`/Vite production build в текущей среде не подтверждён, потому что `node_modules` отсутствует (`vite/client` не найден).

## Следующий этап

Целостность памяти и Firestore: гонки knowledge facts, частичное устаревание исходных memories, несколько фактов одного типа в одном сообщении, а также фильтрация/сортировка Firestore до `limit`.


---

## V0.7.6_MEMORY_INTEGRITY.md

# v0.7.6 — Memory integrity / Firestore query correctness

Stage 3 of the fixed seven-stage stabilization plan. This release addresses audit items 11, 12, 15, 17 and 18 without replacing the project architecture.

## Fixed

- Semantic facts are merged through `CompanionRepository.mergeKnowledgeFact()`.
- Firestore uses `knowledgeHeads/{encodedLogicalKey}` as a transaction serialization point. Parallel devices can no longer publish two contradictory active values for one logical key.
- Legacy duplicate active facts are repaired when the key is processed again.
- `MEMORY_PROCESSOR_VERSION` is now 3, so historical events are incrementally reprocessed and old derived-state defects can be repaired. Raw events remain immutable.
- Correcting one semantic fact no longer automatically invalidates the entire source memory. Sentence-level contradicted evidence is removed; unrelated details remain active. A memory that contains only the stale fact is still retired.
- Semantic candidate IDs include the value, so two candidates with the same logical key in one message no longer overwrite the same document. Residence negations are extracted before a positive current residence, so `Я живу в Москве. Я больше не живу в Туле.` leaves Moscow current and Tula historical.
- Firestore `listMemories()` applies status/kind filters before `limit`.
- `listKnowledgeFacts()` orders by `lastConfirmedAt` before `limit`.
- `listOpenThreads()` orders by `lastTouchedAt` before `limit`.
- Added `firestore.indexes.json` for the required composite indexes and documented deployment requirements.

## Regression coverage

108/108 regression checks pass with Firebase/Gemini mocked. AI transport passes. New coverage includes same-message residence correction, partial-memory preservation, parallel fact consolidation, Firestore knowledge-head replacement, query-order assertions and index-file presence.

## Verification limits

The local global `tsc` cannot complete a full project typecheck because dependency typings (`vite/client`, `vite`, `@vitejs/plugin-react`) are not installed in this unpacked environment. Live Firebase transaction contention, real composite-index deployment, authentication, Gemini calls and iPhone behavior still require a real-cloud smoke test.

## Deployment note

Deploy/create the indexes in `firestore.indexes.json` before using v0.7.6 against a persistent production database. Missing indexes should surface as Firestore query errors rather than silently reverting to client-side filtering.

## Next stage

Stage 4/7: audit items 10, 13, 14, 16 and 21 — broad recall, initiative memories, long-message summaries, memory reinforcement, and reducing oversized memory reads without losing recall quality.


---

## V0.7.7_MEMORY_RETRIEVAL.md

# v0.7.7 — Memory retrieval quality and latency

Stage 4/7 of the stabilization plan.

## Fixed original audit items

- #10 broad recall (`Что ты помнишь?`) no longer depends on impossible lexical thresholds.
- #13 proactive `character_action` messages now consolidate into durable memory.
- #14 long messages are compacted from the whole text, preserving salient tail information instead of storing only the first 220/320 chars.
- #16 retrieved memories are reinforced after a successfully committed turn.
- #21 normal memory context reads are reduced from the previous potential 1110-document candidate budget to a bounded targeted first pass with fallback only when needed.

## Retrieval design

Common path:
- recent active memories: 72
- important active memories: 36
- topic-targeted memories: up to 48 only when the query has usable topic words
- active facts: 72
- exact known fact keys: up to 4/key
- open threads: 36

Expanded reads are conditional and only run when a topic-bearing specific query finds no relevant candidate. Broad recall uses its own ranking and does not pay the old zero-overlap penalty.

## Reinforcement

`CompanionRepository.reinforceMemories()` was added to both repositories. Firestore performs the read-modify-write inside a transaction. Runtime starts reinforcement only after the conversational turn has committed, and does not await it on the response critical path.

## Reprocessing

`MEMORY_PROCESSOR_VERSION = 4`. Existing immutable events can be incrementally reprocessed so old proactive actions become memories and derived summaries use the new compaction logic. Reinforcement metadata is preserved by the existing consolidation logic.

## Firestore

Added the `memories(status, topics CONTAINS, updatedAt DESC)` composite index. Topic lookup is treated as an accelerator: if the index is still building, the bounded recent/important windows continue to work.

## Verification

- Regression: 113/113 PASS.
- AI transport: PASS.
- Firebase/Gemini are mocked in regression tests; no live-cloud verification performed here.
- `tsc` / Vite production build could not be re-confirmed in this environment because `node_modules` is absent and the Vite typings are therefore unavailable.

## Remaining stabilization stages

5/7: background processing + autonomous initiative lifecycle (#19, #20, #25, #26, #27).
6/7: live sync + UI recovery (#24, #28, #29, #30).
7/7: final full audit, regression, two-device/live Firebase smoke and production stabilization.


---

## V0.7.8_BACKGROUND_AUTONOMY.md

# v0.7.8 — Background processing and autonomous initiative lifecycle

Stage 5/7 of the stabilization plan.

## Fixed original audit items

- #19 memory/background maintenance is no longer aborted by every user send.
- #20 maintenance failures automatically retry with bounded exponential-style backoff and focus/online recovery.
- #25 initiative messages are no longer effectively startup-only; pending initiatives schedule their own future wake-up while the app remains open.
- #26 proactive messages cannot be published while the character is sleeping.
- #27 world time and transient romance state continue to reconcile while an open visible app is otherwise idle.

## Maintenance lifecycle

`store.ts` now separates two jobs that used to share one AbortController:

1. durable memory/background maintenance;
2. optional proactive initiative generation.

Starting a real user turn cancels only the initiative timer/generation. It does **not** abort an already running memory consolidation pass. If maintenance is already running, later work is queued and re-run after the current pass.

A failed background pass now schedules another attempt with these delays:

- 5 s
- 15 s
- 30 s
- 60 s
- 120 s cap

A focus/visibility return or browser `online` event resets the retry delay and requests an immediate maintenance pass. Failed user turns also schedule maintenance because their immutable user event may already exist and still needs consolidation.

## Initiative lifecycle

New `src/app/maintenance-policy.ts` owns timer policy.

- pending `notBefore` is respected;
- no proactive message is allowed inside the 10-minute post-user quiet window;
- sleeping periods are skipped to the next awake routine slot;
- when no initiative is pending, the app schedules future reevaluation at meaningful elapsed-time thresholds, then at most hourly while left open;
- if a real user message starts while Gemini is preparing a proactive message, only the initiative generation is aborted/suppressed; memory work continues;
- immediately before the proactive event is appended, runtime rechecks current user activity, initiative lifetime and awake/sleep availability.

A surfaced initiative is marked surfaced in both persistence and the in-memory maintenance result so the timer does not immediately reschedule the same candidate.

## Time progression

`App.tsx` runs a visible-app local clock tick every 60 seconds via `reconcileWorld(false)`.

This updates time-dependent world/emotion/relationship/romance state without forcing a Firestore maintenance write every minute. Focus, visibility-return and online events use `reconcileWorld(true)` and also request cloud maintenance.

This means a 30-minute transient romance phase can expire while the user simply leaves the chat open, and sleeping/awake routine state no longer waits for another click or message.

This is still an **open-app** lifecycle. True messages while iOS has fully suspended/terminated the app require a backend/push-notification architecture and are outside this stabilization item.

## Verification

- Regression: 120/120 PASS.
- AI transport: PASS.
- 66 TS/TSX files: syntax transpilation PASS, 0 syntax errors.
- Added regression coverage for romance expiry during passive reconciliation, retry backoff policy, quiet-window initiative scheduling, sleep deferral, no proactive publish while asleep, and suppression by a newly started user turn.
- Firebase/Gemini remain mocked in regression tests; no live-cloud/iPhone verification was performed here.
- A fresh `npm ci` was attempted but dependency download timed out in this environment. Partial `node_modules` is removed before packaging, so `npm run typecheck` and Vite production build are not claimed locally.

## Remaining stabilization stages

6/7: live sync + UI recovery (#24, #28, #29, #30).

7/7: final full audit and stabilization: re-check all 30 original findings, complete regression review, production build where dependencies are available, and live/two-device/iPhone smoke tests where the environment permits them.


---

## V0.7.9_LIVE_SYNC_UI.md

# v0.7.9 — Live sync and UI recovery

Stage 6/7 of the stabilization plan.

## Fixed original audit items

- #24 live sync no longer loses the middle of a long offline history gap.
- #28 the chat draft survives switching away from ChatScreen and back.
- #29 incoming messages no longer force a reader who is viewing older history to the bottom.
- #30 the initially selected character image now participates in preload failure/retry handling.

## Live-sync continuity

`src/storage/live-sync.ts` now has two complementary paths:

1. a realtime listener limited to conversation event types (`message`, `character_action`) **before** the 300-document limit;
2. an ascending catch-up cursor that starts after the newest conversation event already present when the subscription begins.

The bounded realtime snapshot is never allowed to advance the contiguous catch-up cursor. After a reconnect/snapshot, catch-up pages forward in batches until there are no more conversation events. This prevents a >300-message offline gap from leaving an invisible hole between old local history and the newest listener window.

World/system records no longer occupy the realtime conversation window. Firestore composite indexes for `events.type + timestamp + __name__` are included in both ascending and descending directions.

## Draft persistence across tabs

The chat draft moved from local `ChatScreen` React state into Zustand `AppStore` as `chatDraft` + `setChatDraft`.

Unmounting ChatScreen to open Settings/Together/Look/Room therefore does not discard unfinished text. Drafts are cleared on account/session reset/sign-out, not on ordinary tab navigation.

## Scroll behavior

`ChatScreen` tracks whether the user is within 72 px of the bottom.

- If the reader is already near the bottom, new messages continue to auto-follow.
- If the reader is viewing older history, incoming messages/streamed text do not move the viewport.
- A `Новые сообщения ↓` control appears instead and explicitly returns to the bottom.
- Loading older history still preserves the previous visual scroll position.

## Initial asset retry

`AssetScene` no longer bypasses preload validation when the requested asset is already the initially displayed asset.

The initial image now:

- runs through the same preload/decode/timeout path as later images;
- sets the visible retry state on load failure;
- retries on button press;
- remounts the actual image layer after a successful retry so a browser does not remain stuck on an already-failed `<img>` instance.

## Verification

- Regression: 125/125 PASS.
- AI transport: PASS.
- Added checks for conversation filtering before live-sync limit, forward catch-up cursor, store-backed draft, guarded autoscroll/new-message control, initial asset preload/retry and required Firestore event indexes.
- TypeScript syntax transpilation is run across the source tree before packaging.
- Firebase/Gemini remain mocked in regression tests; no live cloud/two-device/iPhone verification was performed in this stage.
- Dependency-backed `tsc -b` / Vite build are not claimed locally because this archive does not contain installed dependencies; the available global TypeScript reports missing Vite package typings first.

## Remaining stabilization stage

7/7 only: final full audit and stabilization. Re-check all 30 original findings against the current implementation, run the full regression/AI transport suites, inspect for regressions/dead code introduced across stages 1–6, and perform production/live/two-device/iPhone checks wherever the environment permits.


---

## V0.8.0_FINAL_STABILIZATION.md

# v0.8.0 — Final stabilization

Stage 7/7 of the stabilization plan. The seven-stage cycle is complete; no additional stage is planned for the 30-item audit.

## Final result

All 30 originally reported defects were re-checked against the current implementation after stages 1–6. Each item now has a code-level fix plus regression coverage or a directly inspected invariant. The full mocked regression suite passes 126/126 and the separate AI transport suite passes.

The final audit also found one related scalability issue outside the original list: manual loading of older chat history still queried the general `events` stream and filtered world events client-side. On a long-lived character this could scan thousands of unrelated world records between messages. `FirestoreCompanionRepository.listConversationEvents()` now applies `where("type", "in", ["message", "character_action"])` before the page limit, using the same indexed conversation-only strategy as live sync. The arbitrary 30-batch scan cap was removed.

## Original audit closure — 30/30

### Dialogue, response guard and relationship

1. **Short contextual replies** — fixed: `localPerception()` receives recent dialogue and lowers ambiguity when a short reply refers to the immediately preceding character turn.
2. **Negated affection** — fixed: explicit affection-negation is checked before warmth/affection classification.
3. **Insult target** — fixed: personal-insult detection distinguishes direct address from quoted/reported speech and object evaluation.
4. **Object evaluation vs user emotion** — fixed: sadness requires personal constructions such as `мне плохо`; a topic being `плохо` is not enough.
5. **Guard accepting opposite meaning** — fixed: refusal/agreement/disagreement/boundary decisions have contradiction checks in addition to keyword checks.
6. **Unguarded generated text visible before validation** — fixed: raw provider chunks are not surfaced; only the final guarded reply is published.
7. **Natural stop phrases fail to pause romance** — fixed: common stop formulations persistently enter `paused`, with explicit resume required.
8. **Deep relationship stage unreachable** — fixed: attachment now grows during warm interaction and the weighted relationship state can cross the deep threshold naturally.
9. **Security never recovers** — fixed: security recovers through warm interaction, apologies and calm elapsed time.

### Memory

10. **General recall query returns nothing** — fixed: broad recall uses a dedicated ranking path without the old lexical-overlap threshold.
11. **Concurrent fact updates create multiple active truths** — fixed: Firestore `knowledgeHeads` serialize merge decisions transactionally per logical key.
12. **Replacing one fact retires the whole source memory** — fixed: the obsolete fact sentence is removed from the source memory while unrelated details remain searchable.
13. **Character initiatives do not become long-term memory** — fixed: `character_action` from the character participates in memory consolidation.
14. **Long messages remember only the beginning** — fixed: memory compaction samples/scans the whole message and preserves important/tail sentences rather than raw prefix truncation.
15. **Two facts of one type overwrite each other** — fixed: fact IDs include value identity and same-message residence correction/current residence are processed independently with deterministic precedence.
16. **Memory reinforcement unused** — fixed: retrieved memories are reinforced after a successfully committed turn, outside response latency.

### Firestore reads and background processing

17. **Archived memories crowd active records out before filtering** — fixed: status/kind/topic filters are Firestore query constraints before `limit`.
18. **Facts/threads limited before relevance recency order** — fixed: Firestore orders by `lastConfirmedAt` / `lastTouchedAt` before `limit`; required indexes ship with the project.
19. **Conversation repeatedly interrupts memory maintenance** — fixed: user activity cancels initiative generation only; memory maintenance continues/queues independently.
20. **Background processing has no automatic retry** — fixed: retry uses bounded exponential-style backoff and focus/online recovery triggers immediate work.
21. **Every response reads an excessive memory window** — fixed: normal retrieval uses small recent/important/keyed/topic windows, expanding only when targeted retrieval misses.

### Failed turns and recovery

22. **One failed request blocks the whole chat** — fixed: failures are tracked per message ID; unrelated new sends remain possible, with retry/edit/skip per failed turn.
23. **Restart only recovers the latest unanswered message** — fixed: explicit Firestore `turnPending` markers are created with user events and atomically cleared by successful `commitTurn`.

### Live synchronization and character autonomy

24. **Large offline history gaps are not closed** — fixed: realtime subscription is conversation-only and a separate ascending contiguous catch-up cursor drains every missing page after reconnect/start.
25. **Initiatives effectively run only at startup** — fixed: initiative deadlines schedule timers while the app stays open.
26. **Character can proactively write while asleep** — fixed: awake/availability gates are checked before generation and immediately before publication.
27. **World/romance do not advance while the open app is idle** — fixed: visible app performs a local minute reconciliation; focus/online additionally run cloud maintenance.

### UI

28. **Draft disappears on tab change** — fixed: chat draft lives in Zustand instead of `ChatScreen` local component state.
29. **Incoming messages force scroll to bottom** — fixed: auto-follow occurs only near the bottom; otherwise a `Новые сообщения ↓` control appears and older-history loading preserves viewport position.
30. **Initial asset failure cannot be retried** — fixed: the initially displayed asset goes through preload/decode/error state and successful retry remounts the image layer.

## Extra final hardening

`FirestoreCompanionRepository.listConversationEvents()` now filters `message`/`character_action` before pagination. This removes world-event amplification from manual history loading and makes the cloud repository match the in-memory repository and live-sync semantics.

Generated TypeScript build-info files and partial `node_modules` from failed dependency installation are excluded from the final archive, so the next real build starts cleanly.

## Verification performed

- `npm test`: **126/126 regression PASS** with Firebase/Gemini mocked.
- AI transport: **PASS** (App Check transport contract, history/memory payload, guarded streaming path, token/truncation/quota/cancellation checks).
- `tests/benchmark-local.mjs`: PASS; normal retrieval stays on the bounded small-window path in the benchmark.
- TypeScript syntax transpilation using the installed global TypeScript parser: **66/66 TS/TSX files, 0 syntax errors**.
- Relative source-import audit: **0 missing relative imports**.
- Firestore index file includes all composite indexes introduced by the memory and conversation-query fixes.
- ZIP integrity and SHA-256 manifest are regenerated after packaging.

## Verification not claimed

A dependency-backed `npm ci -> npm run typecheck -> npm run build` could not be completed in this environment because dependency installation timed out and the required package typings are not locally installed. Running global `tsc -b` therefore stops on missing `vite/client`, `react`, `react-dom` and Node type definitions rather than reaching an application typecheck.

Regression tests use mocked Firebase/Gemini. This final audit therefore does **not** claim a real Firebase/Auth/App Check/Gemini request, true two-device cloud race test, or physical-iPhone smoke test. Those remain deployment smoke checks, not an eighth code-repair stage.


---

## V0.8.0_POST_DEPLOY_FIXES.md

# v0.8.0 post-deploy fixes

This archive includes the fixes applied after the initial v0.8.0 stabilization:

- removed the invalid `package-lock.json` that referenced a non-existent `@grpc/proto-loader` version;
- fixed Firestore live-sync query constraint typing with `QueryConstraint[]`;
- changed Gemini thinking level from `MINIMAL` to `LOW` for `gemini-3.8-flash`;
- kept the current GitHub Pages deploy workflow;
- Firestore composite indexes remain defined in `firestore.indexes.json`.

Engine version remains `0.8.0`.


---

## V0.9.0_LOCAL_BRAIN.md

# Virtual Companion / Yuzuki v0.9.0 — Local Brain

## 1. Старая цепочка генерации ответа

До v0.9.0 основной turn проходил через существующие локальные cognition/state слои, но финальный текст обычной и автономной реплики зависел от Gemini:

`Chat UI -> store.send/sendTurn -> engine.handleUserMessage -> pending turn -> memory retrieval -> local perception / Character Brain -> decision -> response plan -> romance/appearance -> Gemini text renderer -> response guard -> character event -> commitTurn(state + world + events) -> Firestore/live-sync -> UI`

В проекте уже существовали локальные perception/decision/relationship/emotion/memory механизмы. Поэтому Character Brain, память, relationship, pending turns, Firestore repositories, live-sync и background autonomy не переписывались.

## 2. Новая цепочка

Обычный ответ:

`USER -> Local NLU -> existing Character Brain -> semantic CharacterResponsePlan/dialogue acts -> LocalDialogueRenderer -> response guard -> existing event/persistence/live-sync path -> UI`

Автономная реплика:

`existing Initiative Engine -> autonomy bridge -> semantic response plan -> LocalDialogueRenderer -> character_action -> existing persistence/live-sync path`

Gemini больше не участвует в обязательном response path.

## 3. Изменённые существующие файлы

- `src/engine/runtime.ts` — основной turn и autonomy переключены на Local Dialogue Engine; сохраняются optional localDialogue metadata для continuity/repetition.
- `src/cognition/local-cognition.ts` — локальное восприятие расширено для корректной связи с Local NLU/контекстом без изменения ownership Character Brain.
- `src/app/store.ts` — адаптация runtime metadata/turn handling под новый renderer boundary.
- `src/ui/screens/SettingsScreen.tsx` — Gemini больше не отображается как обязательный backend чата; показывается Local Dialogue Engine/Firebase infrastructure.
- `src/config/version.ts` — engine version `0.9.0`; persistence schema остаётся backward-compatible.
- `public/runtime-config.js` / `.env.example` — Gemini config больше не требуется для normal chat.
- `README.md` и архитектурная документация — обновлена схема Local Brain.
- `tests/regression.mjs` — старые ожидания обязательного Gemini заменены проверками независимого local path; сохранены regression checks persistence/memory/live-sync/relationship.
- `.github/workflows/deploy.yml` — добавлены test/typecheck gates перед build/deploy.

## 4. Новые файлы

Основной модуль: `src/local-dialogue/`

- `types.ts` — контракты NLU, DialogueContext, CharacterResponsePlan, ResponseRenderer, RenderedResponse.
- `index.ts` — публичный API local dialogue layer.
- `language-pack.ts` — runtime validation русских JSON-паков.
- `debug-trace.ts` — development trace.
- `nlu/*` — normalize/tokenize/intent/topic/sentiment/question/entities/context adapter.
- `planner/*` — dialogue acts, context builder, user-turn planner, autonomy bridge/fallback planner.
- `renderer/*` — LocalDialogueRenderer, template selection, slots, composition, variation and post-processing.
- `continuity/*` — DialogueFrame, topic continuity, reference resolution.
- `repetition/*` — cooldown/history/text-similarity scoring.
- `random/seeded-random.ts` — deterministic seedable RNG.
- `language/ru/*.json` — intents, concepts, topics, templates, reactions, vocabulary, connectors, fallbacks.
- `tests/local-dialogue.mjs` — отдельные NLU/renderer/context/stress tests.
- `YUZUKI_VOICE.md` — единый voice/style guide.
- `docs/LOCAL_DIALOGUE_ENGINE.md` — документация движка.
- `.github/workflows/ci.yml` — verify workflow.

## 5. Где находится Local NLU

`src/local-dialogue/nlu/`

Основная точка: `nlu/nlu.ts`.

Используются normalization, phrase/token/regex matching, priorities, negative patterns, negation, concepts, sentiment, topic, question type, entities и ограниченный recent context. Remote AI/embeddings не используются.

Русский initial pack содержит 60 intent definitions и 53 concept definitions.

## 6. Где находится Dialogue Planner

`src/local-dialogue/planner/`

Planner не пересчитывает чувства/отношения. Он адаптирует уже рассчитанные `CharacterDecision` + `ResponsePlan` + state/context в semantic `CharacterResponsePlan` и набор Dialogue Acts.

## 7. Где находятся templates

`src/local-dialogue/language/ru/templates.json`

Стартовый набор: 53 template groups плюс reusable reaction fragments/vocabulary/fallbacks. Каждый JSON pack имеет `schemaVersion: 1`.

## 8. Где находится anti-repetition

`src/local-dialogue/repetition/`

Защита состоит из:

- template cooldown;
- recent template IDs;
- recent openings/dialogue acts;
- similarity по словам, bigrams, trigrams, одинаковым началу/окончанию;
- penalty вместо прямого случайного выбора;
- seedable RNG.

## 9. Как используется memory

Используется существующий `MemoryContext` и текущий retrieval pipeline. Local Dialogue Engine не создаёт второй memory store и не использует embeddings.

Renderer имеет право сослаться только на переданную реальную memory/fact. Если memory record отсутствует, он не утверждает, что Yuzuki это помнит.

Firestore paths, memory IDs и старые documents не мигрировались destructively.

## 10. Как используется Character Brain

Character Brain остаётся источником истины для:

- emotion;
- relationship;
- energy;
- boundaries;
- romance;
- answer/silence/refuse/change-topic decisions;
- tone;
- response length;
- follow-up intent;
- semantic content/locked preferences.

Local renderer только превращает это решение в речь.

## 11. Что произошло с Gemini integration

`src/ai/gemini-client.ts` и `src/ai/perception-client.ts` оставлены изолированными legacy/optional adapters.

`src/engine/runtime.ts` их не импортирует для normal conversation или autonomous message generation.

Отсутствие API key, quota 429 или недоступность Gemini больше не блокирует чат. Это отдельно проверяется regression test.

## 12. Как позже подключить LLM renderer обратно

Использовать существующий `ResponseRenderer` boundary:

`Character Brain -> semantic CharacterResponsePlan -> LocalDialogueRenderer -> optional LLM polishing -> response guard -> persistence`

LLM должен быть optional. При timeout/quota/error используется уже готовая local response. Переписывать Character Brain не требуется.

## 13. Выполненные тесты

`npm test` проходит полностью в текущем source archive:

- **126 regression checks**: persistence, migrations, memory, Character Brain, relationship, emotion, pending turns, retry, background autonomy, romance, appearance, Firestore contracts, live-sync, two-device style merge behavior и другие существующие инварианты.
- **17 Local Dialogue test groups**.
- **116 canonical NLU scenarios**.
- negation cases (`я устал/не устал`, positive/negative desire/evaluation/state);
- contextual follow-ups (`А почему?`, `А какие?`, `Не хочу туда`);
- memory grounding;
- relationship/emotion dependent rendering;
- unknown/external-knowledge safe fallbacks;
- 20x repetition stress;
- deterministic seeded selection;
- **400-turn long conversation stress**;
- isolated AI transport adapter test remains green but is outside normal chat path.

Measured local NLU -> planner -> renderer average in the final stress run: about **16 ms/turn** in this Node test environment.

## 14. Build / typecheck status

- `npm test`: **PASS**.
- `npm run typecheck`: cannot be completed inside the current execution container because the uploaded source archive contains no `node_modules` and no lockfile, and the environment could not fetch npm dependencies. The observed errors are missing external Vite type/module declarations (`vite/client`, `vite`, `@vitejs/plugin-react`), not Local Brain runtime test failures.
- `npm run build`: for the same dependency-install reason, a real Vite production build was not reproducible in this container.

Both CI/deploy workflows now run test -> typecheck -> build once dependencies are available in GitHub/npm environment.

## 15. Ограничения первой версии Local Brain

- Это намеренно не универсальная LLM: внешние factual/encyclopedic questions получают character-style limitation fallback.
- Русский pack покрывает основные бытовые сценарии, но редкие формулировки будут иногда уходить в clarification/fallback.
- Сложные дальние местоименные ссылки и неоднозначная семантика ограничены bounded recent context.
- Variability зависит от объёма language pack; дальнейшее качество прежде всего растёт через новые JSON intents/templates/reactions + scenario tests.
- English pack архитектурно поддерживается, но полноценный `en` content пока не добавлен.

## Backward compatibility

Не введены destructive migrations для Firestore paths, user/character IDs, event IDs, revisions, pending-turn markers, timestamps или memory IDs. Новые `localDialogue` metadata в event payload optional; старые события без них продолжают читаться.

## Итог

v0.9.0 делает Local Brain постоянным базовым языковым слоем Yuzuki. Firebase остаётся persistence/sync backend, Character Brain остаётся мозгом, а внешний LLM в будущем может быть только необязательным polishing/provider слоем.


---

## V0.9.1_BUILD_FIX.md

# v0.9.1 — GitHub Pages build fix

The v0.9.0 source correctly removed Gemini from the normal runtime response path, but the GitHub Pages deployment failed during TypeScript compilation.

GitHub Actions error:

`src/local-dialogue/language-pack.ts(72,27): TS18046: regex is of type unknown`

Fix:
- replaced aggregate `.every(stringArray)` validation with explicit type guards for each pattern array so TypeScript narrows `regex` to `string[]`;
- no dialogue behavior, Firebase paths, memory, relationship, pending turns, live-sync or Character Brain logic changed;
- Gemini remains isolated under `src/ai/` and is not imported by `src/engine/runtime.ts`.

Verification after patch:
- `npm test`: 126 regression checks PASS; 17 Local Dialogue groups PASS; 116 canonical NLU scenarios PASS; 400-turn stress PASS; AI transport legacy adapter test PASS.
- Full local Vite build cannot be executed in this container because dependency installation is unavailable here. The patch directly addresses the sole TypeScript error reported by the real GitHub Actions build.


---

## SNAPSHOT.txt

```text
Virtual Companion v0.8.0

Read V0.8.0_FINAL_STABILIZATION.md first.
Stabilization stages 1-7 are complete. Original audit closure: 30/30.
Regression: 126/126 PASS. AI transport: PASS. TS/TSX syntax: 66/66 PASS.
Dependency-backed production build and live Firebase/Gemini/two-device/iPhone smoke tests are not claimed in this environment.
```


---

## LATENCY_BENCHMARK.json

```json
{
  "conditions": "80ms per repository operation, 120ms mocked model, same fact and retrieval budgets",
  "baseline": null,
  "improved": {
    "label": "v0.8.0",
    "beforeModelMs": 174,
    "firstTextMs": 296,
    "totalMs": 378,
    "reads": [
      [
        "listMemories",
        {
          "statuses": [
            "active"
          ],
          "limit": 72,
          "sortBy": "updatedAt",
          "direction": "desc"
        }
      ],
      [
        "listMemories",
        {
          "statuses": [
            "active"
          ],
          "limit": 36,
          "sortBy": "importance",
          "direction": "desc"
        }
      ],
      [
        "listKnowledgeFacts",
        {
          "statuses": [
            "active"
          ],
          "limit": 72
        }
      ],
      [
        "listOpenThreads",
        {
          "statuses": [
            "open"
          ],
          "limit": 36
        }
      ]
    ]
  }
}
```
