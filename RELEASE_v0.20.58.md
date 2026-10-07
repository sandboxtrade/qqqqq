# v0.20.58 — expression variance for reference-based photo generation

## Что изменено
- в Qwen explicit photo prompts добавлено жёсткое правило: сохранять ту же личность, но не копировать 1 в 1 выражение лица, эмоцию, взгляд и мышечное напряжение лица с reference image;
- это снижает эффект, когда сгенерированное лицо выглядит как точная копия референсного кадра по мимике и выражению.

## Технически
- identity block для medium/high Qwen prompts теперь сохраняет внешность и телосложение, но отдельно запрещает повторять exact facial expression from reference;
- добавлен regression test на это требование.
