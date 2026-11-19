// AlcoSkype 2.0 Pro — Главный контроллер приложения

import { DEFAULT_CONFIG, GITHUB_DEPLOY_GUIDE } from './config.js';
import { storage } from './storage.js';
import { sound } from './sound.js';
import { webrtc, testIceConnection } from './webrtc.js';
import { vision } from './vision.js';
import { GamesEngine } from './games.js';
import { ui } from './ui.js';

const state = {
  settings: storage.getSettings(),
  currentUser: null,
  pinBuffer: '',
  inCall: false,
  micEnabled: true,
  camEnabled: true,
  rawStream: null,
  processedStream: null,
  selectedCamId: '',
  selectedMicId: '',
  deviceMicMeter: null,
  deviceMeterRaf: null,
  pendingIncomingCall: null,
  drinksMap: new Map(), // slot -> count
  sessionStartedAt: null
};

const games = new GamesEngine({
  vision,
  onBroadcast: payload => webrtc.broadcast(payload),
  onToast: msg => ui.toast(msg, 'info'),
  onScoreUpdate: score => {
    const el = document.getElementById('games-bottle-score');
    if (el) el.textContent = String(score);
  }
});

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
function bootstrap() {
  state.settings = storage.getSettings();
  sound.setVolume(state.settings.volume);
  sound.setMuted(state.settings.muted);
  ui.initBaseUI(state.settings);

  const volSlider = document.getElementById('master-volume-slider');
  if (volSlider) volSlider.value = String(Math.round(state.settings.volume * 100));
  updateMuteButtonUI();

  bindGateEvents();
  bindLoginEvents();
  bindSupportEvents();
  bindLobbyEvents();
  bindDeviceCheckEvents();
  bindSettingsEvents();
  bindCallEvents();
  bindChatEvents();
  bindWebRTCEvents();

  // Статус загрузки MediaPipe
  vision.onStatusChange = (text) => {
    const lbl = document.getElementById('vision-status-label');
    if (lbl) lbl.textContent = text;
  };

  // Защита от случайных прохожих (Club Gate): до ввода ключа 0 сетевых подключений
  if (!storage.isGateUnlocked()) {
    ui.showScreen('gate');
  } else {
    enterLoginScreen();
  }
}

function enterLoginScreen() {
  ui.showScreen('login');
  state.pinBuffer = '';
  const accounts = storage.getAccounts();
  ui.updateLoginAccountsInfo(accounts);
  ui.updatePinDisplay('', accounts.length ? 'Кликай по банкам — введи 4-значный PIN' : 'Создай первый аккаунт кнопкой ниже');

  // Если настроен Firebase URL — подтягиваем список аккаунтов клуба в фоне
  if (storage.hasCloudEnabled()) {
    storage.fetchCloudSnapshot().then(snap => {
      if (snap?.accounts) ui.updateLoginAccountsInfo(snap.accounts);
    }).catch(() => {});
  }
}

// ==================== 1. CLUB GATE ====================
function bindGateEvents() {
  const form = document.getElementById('gate-form');
  const input = document.getElementById('gate-key-input');
  const errEl = document.getElementById('gate-error');

  form?.addEventListener('submit', e => {
    e.preventDefault();
    sound.ensureContext();
    const val = input.value.trim();
    if (storage.tryUnlockGate(val)) {
      sound.playCanOpen();
      if (errEl) errEl.textContent = '';
      ui.toast('Добро пожаловать в закрытый бар! 🍻', 'success');
      enterLoginScreen();
    } else {
      sound.playErrorBuzz();
      if (errEl) errEl.textContent = 'Неверный секретный ключ клуба! Чужим тут не наливают.';
    }
  });
}

// ==================== 2. ЯЩИК ПИВА И СОЗДАНИЕ АККАУНТА ====================
function bindLoginEvents() {
  const crate = document.getElementById('beer-crate');
  crate?.addEventListener('click', e => {
    const btn = e.target.closest('.beer-can');
    if (!btn) return;
    handlePinDigit(btn.dataset.digit);
  });

  // Поддержка ввода PIN с клавиатуры (1..9, Backspace) на экране входа
  window.addEventListener('keydown', e => {
    const loginActive = document.getElementById('screen-login')?.classList.contains('screen--active');
    const anyModalOpen = Array.from(document.querySelectorAll('.modal-backdrop')).some(m => !m.classList.contains('hidden'));
    if (!loginActive || anyModalOpen) return;
    if (e.key >= '1' && e.key <= '9') {
      handlePinDigit(e.key);
    } else if (e.key === 'Backspace') {
      state.pinBuffer = state.pinBuffer.slice(0, -1);
      ui.updatePinDisplay(state.pinBuffer, 'Введи 4-значный PIN');
    }
  });

  document.getElementById('pin-clear-btn')?.addEventListener('click', () => {
    state.pinBuffer = '';
    ui.updatePinDisplay('', 'PIN очищен — открывай банки заново');
  });

  document.getElementById('open-create-modal-btn')?.addEventListener('click', () => {
    document.getElementById('create-error').textContent = '';
    document.getElementById('create-name-input').value = '';
    document.getElementById('create-pin-input').value = '';
    ui.updateLoginAccountsInfo(storage.getAccounts());
    ui.openModal('modal-create-account');
  });

  document.getElementById('create-account-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('create-name-input').value;
    const pin = document.getElementById('create-pin-input').value;
    const errEl = document.getElementById('create-error');

    const res = storage.createAccount({ name, avatar: ui.selectedAvatar, pin });
    if (!res.ok) {
      sound.playErrorBuzz();
      errEl.textContent = res.error;
      return;
    }

    sound.playCanOpen();
    ui.closeModal('modal-create-account');
    ui.updateLoginAccountsInfo(res.accounts);
    ui.toast(`Собутыльник ${res.account.avatar} ${res.account.name} создан! Входи по PIN ${res.account.pin}`, 'success');
    // Сразу входим в только что созданный аккаунт
    loginAs(res.account);
  });

  // Смена темы со всех селекторов
  document.querySelectorAll('.theme-select').forEach(sel => {
    sel.addEventListener('change', () => {
      state.settings = storage.saveSettings({ theme: sel.value });
      ui.applyTheme(state.settings.theme);
    });
  });
}

function handlePinDigit(digit) {
  if (state.pinBuffer.length >= 4) return;
  sound.playCanOpen();
  ui.animateCanPop(digit);
  state.pinBuffer += String(digit);
  ui.updatePinDisplay(state.pinBuffer, `Введено ${state.pinBuffer.length} из 4...`);

  if (state.pinBuffer.length === 4) {
    const acc = storage.findAccountByPin(state.pinBuffer);
    if (acc) {
      ui.updatePinDisplay(state.pinBuffer, `Привет, ${acc.name}! Заходим в бар...`);
      setTimeout(() => loginAs(acc), 320);
    } else {
      sound.playErrorBuzz();
      ui.updatePinDisplay(state.pinBuffer, 'Нет собутыльника с таким PIN! Попробуй снова.', true);
      setTimeout(() => {
        state.pinBuffer = '';
        ui.updatePinDisplay('', 'Введи 4-значный PIN по банкам пива');
      }, 950);
    }
  }
}

// ==================== 3. ТЕХПОДДЕРЖКА / БАРМЕН ====================
function bindSupportEvents() {
  document.getElementById('open-support-btn')?.addEventListener('click', () => {
    document.getElementById('support-auth-step').classList.remove('hidden');
    document.getElementById('support-panel-step').classList.add('hidden');
    document.getElementById('support-pass-input').value = '';
    document.getElementById('support-error').textContent = '';
    ui.openModal('modal-support');
  });

  document.getElementById('support-auth-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const pass = document.getElementById('support-pass-input').value.trim();
    const expected = state.settings.adminPassword || DEFAULT_CONFIG.adminPassword;
    if (pass !== expected) {
      sound.playErrorBuzz();
      document.getElementById('support-error').textContent = 'Неверный пароль бармена!';
      return;
    }
    sound.playCanOpen();
    document.getElementById('support-auth-step').classList.add('hidden');
    document.getElementById('support-panel-step').classList.remove('hidden');
    refreshSupportList();
  });

  document.getElementById('support-lock-gate-btn')?.addEventListener('click', () => {
    storage.lockGate();
    webrtc.disconnect();
    ui.closeAllModals();
    ui.showScreen('gate');
    ui.toast('Ключ клуба сброшен. Бар закрыт на засов.', 'info');
  });
}

function refreshSupportList() {
  ui.renderSupportAccounts(storage.getAccounts(), slot => {
    const updated = storage.deleteAccount(slot);
    ui.updateLoginAccountsInfo(updated);
    refreshSupportList();
    ui.toast(`Аккаунт из слота #${slot} удалён.`, 'info');
  });
}

// ==================== 4. ВХОД В ЛОББИ И СИНХРОНИЗАЦИЯ ====================
function loginAs(account) {
  state.currentUser = account;
  state.pinBuffer = '';
  if (!state.drinksMap.has(account.slot)) {
    state.drinksMap.set(account.slot, account.drinksCount || 0);
  }

  ui.showScreen('lobby');
  refreshLobbyUI();
  ui.renderChatMessages(storage.getChatHistory(), account.slot);

  // Запускаем PeerJS с детерминированным ID
  webrtc.connect({
    clubKey: state.settings.clubKey,
    account,
    customTurn: state.settings.customTurn
  });

  // Если задан Firebase URL — запускаем облачный синк
  if (storage.hasCloudEnabled()) {
    storage.pushPresenceToCloud(account.slot, true).catch(() => {});
    storage.startCloudSync();
    storage.onCloudUpdate(({ accounts, presence }) => {
      if (presence) {
        const now = Date.now();
        Object.values(presence).forEach(p => {
          if (p && p.slot && p.online && now - (p.ts || 0) < 120000) {
            webrtc.onlineSlots.add(Number(p.slot));
          }
        });
      }
      if (accounts) refreshLobbyUI();
    });
  }
}

function refreshLobbyUI() {
  ui.renderLobby({
    currentUser: state.currentUser,
    accounts: storage.getAccounts(),
    onlineSlots: webrtc.onlineSlots,
    cloudEnabled: storage.hasCloudEnabled(),
    onCallSlot: slot => startOutgoingCall([slot])
  });
}

function bindLobbyEvents() {
  document.getElementById('lobby-logout-btn')?.addEventListener('click', () => {
    if (state.currentUser && storage.hasCloudEnabled()) {
      storage.pushPresenceToCloud(state.currentUser.slot, false).catch(() => {});
    }
    storage.stopCloudSync();
    webrtc.disconnect();
    stopLocalMedia();
    state.currentUser = null;
    enterLoginScreen();
  });

  document.getElementById('call-all-btn')?.addEventListener('click', () => {
    const others = storage.getAccounts()
      .filter(a => a.slot !== state.currentUser?.slot)
      .map(a => a.slot);
    if (!others.length) {
      ui.toast('В баре пока никого нет! Создай друзей или жми «Тест с Ботом-Петровичем».', 'info');
      startCallWithBot();
      return;
    }
    startOutgoingCall(others);
  });

  document.getElementById('call-bot-btn')?.addEventListener('click', () => {
    startCallWithBot();
  });

  document.getElementById('open-lobby-chat-btn')?.addEventListener('click', () => {
    ui.renderChatMessages(storage.getChatHistory(), state.currentUser?.slot);
    ui.openModal('modal-lobby-chat');
  });

  document.getElementById('open-device-check-btn')?.addEventListener('click', async () => {
    ui.openModal('modal-device-check');
    await openDeviceCheckPreview();
  });

  document.getElementById('lobby-settings-btn')?.addEventListener('click', () => {
    openSettingsModal();
  });
}

// ==================== 5. ПРОВЕРКА КАМЕРЫ, ЗВУКА И ФОНОВ ====================
async function ensureLocalMedia(forceReload = false) {
  if (state.processedStream && !forceReload) {
    return state.processedStream;
  }

  if (state.rawStream) {
    state.rawStream.getTracks().forEach(t => t.stop());
  }

  const videoConstraints = state.selectedCamId
    ? { deviceId: { exact: state.selectedCamId }, width: { ideal: 640 }, height: { ideal: 480 } }
    : { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' };
  const audioConstraints = state.selectedMicId
    ? { deviceId: { exact: state.selectedMicId }, echoCancellation: true, noiseSuppression: true }
    : { echoCancellation: true, noiseSuppression: true };

  try {
    state.rawStream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: audioConstraints
    });
  } catch {
    try {
      // Фоллбэк только аудио, если нет камеры
      state.rawStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      ui.toast('Камера не найдена — подключён только микрофон.', 'info');
    } catch {
      // Полный фоллбэк без камеры и микрофона (Canvas поток)
      state.rawStream = null;
      ui.toast('Нет доступа к камере/микрофону — работаем в режиме зрителя.', 'info');
    }
  }

  state.processedStream = await vision.attachStream(state.rawStream);
  applyTrackMuteStates();
  webrtc.setLocalStream(state.processedStream);
  return state.processedStream;
}

function stopLocalMedia() {
  vision.stop();
  if (state.rawStream) {
    state.rawStream.getTracks().forEach(t => t.stop());
    state.rawStream = null;
  }
  state.processedStream = null;
}

function applyTrackMuteStates() {
  if (!state.processedStream) return;
  state.processedStream.getAudioTracks().forEach(t => { t.enabled = state.micEnabled; });
  state.processedStream.getVideoTracks().forEach(t => { t.enabled = state.camEnabled; });
}

async function openDeviceCheckPreview() {
  const stream = await ensureLocalMedia();
  const video = document.getElementById('device-preview-video');
  if (video) video.srcObject = stream;

  // Заполняем списки камер и микрофонов
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === 'videoinput');
    const mics = devices.filter(d => d.kind === 'audioinput');
    const camSel = document.getElementById('device-cam-select');
    const micSel = document.getElementById('device-mic-select');
    if (camSel) {
      camSel.innerHTML = cams.length
        ? cams.map((c, i) => `<option value="${c.deviceId}" ${c.deviceId === state.selectedCamId ? 'selected' : ''}>${c.label || `Камера #${i + 1}`}</option>`).join('')
        : '<option value="">Камера не найдена</option>';
    }
    if (micSel) {
      micSel.innerHTML = mics.length
        ? mics.map((m, i) => `<option value="${m.deviceId}" ${m.deviceId === state.selectedMicId ? 'selected' : ''}>${m.label || `Микрофон #${i + 1}`}</option>`).join('')
        : '<option value="">Микрофон не найден</option>';
    }
  } catch { /* noop */ }

  // Живая шкала микрофона
  stopDeviceMeter();
  state.deviceMicMeter = sound.createMicMeter(state.rawStream);
  const fill = document.getElementById('device-mic-meter-fill');
  const loop = () => {
    const modal = document.getElementById('modal-device-check');
    if (!modal || modal.classList.contains('hidden')) {
      stopDeviceMeter();
      return;
    }
    const lvl = state.deviceMicMeter ? state.deviceMicMeter.getLevel() : 0;
    if (fill) fill.style.width = `${lvl}%`;
    state.deviceMeterRaf = requestAnimationFrame(loop);
  };
  state.deviceMeterRaf = requestAnimationFrame(loop);
}

function stopDeviceMeter() {
  if (state.deviceMeterRaf) {
    cancelAnimationFrame(state.deviceMeterRaf);
    state.deviceMeterRaf = null;
  }
  if (state.deviceMicMeter) {
    state.deviceMicMeter.destroy();
    state.deviceMicMeter = null;
  }
}

function bindDeviceCheckEvents() {
  document.getElementById('device-cam-select')?.addEventListener('change', async e => {
    state.selectedCamId = e.target.value;
    const stream = await ensureLocalMedia(true);
    const v = document.getElementById('device-preview-video');
    if (v) v.srcObject = stream;
  });

  document.getElementById('device-mic-select')?.addEventListener('change', async e => {
    state.selectedMicId = e.target.value;
    await ensureLocalMedia(true);
    stopDeviceMeter();
    state.deviceMicMeter = sound.createMicMeter(state.rawStream);
  });

  document.getElementById('device-speaker-test-btn')?.addEventListener('click', () => {
    sound.playSpeakerTest();
    ui.toast('🔊 Тестовый аккорд отправлен в наушники/колонки!', 'info');
  });

  // Виртуальные фоны (общие обработчики для превью и звонка)
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-bg-mode]');
    if (!btn) return;
    const mode = btn.dataset.bgMode;
    if (mode === 'custom') {
      document.getElementById('call-bg-upload')?.click();
      return;
    }
    vision.setBackground(mode);
    ui.highlightActiveBg(mode);
  });

  ['device-blur-slider', 'call-blur-slider'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', e => {
      vision.setBlurAmount(e.target.value);
      ['device-blur-slider', 'call-blur-slider'].forEach(other => {
        const el = document.getElementById(other);
        if (el) el.value = e.target.value;
      });
    });
  });

  ['device-bg-upload', 'call-bg-upload'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (!file) return;
      vision.setCustomBackgroundFile(file);
      ui.highlightActiveBg('custom');
      ui.toast('🖼️ Свой фон установлен!', 'success');
    });
  });
}

// ==================== 6. НАСТРОЙКИ И ICE-ТЕСТЕР ====================
function openSettingsModal() {
  const s = storage.getSettings();
  document.getElementById('settings-club-key').value = s.clubKey;
  document.getElementById('settings-firebase-url').value = s.firebaseDatabaseUrl || '';
  document.getElementById('settings-turn-url').value = s.customTurn.url || '';
  document.getElementById('settings-turn-user').value = s.customTurn.username || '';
  document.getElementById('settings-turn-pass').value = s.customTurn.credential || '';
  document.getElementById('settings-theme-select').value = s.theme;
  document.getElementById('settings-ice-result').textContent = 'Нажми «Тест соединения (ICE)», чтобы проверить пробитие NAT и работу TURN.';
  ui.openModal('modal-settings');
}

function bindSettingsEvents() {
  document.getElementById('settings-save-btn')?.addEventListener('click', () => {
    const clubKey = document.getElementById('settings-club-key').value.trim() || DEFAULT_CONFIG.clubKey;
    const firebaseDatabaseUrl = document.getElementById('settings-firebase-url').value.trim();
    const theme = document.getElementById('settings-theme-select').value;
    const customTurn = {
      url: document.getElementById('settings-turn-url').value.trim(),
      username: document.getElementById('settings-turn-user').value.trim(),
      credential: document.getElementById('settings-turn-pass').value.trim()
    };

    const prevKey = state.settings.clubKey;
    state.settings = storage.saveSettings({ clubKey, firebaseDatabaseUrl, theme, customTurn });
    if (prevKey !== clubKey) {
      localStorage.setItem('alcoskype_gate_unlocked_v2', clubKey);
    }
    ui.applyTheme(theme);

    if (state.currentUser) {
      webrtc.connect({
        clubKey: state.settings.clubKey,
        account: state.currentUser,
        customTurn: state.settings.customTurn
      });
      if (storage.hasCloudEnabled()) storage.startCloudSync();
      else storage.stopCloudSync();
      refreshLobbyUI();
    }

    ui.closeModal('modal-settings');
    ui.toast('Настройки клуба сохранены и применены!', 'success');
  });

  document.getElementById('settings-ice-test-btn')?.addEventListener('click', async () => {
    const resEl = document.getElementById('settings-ice-result');
    const btn = document.getElementById('settings-ice-test-btn');
    btn.disabled = true;
    resEl.textContent = '⏳ Проверяем STUN и TURN-реле (до 5 сек)...';

    const customTurn = {
      url: document.getElementById('settings-turn-url').value.trim(),
      username: document.getElementById('settings-turn-user').value.trim(),
      credential: document.getElementById('settings-turn-pass').value.trim()
    };
    const report = await testIceConnection(customTurn);
    btn.disabled = false;
    resEl.textContent = `${report.relay ? '✅' : report.srflx ? '⚠️' : '❌'} ${report.summary} (кандидатов: ${report.count || 0})`;
  });

  document.getElementById('settings-copy-guide-btn')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(GITHUB_DEPLOY_GUIDE);
      ui.toast('📋 Шпаргалка по деплою на GitHub скопирована!', 'success');
    } catch {
      ui.toast('Выдели текст шпаргалки вручную и скопируй (Ctrl+C).', 'info');
    }
  });
}

// ==================== 7. ЗВОНКИ И ВИДЕОСЕТКА ====================
async function enterCallRoom() {
  state.inCall = true;
  if (!state.sessionStartedAt) {
    state.sessionStartedAt = Date.now();
  }
  ui.showScreen('call');
  ui.startSessionHud(state.sessionStartedAt);
  const arCanvas = document.getElementById('ar-overlay-canvas');
  if (arCanvas) games.mount(arCanvas);
  renderActiveCallGrid();
  ui.updateDrinkTotals(state.drinksMap);
}

async function startOutgoingCall(targetSlots) {
  const stream = await ensureLocalMedia();
  await enterCallRoom();

  sound.startSkypeOutgoing();
  let calledAny = false;
  for (const slot of targetSlots) {
    if (webrtc.callSlot(slot, stream)) {
      calledAny = true;
    }
  }
  if (calledAny) {
    ui.toast('📞 Звоним в бар... Ждём, пока друзья возьмут трубку!', 'info');
    setTimeout(() => {
      if (webrtc.remoteStreams.size === 0) sound.stopRingtone();
    }, 15000);
  }
}

async function startCallWithBot() {
  await ensureLocalMedia();
  await enterCallRoom();
  if (!webrtc.bot.active) {
    sound.playCallConnected();
    webrtc.startBot();
    if (!state.drinksMap.has(webrtc.bot.slot)) {
      state.drinksMap.set(webrtc.bot.slot, 1);
    }
    ui.toast('🤖 Бот-Петрович залетел за столик! Можно тестить звонок и все AR-игры.', 'success');
  }
  renderActiveCallGrid();
  ui.updateDrinkTotals(state.drinksMap);
}

function renderActiveCallGrid() {
  const accounts = storage.getAccounts();
  const remoteEntries = [];

  for (const [slot, stream] of webrtc.remoteStreams.entries()) {
    if (slot === webrtc.bot.slot) {
      remoteEntries.push({
        slot,
        name: webrtc.bot.name,
        avatar: webrtc.bot.avatar,
        stream,
        isBot: true
      });
    } else {
      const acc = accounts.find(a => a.slot === slot);
      remoteEntries.push({
        slot,
        name: acc ? acc.name : `Собутыльник #${slot}`,
        avatar: acc ? acc.avatar : '🍺',
        stream,
        isBot: false
      });
    }
  }

  ui.renderCallVideos({
    localStream: state.processedStream,
    currentUser: state.currentUser,
    remoteEntries,
    drinksMap: state.drinksMap,
    onAddDrink: slot => incrementDrink(slot, true)
  });
  games.resize();
}

function incrementDrink(slot, broadcast = true) {
  const next = (state.drinksMap.get(slot) || 0) + 1;
  state.drinksMap.set(slot, next);
  sound.playCanOpen();
  ui.updateDrinkTotals(state.drinksMap);
  renderActiveCallGrid();

  if (broadcast) {
    webrtc.broadcast({ type: 'DRINK_INC', slot, count: next });
  }
}

function leaveCallRoom() {
  sound.stopRingtone();
  sound.stopFlyBuzz();
  sound.playCallEnded();
  games.toggleBottleGame(false);
  webrtc.hangupAll();
  state.inCall = false;
  state.sessionStartedAt = null;
  ui.stopSessionHud();
  ui.closeAllDrawers();
  ui.showScreen('lobby');
  refreshLobbyUI();
}

function bindCallEvents() {
  // Кнопки нижней панели звонка
  document.getElementById('ctrl-mic-btn')?.addEventListener('click', e => {
    state.micEnabled = !state.micEnabled;
    applyTrackMuteStates();
    e.currentTarget.classList.toggle('ctrl-btn--off', !state.micEnabled);
    e.currentTarget.querySelector('.ctrl-btn__label').textContent = state.micEnabled ? 'Микро' : 'Выкл';
  });

  document.getElementById('ctrl-cam-btn')?.addEventListener('click', e => {
    state.camEnabled = !state.camEnabled;
    applyTrackMuteStates();
    e.currentTarget.classList.toggle('ctrl-btn--off', !state.camEnabled);
    e.currentTarget.querySelector('.ctrl-btn__label').textContent = state.camEnabled ? 'Камера' : 'Выкл';
  });

  document.getElementById('ctrl-drink-btn')?.addEventListener('click', () => {
    if (state.currentUser) incrementDrink(state.currentUser.slot, true);
  });

  document.getElementById('local-drink-btn')?.addEventListener('click', () => {
    if (state.currentUser) incrementDrink(state.currentUser.slot, true);
  });

  document.getElementById('ctrl-clink-btn')?.addEventListener('click', () => {
    games.triggerClink(true);
  });

  document.getElementById('ctrl-games-btn')?.addEventListener('click', () => ui.toggleCallDrawer('drawer-games'));
  document.getElementById('ctrl-bg-btn')?.addEventListener('click', () => ui.toggleCallDrawer('drawer-bg'));
  document.getElementById('ctrl-sound-btn')?.addEventListener('click', () => ui.toggleCallDrawer('drawer-sound'));
  document.getElementById('ctrl-chat-btn')?.addEventListener('click', () => ui.toggleCallDrawer('drawer-chat'));

  document.getElementById('ctrl-bot-btn')?.addEventListener('click', () => {
    if (webrtc.bot.active) {
      webrtc.stopBot();
      ui.toast('🤖 Бот-Петрович ушёл спать.', 'info');
    } else {
      webrtc.startBot();
      ui.toast('🤖 Бот-Петрович снова в эфире!', 'success');
    }
    renderActiveCallGrid();
  });

  document.getElementById('ctrl-hangup-btn')?.addEventListener('click', () => leaveCallRoom());

  document.querySelectorAll('[data-close-drawer]').forEach(btn => {
    btn.addEventListener('click', () => ui.closeAllDrawers());
  });

  // Сворачивание HUD на мобильных
  document.getElementById('hud-collapse-btn')?.addEventListener('click', () => {
    document.getElementById('call-hud')?.classList.toggle('hud--collapsed');
  });

  // --- Кнопки AR-игр ---
  document.getElementById('game-bottle-btn')?.addEventListener('click', e => {
    const active = games.toggleBottleGame();
    e.currentTarget.textContent = active ? '⏹️ Стоп: Бутылка' : '🍺 Отбей бутылку';
    e.currentTarget.classList.toggle('btn--primary', active);
  });

  document.getElementById('game-fly-btn')?.addEventListener('click', () => {
    const targetSlot = Number(document.getElementById('ar-target-select')?.value || state.currentUser?.slot);
    if (targetSlot === state.currentUser?.slot) {
      games.launchFlyOnMe(state.currentUser.name);
    } else {
      webrtc.sendTo(targetSlot, {
        type: 'GAME_FLY_LAUNCH',
        targetSlot,
        senderName: state.currentUser?.name || 'Собутыльник'
      });
      ui.toast('🪰 Муха полетела к выбранному собутыльнику!', 'success');
    }
  });

  document.getElementById('game-cowboy-btn')?.addEventListener('click', () => {
    ui.closeAllDrawers();
    games.startCowboyDuel({
      initiator: true,
      mySlot: state.currentUser?.slot,
      myName: state.currentUser?.name,
      botActive: webrtc.bot.active
    });
  });

  document.getElementById('game-breath-btn')?.addEventListener('click', () => {
    ui.closeAllDrawers();
    games.startBreathalyzer({
      stream: state.rawStream,
      mySlot: state.currentUser?.slot,
      myName: state.currentUser?.name,
      initiator: true
    });
  });

  document.getElementById('game-polygraph-btn')?.addEventListener('click', () => {
    const sel = document.getElementById('ar-target-select');
    const targetName = sel?.selectedOptions?.[0]?.textContent || 'Собутыльник';
    ui.closeAllDrawers();
    games.startPolygraph({ targetName, initiator: true });
  });

  document.getElementById('game-helicopters-btn')?.addEventListener('click', () => {
    const targetSlot = Number(document.getElementById('ar-target-select')?.value || state.currentUser?.slot);
    if (targetSlot === state.currentUser?.slot) {
      vision.triggerHelicopters(10000);
      ui.toast('🚁 Поймал вертолёты на 10 секунд! Держись за стол!', 'info');
    } else {
      webrtc.sendTo(targetSlot, { type: 'GAME_HELICOPTERS', targetSlot });
      ui.toast('🚁 Вертолёты отправлены другу на 10 секунд!', 'success');
    }
  });

  document.getElementById('game-helmet-btn')?.addEventListener('click', e => {
    const on = vision.toggleBeerHelmet();
    e.currentTarget.textContent = on ? '🪖 Снять пивную каску' : '🪖 Надеть пивную каску';
    e.currentTarget.classList.toggle('btn--primary', on);
  });

  // --- Саундборд ---
  document.querySelectorAll('[data-sfx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sfx = btn.dataset.sfx;
      sound.playSoundboard(sfx);
      webrtc.broadcast({ type: 'FX_SOUND', sfx, author: state.currentUser?.name });
    });
  });

  document.getElementById('master-volume-slider')?.addEventListener('input', e => {
    const val = Number(e.target.value) / 100;
    sound.setVolume(val);
    state.settings = storage.saveSettings({ volume: val });
  });

  document.getElementById('master-mute-btn')?.addEventListener('click', () => {
    const nextMuted = !state.settings.muted;
    sound.setMuted(nextMuted);
    state.settings = storage.saveSettings({ muted: nextMuted });
    updateMuteButtonUI();
  });

  // Входящий звонок
  document.getElementById('incoming-accept-btn')?.addEventListener('click', async () => {
    const call = state.pendingIncomingCall;
    state.pendingIncomingCall = null;
    sound.stopRingtone();
    ui.closeModal('modal-incoming-call');
    if (!call) return;
    const stream = await ensureLocalMedia();
    sound.playCallConnected();
    await enterCallRoom();
    webrtc.answerCall(call, stream);
  });

  document.getElementById('incoming-decline-btn')?.addEventListener('click', () => {
    sound.stopRingtone();
    if (state.pendingIncomingCall) {
      try { state.pendingIncomingCall.close(); } catch { /* noop */ }
      state.pendingIncomingCall = null;
    }
    ui.closeModal('modal-incoming-call');
    ui.toast('Звонок отклонён (видимо, ещё не налито).', 'info');
  });
}

function updateMuteButtonUI() {
  const btn = document.getElementById('master-mute-btn');
  if (!btn) return;
  btn.textContent = state.settings.muted ? '🔇 Звук выключен' : '🔊 Звук включён';
}

// ==================== 8. ЧАТ КЛУБА ====================
function bindChatEvents() {
  const handleSend = (inputEl) => {
    const text = inputEl.value.trim();
    if (!text || !state.currentUser) return;
    inputEl.value = '';
    const msg = {
      type: 'CHAT_MSG',
      id: `${state.currentUser.slot}-${Date.now()}`,
      fromSlot: state.currentUser.slot,
      authorName: state.currentUser.name,
      authorAvatar: state.currentUser.avatar,
      text,
      ts: Date.now()
    };
    const list = storage.appendChatMessage(msg);
    ui.renderChatMessages(list, state.currentUser.slot);
    webrtc.broadcast(msg);
  };

  document.getElementById('lobby-chat-form')?.addEventListener('submit', e => {
    e.preventDefault();
    handleSend(document.getElementById('lobby-chat-input'));
  });

  document.getElementById('call-chat-form')?.addEventListener('submit', e => {
    e.preventDefault();
    handleSend(document.getElementById('call-chat-input'));
  });

  document.addEventListener('click', e => {
    const chip = e.target.closest('[data-quick-toast]');
    if (!chip || !state.currentUser) return;
    const msg = {
      type: 'CHAT_MSG',
      id: `${state.currentUser.slot}-${Date.now()}`,
      fromSlot: state.currentUser.slot,
      authorName: state.currentUser.name,
      authorAvatar: state.currentUser.avatar,
      text: chip.dataset.quickToast,
      ts: Date.now()
    };
    const list = storage.appendChatMessage(msg);
    ui.renderChatMessages(list, state.currentUser.slot);
    webrtc.broadcast(msg);
    sound.playGlassClink();
  });
}

// ==================== 9. СОБЫТИЯ WEBRTC / DATACHANNEL ====================
function bindWebRTCEvents() {
  webrtc.on('status', ({ state: st, message }) => {
    if (st === 'warning' || st === 'error') {
      ui.toast(message, 'error');
    }
  });

  webrtc.on('presence-change', () => {
    refreshLobbyUI();
  });

  webrtc.on('peer-connected', ({ slot }) => {
    // Автоматический обмен базой аккаунтов, таймером сессии и счётчиками выпитого по DataChannel
    webrtc.sendTo(slot, {
      type: 'SYNC_ACCOUNTS',
      accounts: storage.getAccounts(),
      sessionStartedAt: state.sessionStartedAt,
      drinks: Array.from(state.drinksMap.entries())
    });
  });

  webrtc.on('incoming-call', ({ call, fromSlot, metadata }) => {
    // Если уже в звонке — автоматически подключаем 3-го/4-го в сетку 2x2!
    if (state.inCall && state.processedStream) {
      sound.playCallConnected();
      webrtc.answerCall(call, state.processedStream);
      ui.toast(`🍻 ${metadata.name || `Слот #${fromSlot}`} ворвался в звонок!`, 'success');
      return;
    }

    state.pendingIncomingCall = call;
    const acc = storage.getAccounts().find(a => a.slot === fromSlot);
    document.getElementById('incoming-caller-avatar').textContent = metadata.avatar || acc?.avatar || '🍺';
    document.getElementById('incoming-caller-name').textContent = metadata.name || acc?.name || `Собутыльник #${fromSlot}`;
    ui.openModal('modal-incoming-call');
    sound.startSkypeIncoming();
  });

  webrtc.on('remote-stream', () => {
    sound.stopRingtone();
    sound.playCallConnected();
    if (state.inCall) renderActiveCallGrid();
  });

  webrtc.on('remote-stream-ended', () => {
    if (state.inCall) renderActiveCallGrid();
  });

  webrtc.on('data', ({ fromSlot, payload }) => {
    if (!payload || !payload.type) return;

    switch (payload.type) {
      case 'SYNC_ACCOUNTS': {
        if (Array.isArray(payload.accounts)) {
          storage.mergeRemoteAccounts(payload.accounts);
          refreshLobbyUI();
        }
        if (payload.sessionStartedAt && (!state.sessionStartedAt || payload.sessionStartedAt < state.sessionStartedAt)) {
          state.sessionStartedAt = payload.sessionStartedAt;
          if (state.inCall) ui.startSessionHud(state.sessionStartedAt);
        }
        if (Array.isArray(payload.drinks)) {
          for (const [s, c] of payload.drinks) {
            state.drinksMap.set(Number(s), Math.max(state.drinksMap.get(Number(s)) || 0, Number(c)));
          }
          ui.updateDrinkTotals(state.drinksMap);
          if (state.inCall) renderActiveCallGrid();
        }
        break;
      }

      case 'CHAT_MSG': {
        const list = storage.appendChatMessage(payload);
        ui.renderChatMessages(list, state.currentUser?.slot);
        ui.toast(`💬 ${payload.authorName}: ${payload.text.slice(0, 60)}`, 'info');
        break;
      }

      case 'DRINK_INC': {
        state.drinksMap.set(Number(payload.slot), Number(payload.count));
        sound.playCanOpen();
        ui.updateDrinkTotals(state.drinksMap);
        if (state.inCall) renderActiveCallGrid();
        break;
      }

      case 'FX_CLINK':
        games.triggerClink(false);
        break;

      case 'FX_SOUND':
        sound.playSoundboard(payload.sfx);
        if (payload.author) ui.toast(`🔊 ${payload.author} врубил звук!`, 'info');
        break;

      case 'GAME_BOTTLE_SCORE': {
        const el = document.getElementById('games-bottle-score');
        if (el) el.textContent = String(payload.score);
        break;
      }

      case 'GAME_FLY_LAUNCH':
        if (!payload.targetSlot || payload.targetSlot === state.currentUser?.slot) {
          games.launchFlyOnMe(payload.senderName || 'Друг');
        }
        break;

      case 'GAME_FLY_SWATTED':
        ui.toast(`✋ ${payload.byName || 'Собутыльник'} прихлопнул муху!`, 'info');
        break;

      case 'GAME_COWBOY_PREPARE':
        games.cowboy.mySlot = state.currentUser?.slot;
        games.cowboy.myName = state.currentUser?.name;
        games.onRemoteCowboyPrepare(payload.fireInMs);
        break;

      case 'GAME_COWBOY_SHOT':
        games.finishCowboyDuel(payload);
        break;

      case 'GAME_BREATH_START':
        games.startBreathalyzer({
          stream: state.rawStream,
          mySlot: state.currentUser?.slot,
          myName: state.currentUser?.name,
          initiator: false
        });
        break;

      case 'GAME_BREATH_RESULT':
        games.addRemoteBreathResult(payload);
        break;

      case 'GAME_POLYGRAPH_SCAN':
        games.startPolygraph({
          targetName: payload.targetName,
          verdictIndex: payload.verdictIndex,
          initiator: false
        });
        break;

      case 'GAME_HELICOPTERS':
        if (!payload.targetSlot || payload.targetSlot === state.currentUser?.slot) {
          vision.triggerHelicopters(10000);
          ui.toast('🚁 Тебе подкрутили «Вертолёты» на 10 секунд! Держись!', 'info');
        }
        break;
    }
  });
}

// Старт приложения
document.addEventListener('DOMContentLoaded', bootstrap);
