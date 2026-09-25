Yuzuki — dialogue coherence + Cloud context fix
Base: current sandboxtrade/qqqqq after Cloudflare runtime + tomorrow-intent + naturalness fixes.

WHAT THIS FIXES
- Short contextual questions such as "Точно?", "Правда?", "Серьезно?", "Реально?", "Ты уверена?" now bind to Yuzuki's immediately previous reply instead of creating a new unrelated opinion.
- Local fallback remains coherent even if Cloudflare/OpenAI is unavailable.
- GPT now receives an explicit hard decision contract (action/mode/stance/summary/locked), semantic interpretation and dialogue continuity.
- GPT receives up to 6 recent turns plus up to 3 retrospectively recovered lines, while the server keeps a 3000-character hard packet cap.
- localDraft is now a fallback wording candidate. GPT may repair broken surface coherence, but cannot change Local Brain state/stance/boundaries/memory.
- Short contextual questions are no longer skipped merely because they resemble short_yes/acknowledgement.
- Immediate dialogue context has priority in packet compaction.

INSTALL
1) Copy src/ and tests/ over the same paths in sandboxtrade/qqqqq, replacing files.
2) GitHub Pages must finish deploying.
3) cloudflare/worker.js is NOT deployed by GitHub Pages. Open Cloudflare -> shy-unit-ebfb -> Edit code -> worker.js, replace the Worker code with cloudflare/worker.js from this patch, then Deploy.
4) Do not change OPENAI_API_KEY secret.

CONTROL TEST
User: Ты злая
Yuzuki: Нет, я сейчас не злюсь.
User: Точно?
Expected meaning: confirmation of the previous statement (for example: "Да, точно. Я сейчас не злюсь."), never generic "Ага, поняла" or an unrelated opinion.

VERIFICATION RUN HERE
- node --check cloudflare/worker.js: PASS
- tests/cloud-language.mjs: PASS
- tests/ai-transport.mjs: PASS
- tests/regression.mjs: 170 checks PASS
- tests/local-dialogue.mjs: 75 groups PASS, 120 canonical NLU PASS, 400-turn stress PASS
- Full tsc/build was not runnable in this isolated folder because node_modules (vite/client, vite, @vitejs/plugin-react) are not installed. No TypeScript compiler errors from project code were observed because dependency resolution stopped first.
