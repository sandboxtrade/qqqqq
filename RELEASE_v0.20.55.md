# v0.20.55 — Qwen Image intimate-photo routing

## Что изменено
- medium/high intimate photo generation теперь идёт через WaveSpeed `wavespeed-ai/qwen-image/edit-2511`;
- маршрут WAN 2.6 убран из прямого интимного still-photo пайплайна;
- multi-key retry/polling теперь принимает задачи Qwen Image;
- health endpoint показывает Qwen Image среди активных WaveSpeed image models.

## Зачем
- у WAN 2.6 была заметная просадка по удержанию лица и телосложения на reference-based adult photo requests;
- Qwen Image выбран как следующий основной edit-маршрут для reference-driven 18+ still photos.
