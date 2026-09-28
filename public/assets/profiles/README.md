# Character profile references

Для каждой девушки уже создана своя папка.

Клади файлы прямо в папку персонажа:

- `avatar.jpg` — основной портрет/аватар и основной reference для OpenAI Images.
- `identity-sheet.jpg` — единый multi-view reference 3×2 с шестью ракурсами; Worker автоматически подхватит его прежде всего для WaveSpeed fallback.
- `01.jpg`, `02.jpg`, `03.jpg` — дополнительные фотографии галереи, если нужны.

Пример:

`public/assets/profiles/hina/avatar.jpg`
`public/assets/profiles/hina/identity-sheet.jpg`

Если `identity-sheet.jpg` отсутствует, WaveSpeed продолжит работать по `avatar.jpg`.
