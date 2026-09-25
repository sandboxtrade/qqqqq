Yuzuki language naturalness fix

Что меняется:
1. Locked-ответы больше не обходят облачный языковой слой автоматически.
   Local Brain по-прежнему решает смысл, позицию, память, границы и отношения.
2. Cloudflare Worker больше не отклоняет locked=true до OpenAI.
3. Финальный Local Guard в приложении остаётся обязательным и откатывает ответ к localDraft,
   если облачная формулировка меняет смысл/позицию.
4. Промпт языкового слоя переработан: localDraft теперь считается смысловым черновиком,
   а не текстом для почти дословного перефразирования.
5. Голос синхронизирован с YUZUKI_VOICE.md: живой современный русский, 1-2 коротких предложения,
   без ассистентского/психологического/канцелярского тона и без обязательного вопроса в конце.
6. High-intimacy и silent-turns остаются полностью локальными.

Установка:
A) GitHub repo sandboxtrade/qqqqq:
   заменить src/ai/cloud-language.ts файлом из архива.

B) Cloudflare Worker shy-unit-ebfb:
   Edit code -> worker.js -> Ctrl+A -> вставить cloudflare/worker.js из архива -> Deploy.
   OPENAI_API_KEY не менять.

Проверка:
- Открыть приложение после GitHub Pages deploy.
- F12 -> Network -> фильтр yuzukiSpeak.
- Отправить обычное содержательное сообщение.
- В Response должно быть text + model + usage, а ответ в чате должен звучать свободнее localDraft.

Локальные проверки перед упаковкой:
- node --check cloudflare/worker.js: PASS
- tests/cloud-language.mjs: PASS
- tests/ai-transport.mjs: PASS
- tests/regression.mjs: 170 PASS
