// AlcoSkype 2.0 Pro — Конфигурация, ICE/TURN серверы и 18+ словарь бара

export const DEFAULT_CONFIG = {
  appName: 'AlcoSkype 2.0 Pro',
  clubKey: 'IRK-MINSK-2026',
  adminPassword: 'admin7788',
  maxAccounts: 4,
  firebaseDatabaseUrl: '', // Например: "https://your-project-default-rtdb.europe-west1.firebasedatabase.app"
  defaultTheme: 'bar', // 'bar' | 'cyberpunk' | 'skype2010'
  peerPrefix: 'alcoskype',
  customTurn: {
    url: '',
    username: '',
    credential: ''
  },
  defaultIceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  mediapipe: {
    moduleUrl: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs',
    wasmPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
    selfieModel: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
    handModel: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
    faceModel: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task'
  }
};

export const AVATARS = ['🍺', '🥃', '🦊', '🐻', '🦝', '👽', '🤖', '🤠', '🐙', '💀'];

export const THEMES = [
  { id: 'bar', name: 'Ночной бар', desc: 'Янтарь, стекло и дымка' },
  { id: 'cyberpunk', name: 'Неоновый Киберпанк', desc: 'Кислотный неон 2077' },
  { id: 'skype2010', name: 'Классический Skype 2010', desc: 'Ламповый глянец и скайп-бульк' }
];

export const BACKGROUNDS = [
  { id: 'original', name: 'Оригинал', icon: '📷' },
  { id: 'blur', name: 'Размытие', icon: '🌫️' },
  { id: 'pub', name: 'Ночной паб', icon: '🍻' },
  { id: 'cyber', name: 'Кибер-бар', icon: '🌆' },
  { id: 'banya', name: 'Баня', icon: '🧖' },
  { id: 'space', name: 'Космос', icon: '🚀' },
  { id: 'custom', name: 'Свой фон', icon: '🖼️' }
];

// Дерзкие подписи к часам по времени суток (жёсткий барный угар 18+)
export function getCityCaption(city, hour) {
  const irkutskMap = [
    [0, 3, 'Иркутск уже в дрова, Байкал штормит'],
    [3, 6, 'Сибирский хардкор: кто уснул — тот слабак'],
    [6, 9, 'Опохмел по-сибирски: рассол или ещё по одной?'],
    [9, 12, 'На работе делают вид, что трезвые'],
    [12, 15, 'Обеденный перерыв — повод пропустить по маленькой'],
    [15, 18, 'Печень разминается перед вечерним рейдом'],
    [18, 21, 'Ангарский вечер: пробки летят в потолок'],
    [21, 24, 'Самый сок! Наливай, пока Минск догоняет']
  ];

  const minskMap = [
    [0, 3, 'Минск держит оборону, драники уже не спасают'],
    [3, 6, 'Ночная смена на Немиге: автопилот включён'],
    [6, 9, 'Утро в Беларуси: глаза не открываются, но надо'],
    [9, 12, 'Кофе с коньяком считается за завтрак'],
    [12, 15, 'Дневной разогрев: пока Иркутск уже в хлам'],
    [15, 18, 'Пятница в душе начинается ровно сейчас'],
    [18, 21, 'Минск открывает краник — догоняем Сибирь!'],
    [21, 24, 'Полный газ! Батька одобряет такой темп']
  ];

  const table = city === 'irkutsk' ? irkutskMap : minskMap;
  const row = table.find(([from, to]) => hour >= from && hour < to);
  return row ? row[2] : 'Время налить ещё!';
}

// Стадии опьянения по длительности сессии (в секундах)
export const DRINK_STAGES = [
  {
    minSec: 0,
    title: 'Стадия 1: Приличные люди (пока)',
    subtitle: 'Первая — колом, вторая — соколом, пристёгиваемся'
  },
  {
    minSec: 900, // 15 мин
    title: 'Стадия 2: Пошли грязные байки',
    subtitle: 'Тормоза сняты, вспоминаем бывших и позорные ночи'
  },
  {
    minSec: 2700, // 45 мин
    title: 'Стадия 3: Ты меня вообще уважаешь?!',
    subtitle: 'Гениальные стартапы на салфетке и признания в любви'
  },
  {
    minSec: 5400, // 1.5 часа
    title: 'Стадия 4: Звоним бывшим и поём Сектор Газа',
    subtitle: 'Координация покинула чат, язык заплетается красиво'
  },
  {
    minSec: 9000, // 2.5 часа
    title: 'Стадия 5: Легендарный алко-марафон',
    subtitle: 'Завтрашний день официально отменён, живём один раз!'
  }
];

export function getDrinkStage(elapsedSec) {
  let current = DRINK_STAGES[0];
  for (const stage of DRINK_STAGES) {
    if (elapsedSec >= stage.minSec) current = stage;
  }
  return current;
}

// Дерзкие 18+ вердикты «Пьяного полиграфа»
export const POLYGRAPH_VERDICTS = [
  { truth: false, title: 'ВРЁТ И НЕ КРАСНЕЕТ!', desc: 'Датчик пошлости зашкалил. Штрафную до дна, балабол!' },
  { truth: true, title: 'ЧИСТАЯ ПРАВДА — НАЛИВАЙ!', desc: 'Святой человек, хоть сейчас икону пиши. За это надо выпить!' },
  { truth: false, title: 'ЖЁСТКИЙ ПИЗДЁЖ!', desc: 'Пульс 140, глаза бегают как у школьника на порносайте. Пей штрафную!' },
  { truth: true, title: 'ЗУБ ДАЁТ, НЕ ВРЁТ!', desc: 'Мозг уже слишком пьян, чтобы придумывать отмазки. Уважаемо!' },
  { truth: false, title: 'НЕДОГОВАРИВАЕТ, ХИТРЫЙ ЖУК!', desc: 'Там явно замешана голая правда и пара бутылок. Колись или пей!' },
  { truth: true, title: '100% БАЗА И ИСТИНА!', desc: 'Даже полиграф прослезился. Поднимаем бокалы за честность!' },
  { truth: false, title: 'ТРЕВОГА: ЛИЦЕМЕР ДЕТЕКТЕД!', desc: 'Говорит «я сегодня чуть-чуть», а сам уже на третьем литре. Штрафной!' },
  { truth: false, title: 'ПОЙМАН ЗА ЖОПУ!', desc: 'Мимика выдала всё с потрохами. Оправдываться будешь после стопки!' }
];

// Быстрые дерзкие тосты в чат
export const QUICK_TOASTS = [
  'За то, чтобы стоял и деньги были! 🍻',
  'Чтобы х*й стоял, печень не ныла, а менты мимо ходили! 🥃',
  'За дружбу Иркутск — Минск: 5 часов разницы, ноль тормозов! 🌍',
  'Пьём до дна, чтобы враги сдохли от зависти! 💀',
  'Кто не пьёт — тот либо болеет, либо мутный тип. Наливай! 🍺',
  'За наши грехи — пусть черти в аду стоя аплодируют! 🔥'
];

// Реплики виртуального Собутыльника-бота
export const BOT_REPLIES = [
  'Ну наконец-то! Я уже полчаса с пустой кружкой сижу, как дурак 🍺',
  'Слышь, не филонь, наливай по полной! За Иркутск и Минск!',
  'Ого, вот это темп! Печень передаёт привет и просит пощады 😂',
  'Запусти мне муху — я ей покажу, кто в этом баре альфа!',
  'Давай в ковбоев! Если проиграешь — пьёшь стоя и без закуски 🤠',
  'Эх, хороша чертовка! А ну чокнемся, пока пена не осела! 🍻',
  'Полиграф на мне сломается, я вообще ангел во плоти (нет) 😈',
  'Да я в алкотестер так дуну, что у тебя монитор запотеет! 💨'
];

export const BOTTLE_MISS_LINES = [
  'ШТРАФНОЙ ГЛОТОК! Руки-крюки, просрал бутылку!',
  'РАЗБИЛ СВЯТОЕ! Пей до дна за испорченный реквизит!',
  'МИМО! Трезвые так не мажут — срочно выровнять градус!',
  'БАЦ ВДРЕБЕЗГИ! Наливай штрафную, салага!'
];

export const COWBOY_LOSE_LINES = [
  'ТВОЯ ОЧЕРЕДЬ ПИТЬ! Прострелили задницу быстрее, чем ты моргнул!',
  'СЛИШКОМ МЕДЛЕННО, КОВБОЙ! Заливай рану до дна!',
  'ПУЛЯ В ЛОБ — СТАКАН В РУКУ! Пей, шериф хренов!'
];

export const BREATH_VERDICTS = [
  { min: 0, max: 0.8, label: 'Трезвый как стёклышко — позор бара! Срочно догнаться!' },
  { min: 0.8, max: 1.8, label: 'Благородный кураж! Можно садиться за философские беседы.' },
  { min: 1.8, max: 2.8, label: 'Выхлоп сбивает дроны! Соседи уже просят потише.' },
  { min: 2.8, max: 3.6, label: 'Режим «Море по колено»! Прав лишают пожизненно.' },
  { min: 3.6, max: 99, label: 'ЛЕГЕНДА АЛКО-СПОРТА! Огнеопасно, не подносить спички!' }
];

export function getBreathVerdict(promille) {
  const found = BREATH_VERDICTS.find(v => promille >= v.min && promille < v.max);
  return found ? found.label : BREATH_VERDICTS[BREATH_VERDICTS.length - 1].label;
}

export function sanitizeClubKey(key) {
  return String(key || DEFAULT_CONFIG.clubKey)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 32) || 'irk-minsk-2026';
}

export function buildIceServers(customTurn) {
  const list = DEFAULT_CONFIG.defaultIceServers.map(item => ({ ...item }));
  if (customTurn && customTurn.url && customTurn.url.trim()) {
    const entry = { urls: customTurn.url.trim() };
    if (customTurn.username && customTurn.username.trim()) {
      entry.username = customTurn.username.trim();
    }
    if (customTurn.credential && customTurn.credential.trim()) {
      entry.credential = customTurn.credential.trim();
    }
    list.unshift(entry);
  }
  return list;
}

export const GITHUB_DEPLOY_GUIDE = `# Быстрый деплой AlcoSkype 2.0 Pro на GitHub Pages

1. Создай новый публичный репозиторий на https://github.com/new с именем AlcoSkype.
2. Загрузи все файлы проекта (index.html, css/*, js/*) в корень ветки main:

   git init
   git add .
   git commit -m "Launch AlcoSkype 2.0 Pro"
   git branch -M main
   git remote add origin https://github.com/<ТВОЙ_ЛОГИН>/AlcoSkype.git
   git push -u origin main

3. Открой Settings -> Pages -> Source: "Deploy from a branch" -> Branch: main / (root) -> Save.
4. Через 1-2 минуты бар откроется по адресу:
   https://<ТВОЙ_ЛОГИН>.github.io/AlcoSkype/

Совет: Секретный ключ клуба по умолчанию IRK-MINSK-2026, пароль бармена admin7788. Их можно поменять прямо в js/config.js или в Настройках!`;
