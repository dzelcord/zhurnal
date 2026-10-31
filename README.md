# Журнал воскресной школы

Журнал посещений в виде классного журнала: группа в левом верхнем углу, даты в первой строке,
дети по строкам, отметки «+» и «−», заметки в последнем столбце. Группы листаются стрелками.

**Скачать для Mac на чипах Apple (M1–M4, A18 Pro):** [Zhurnal-Mac-arm64.zip](https://github.com/dzelcord/zhurnal/raw/main/download/Zhurnal-Mac-arm64.zip)

После распаковки перетащите программу в «Программы» и один раз выполните в Терминале:

    xattr -cr /Applications/Zhurnal.app

* `journal.html` общая страница журнала. Она же опубликована как веб-версия в Claude.
* `main.js`, `preload.js`, `app/localdb.js` приложение для macOS на Electron; записи хранятся в файле на Mac.
* `build-html.js` собирает `app/index.html` из `journal.html`.
* `localize.js` добавляет русское имя программы; имена файлов внутри `.app` только латинские,
  иначе «Утилита архивов» на Mac не распаковывает zip (ошибка 94).
* `release/Как установить.txt` инструкция для пользователя.

Сборка:

    npm install
    npm run build
    cd dist/Zhurnal-darwin-arm64 && zip -qry -9 ../../release/Zhurnal-Mac-arm64.zip Zhurnal.app
