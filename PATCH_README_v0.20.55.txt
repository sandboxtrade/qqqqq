Game2 / Virtual Companion — v0.20.55 Qwen Image intimate-photo routing

Что внутри:
- Cloudflare Worker: medium/high intimate photo routing переведён с WAN 2.6 на Qwen Image Edit
- Retry / polling: разрешён model id wavespeed-ai/qwen-image/edit-2511
- Health/debug: список WaveSpeed image models обновлён
- Tests: photo routing / photo messages обновлены под Qwen Image

Новый прямой intimate route:
- medium/high intimate still photos -> WaveSpeed wavespeed-ai/qwen-image/edit-2511

Qwen Image payload:
- prompt
- images
- seed: -1
- output_format: jpeg
- enable_base64_output: false
- enable_sync_mode: false
