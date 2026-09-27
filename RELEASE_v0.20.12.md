# v0.20.12

- Added a per-character **Безотказный режим** toggle in character settings.
- The setting is persisted in each character's existing `manualContext/current` document and stays backward compatible with `SCHEMA_VERSION=4`.
- When enabled, direct photo requests are accepted by character-side logic regardless of mood, relationship or intimacy refusal state; sleeping can still block the request.
- The Worker receives `photoPolicy.noRefusalMode` and mechanically reconciles direct photo requests to `shouldSendPhoto=true`.
- External image-provider moderation/API failures still use the existing OpenAI Images → WaveSpeed WAN 2.6 fallback path.
- Includes all v0.20.11 interface/photo reliability changes plus the later soft-boundary cooldown behavior.
