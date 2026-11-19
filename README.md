# 🍻 AlcoSkype 2.0 Pro

Статическое WebRTC-приложение для приватных видео-посиделок компании до 4 человек (**Иркутск ↔ Минск**) без сборщиков, Node.js и бэкенда — готово к мгновенному деплою на **GitHub Pages**.

## Структура проекта

- `index.html` — главная страница (Club Gate, «Ящик пива», Лобби, Видеозвонок, AR-шторки, модальные окна)
- `css/style.css` — верстка, анимации, ящик с 9 банками пива, сетка 2–4 чел., мобильная адаптация
- `css/themes.css` — 3 темы: «Ночной бар», «Неоновый Киберпанк», «Классический Skype 2010»
- `js/config.js` — ключи клуба, STUN/TURN серверы, MediaPipe CDN, словарь 18+ юмора
- `js/storage.js` — гибридное хранилище (localStorage + PeerJS auto-sync + опциональный Firebase RTDB)
- `js/sound.js` — процедурный синтезатор Web Audio API (банка пива, рингтоны Skype, саундборд, звуки игр)
- `js/webrtc.js` — PeerJS mesh, ICE/TURN-тестер и виртуальный «Бот-Петрович» для тестов в одиночку
- `js/vision.js` — MediaPipe Tasks Vision (сегментация фона, руки, лицо) + детектор движения fallback
- `js/games.js` — AR-игры без мышки (Отбей бутылку, Муха, Алко-ковбои, Алкотестер, Пьяный полиграф, Чокнуться)
- `js/ui.js` — рендеринг экранов, перетаскиваемый PiP, двойные часы Иркутск/Минск и таймер пьянки
- `js/app.js` — главный контроллер приложения

## Быстрый деплой на GitHub Pages

1. Создайте публичный репозиторий **AlcoSkype** на GitHub (`https://github.com/new`).
2. Загрузите файлы в корень ветки `main`:

```bash
git init
git add index.html css js README.md
git commit -m "Launch AlcoSkype 2.0 Pro"
git branch -M main
git remote add origin https://github.com/<ВАШ_ЛОГИН>/AlcoSkype.git
git push -u origin main
```

3. В репозитории откройте **Settings → Pages → Build and deployment**:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` / `/ (root)` → **Save**.
4. Через 1–2 минуты откройте `https://<ВАШ_ЛОГИН>.github.io/AlcoSkype/`.

## Ключи по умолчанию (`js/config.js`)

- **Секретный ключ клуба (Club Gate)**: `IRK-MINSK-2026`
- **Пароль бармена (Техподдержка / Забыл PIN)**: `admin7788`
