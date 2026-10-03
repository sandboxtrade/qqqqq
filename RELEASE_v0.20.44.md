# v0.20.44 — full regression + repository cleanup audit

Base: cumulative over v0.20.37–v0.20.43. `SCHEMA_VERSION` remains 4.

## Fixed
- Repaired `tests/regression.mjs` after the Firebase/App Check and timeout changes. Its dependency-free mocks were missing `firebase/auth` and newer Firebase exports, so the suite could fail before exercising the application.
- Updated stale regression assertions that still expected the old `4s / 12s / 9.5s` token/Worker/OpenAI limits. Current contract remains `18s token preparation / 40s client Worker request / 25s Worker OpenAI request`.
- Updated stale prompt-text assertions so regression checks the current semantic rule instead of old exact wording.
- Repaired `tests/benchmark-local.mjs` mocks so the optional local benchmark runs again with the modern cloud-photo/App Check imports.
- Updated the Alia/version regression check to `ENGINE_VERSION=0.20.44`.

## Verified
- Full `npm test` passes in the reconstructed cumulative tree.
- `218` regression checks pass.
- Local dialogue: `79` groups, `120` canonical NLU scenarios and the `400`-turn stress run pass.
- Cloud transport, App Check, Firebase stability, photo routing, no-refusal, personality diversity and photo prompt quality suites pass.
- Optional `tests/benchmark-local.mjs` runs successfully again.
- Worker syntax check passes.

## Cleanup audit
Production import-graph and npm-test graph were checked separately.

Safe to delete now (not referenced by production or the npm test suite):
- `src/ai/perception-client.ts`
- `src/config/state-effects.ts`
- `src/ui/SecondaryScreens.tsx`
- `tests/__tmp_regression.mjs`
- root zero-byte `amused.1.1.PNG`

Audit-only / generated files safe to delete from the working repository:
- `__external-stubs.d.ts`
- `tsconfig.socialcheck.json`
- any committed `*.tsbuildinfo`

Legacy source still excluded from production but intentionally retained for the existing legacy regression/local-dialogue suite is documented in `CLEANUP_AUDIT_v0.20.44.md`.

## Not changed
- Firebase/Auth/Firestore paths and schema.
- App Check runtime behavior.
- Seedream/OpenAI routing.
- no-refusal photo mechanics.
- character personality/world changes from v0.20.43.

## Remaining technical debt
There is still no `package-lock.json`, while GitHub Actions uses `npm install`. Direct package versions are pinned, but transitive resolution is not fully reproducible. Generate and commit a real lockfile from Node 22/npm after a successful local install; do not hand-write it.
