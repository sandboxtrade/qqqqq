Yuzuki v0.19.6 build fix

Fixes GitHub Actions TypeScript error:
src/avatar/avatar-model.ts(1224,7) TS2345

Cause:
resolveAvailableVisualEmotion() returns VisualEmotionName | null.
The previous guard only checked emotionPool.length, which TypeScript 7 did not
use to narrow targetEmotion away from null before explicitVariantPool().

Fix:
guard targetEmotion explicitly:
if (!targetEmotion || !emotionPool.length) ...

No runtime behavior, Firebase, Worker, memory, photos, or schema contracts changed.
Replace only:
src/avatar/avatar-model.ts

Cloudflare Worker redeploy is NOT required for this build-only fix.
