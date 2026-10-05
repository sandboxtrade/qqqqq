# Repository cleanup audit — v0.20.44

This list was produced from the reconstructed full project (`v0.20.36` + patches through `v0.20.43`) and checked against both the production entry graph (`src/main.tsx`) and every test in the current `npm test` script.

## Delete now
These files are not reachable from production and are not used/read by the current npm test suite:

- `src/ai/perception-client.ts`
- `src/config/state-effects.ts`
- `src/ui/SecondaryScreens.tsx`
- `tests/__tmp_regression.mjs`
- `amused.1.1.PNG` — zero-byte root file, not the real scene asset
- `__external-stubs.d.ts` — old offline audit stub
- `tsconfig.socialcheck.json` — old offline audit config
- any committed `*.tsbuildinfo` — generated compiler cache

Deleting these does not require a schema migration or Cloudflare change.

## Optional history cleanup
Runtime does not read the old handoff/release/patch documents. If Git history is enough for you, the repository root can be simplified by deleting old:

- `RELEASE_v0.20.*.md` except the current release note
- `PATCH_README*.txt`
- `COMBINED_PATCH_README*.txt`
- `FULL_ARCHIVE_NOTES*.txt`
- `START_MESSAGE_NEW_CHAT*.txt`
- `FILELIST*.txt`
- `UPDATED_FILES_v0.20.*.txt` except the current update list
- `DELETE_CANDIDATES_v0.20.32.txt`
- duplicate `README.txt` (keep `README.md`)

These are documentation only.

## Production-unreachable legacy source — leave for now
The following stack is NOT imported from `src/main.tsx`, so it does not participate in current dialogue/runtime, but parts of the current regression suite still intentionally import or inspect it. Do not delete piecemeal unless the matching legacy tests are removed/refactored in the same commit:

- `src/ai/gemini-client.ts`
- `src/avatar/AssetScene.tsx`
- `src/avatar/LivePhoto.tsx`
- `src/cognition/local-cognition.ts`
- `src/cognition/state-effects.ts`
- `src/dialogue/dialogue.ts`
- `src/local-dialogue/**`
- `src/memory/memory-consolidation.ts`
- `src/memory/retrieval.ts`
- `src/memory/semantic-extraction.ts`
- `src/ui/CharacterStage.tsx`

This legacy stack is dead for production but still test-coupled. A dedicated later cleanup can remove it together with obsolete v0.19/v0.20 legacy assertions. Doing that inside the current stability patch would reduce test coverage and make regressions harder to detect.

## Dependency reproducibility
`package-lock.json` is absent. GitHub Actions therefore resolves transitive dependencies on every deploy via `npm install`. This is not an active runtime bug, but it is a reproducibility risk. Generate a real lockfile with the project's Node 22/npm environment and commit it; then switch CI to `npm ci`.
