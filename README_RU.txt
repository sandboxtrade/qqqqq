Game2 v0.21.21 — исправление тестов GitHub Actions #246

Скопируйте папку tests из архива в корень локального репозитория qqqqq, согласитесь на замену файлов. Затем Commit to main и Push origin.

Причина сбоя #246: импорт TypeScript как default (`import ts from "typescript"`) при установленной версии TypeScript 7.0.2 возвращал undefined. Во всех 7 тестах, использующих TypeScript API, заменён на namespace import (`import * as ts from "typescript"`).

Версии пакетов, исходный код приложения, фотографии и Worker не изменены. Предыдущие исправления фотографий из v0.21.21 Photos & Deploy Fix сохранены, поскольку этот патч заменяет только тесты.

Ограничение проверки: в этой среде npm ci не удалось выполнить из-за недоступности npm registry. Поэтому полный прогон npm test/typecheck/build здесь не подтверждён. После Push GitHub Actions проверит результат.
