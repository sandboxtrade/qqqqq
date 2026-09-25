Yuzuki v0.16.0 — tomorrow-plan intent fix

Назначение:
Исправляет короткие естественные вопросы про планы/идеи на завтра, например:
- «какие на завтра идеи»
- «какие идеи на завтра»
- «есть идеи на завтра?»
- «что по планам на завтра?»

До исправления «какие на завтра идеи» определялось как questionType=what, но intent оставался unknown, поэтому Local Brain уходил в CLARIFY/контекст предыдущей реплики. Cloud language layer мог только перефразировать уже неверный localDraft.

После исправления:
- intent = ask_for_opinion
- topic = plans
- confidence >= 0.86
- broad perception = question
- decision content mode = factual, locked=false
- planner формирует содержательный ответ про варианты на завтра
- затем обычный Cloudflare/OpenAI language layer может его переформулировать

Установка:
Скопировать содержимое архива поверх корня sandboxtrade/qqqqq с заменой файлов.

Проверки:
- Local Dialogue: 74 groups PASS
- Canonical NLU: 120 PASS
- 400-turn stress: PASS
- Regression: 170 PASS
- Cloud language transport: PASS
- AI transport: PASS
