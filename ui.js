// AlcoSkype 2.0 Pro — UI-менеджер: экраны, пузырьки бара, «Ящик пива», сетка звонка, PiP-драг, HUD-часы

import {
  AVATARS,
  THEMES,
  BACKGROUNDS,
  QUICK_TOASTS,
  GITHUB_DEPLOY_GUIDE,
  getCityCaption,
  getDrinkStage
} from './config.js';
import { sound } from './sound.js';

export class UIManager {
  constructor() {
    this.bubblesRaf = null;
    this.clocksTimer = null;
    this.sessionStartedAt = null;
    this.selectedAvatar = AVATARS[0];
    this.pipDragBound = false;
  }

  initBaseUI(settings) {
    this.applyTheme(settings.theme);
    this.populateThemeSelects(settings.theme);
    this.renderAvatarPicker();
    this.renderBeerCrate();
    this.renderQuickToasts();
    this.renderBgGrids('original');
    const guideEl = document.getElementById('settings-github-guide');
    if (guideEl) guideEl.textContent = GITHUB_DEPLOY_GUIDE;
    this.setupDraggablePiP();
    this.setupModalClosers();
    this.startBarBubbles();
  }

  applyTheme(themeId) {
    const valid = THEMES.some(t => t.id === themeId) ? themeId : 'bar';
    document.documentElement.setAttribute('data-theme', valid);
    document.querySelectorAll('.theme-select').forEach(sel => {
      sel.value = valid;
    });
  }

  populateThemeSelects(currentTheme) {
    document.querySelectorAll('.theme-select').forEach(sel => {
      sel.innerHTML = THEMES.map(
        t => `<option value="${t.id}" ${t.id === currentTheme ? 'selected' : ''}>${t.name}</option>`
      ).join('');
    });
  }

  showScreen(name) {
    document.querySelectorAll('.screen').forEach(el => {
      el.classList.toggle('screen--active', el.id === `screen-${name}`);
    });
    if (name === 'login' || name === 'gate') {
      this.startBarBubbles();
    } else {
      this.stopBarBubbles();
    }
  }

  openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }

  closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  }

  closeAllModals() {
    document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.add('hidden'));
  }

  setupModalClosers() {
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-close-modal');
        if (target) this.closeModal(target);
      });
    });
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', e => {
        if (e.target === backdrop && backdrop.dataset.dismissible !== 'false') {
          backdrop.classList.add('hidden');
        }
      });
    });
  }

  toast(message, type = 'info') {
    const box = document.getElementById('toast-container');
    if (!box) return;
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.textContent = message;
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add('toast--show'));
    setTimeout(() => {
      el.classList.remove('toast--show');
      setTimeout(() => el.remove(), 260);
    }, 3600);
  }

  // --- Анимированный фон ночного бара (пузырьки пива) ---
  startBarBubbles() {
    const canvas = document.getElementById('bar-bubbles-canvas');
    if (!canvas || this.bubblesRaf) return;
    const ctx = canvas.getContext('2d');
    const bubbles = Array.from({ length: 46 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 2 + Math.random() * 7,
      speed: 0.0005 + Math.random() * 0.0016,
      wobble: Math.random() * Math.PI * 2
    }));

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();

    const draw = () => {
      if (!this.bubblesRaf) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const theme = document.documentElement.getAttribute('data-theme');
      const color = theme === 'cyberpunk'
        ? 'rgba(0, 240, 255, 0.25)'
        : theme === 'skype2010'
          ? 'rgba(0, 175, 240, 0.22)'
          : 'rgba(251, 191, 36, 0.26)';

      for (const b of bubbles) {
        b.y -= b.speed;
        b.wobble += 0.025;
        if (b.y < -0.05) {
          b.y = 1.05;
          b.x = Math.random();
        }
        const px = b.x * w + Math.sin(b.wobble) * 12;
        const py = b.y * h;
        ctx.beginPath();
        ctx.arc(px, py, b.r, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.arc(px - b.r * 0.3, py - b.r * 0.3, b.r * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
      this.bubblesRaf = requestAnimationFrame(draw);
    };

    this.bubblesRaf = requestAnimationFrame(draw);
  }

  stopBarBubbles() {
    if (this.bubblesRaf) {
      cancelAnimationFrame(this.bubblesRaf);
      this.bubblesRaf = null;
    }
  }

  // --- Ящик пива 3x3 (крышки 1..9) ---
  renderBeerCrate() {
    const crate = document.getElementById('beer-crate');
    if (!crate) return;
    crate.innerHTML = '';
    for (let d = 1; d <= 9; d++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'beer-can';
      btn.dataset.digit = String(d);
      btn.setAttribute('aria-label', `Банка пива цифра ${d}`);
      btn.innerHTML = `
        <span class="beer-can__rim">
          <span class="beer-can__tab"></span>
          <span class="beer-can__hole"></span>
          <span class="beer-can__digit">${d}</span>
        </span>
      `;
      crate.appendChild(btn);
    }
  }

  animateCanPop(digit) {
    const btn = document.querySelector(`.beer-can[data-digit="${digit}"]`);
    if (!btn) return;
    btn.classList.remove('beer-can--pop');
    void btn.offsetWidth;
    btn.classList.add('beer-can--pop');
    setTimeout(() => btn.classList.remove('beer-can--pop'), 420);
  }

  updatePinDisplay(pinBuffer, statusText = '', isError = false) {
    const dots = document.getElementById('pin-dots');
    if (dots) {
      dots.innerHTML = [0, 1, 2, 3].map(i => {
        const filled = i < pinBuffer.length;
        return `<span class="pin-dot ${filled ? 'pin-dot--filled' : ''} ${isError ? 'pin-dot--error' : ''}">${filled ? '🍺' : ''}</span>`;
      }).join('');
    }
    const status = document.getElementById('pin-status');
    if (status) {
      status.textContent = statusText;
      status.classList.toggle('text-danger', isError);
    }
  }

  updateLoginAccountsInfo(accounts) {
    const createBtn = document.getElementById('open-create-modal-btn');
    const hint = document.getElementById('login-accounts-hint');
    const slotsLeft = Math.max(0, 4 - accounts.length);
    if (createBtn) {
      createBtn.disabled = slotsLeft === 0;
      createBtn.textContent = slotsLeft > 0
        ? `Создать нового собутыльника (свободно ${slotsLeft} из 4)`
        : 'Бар полон (4 из 4 аккаунтов)';
    }
    if (hint) {
      hint.textContent = accounts.length === 0
        ? 'Пока никто не прописался в баре — создай первого собутыльника ниже!'
        : `В баре прописано собутыльников: ${accounts.length} из 4 · Введи свой 4-значный PIN по банкам`;
    }
    const modalSlots = document.getElementById('create-slots-left');
    if (modalSlots) {
      modalSlots.textContent = `Свободно мест у стойки: ${slotsLeft} из 4`;
    }
  }

  renderAvatarPicker() {
    const grid = document.getElementById('create-avatar-grid');
    if (!grid) return;
    grid.innerHTML = AVATARS.map((av, idx) => `
      <button type="button" class="avatar-opt ${idx === 0 ? 'avatar-opt--active' : ''}" data-avatar="${av}">
        ${av}
      </button>
    `).join('');
    grid.addEventListener('click', e => {
      const btn = e.target.closest('.avatar-opt');
      if (!btn) return;
      this.selectedAvatar = btn.dataset.avatar;
      grid.querySelectorAll('.avatar-opt').forEach(el => el.classList.toggle('avatar-opt--active', el === btn));
    });
  }

  renderSupportAccounts(accounts, onDelete) {
    const list = document.getElementById('support-accounts-list');
    if (!list) return;
    if (!accounts.length) {
      list.innerHTML = '<div class="empty-note">Аккаунтов пока нет. Бар пустой.</div>';
      return;
    }
    list.innerHTML = accounts.map(acc => `
      <div class="support-row">
        <div class="support-row__info">
          <span class="support-row__avatar">${acc.avatar}</span>
          <div>
            <div class="support-row__name">${this.escapeHtml(acc.name)} · Слот #${acc.slot}</div>
            <div class="support-row__pin">PIN-код: <strong class="mono">${acc.pin}</strong></div>
          </div>
        </div>
        <button type="button" class="btn btn--danger btn--sm" data-delete-slot="${acc.slot}">Удалить</button>
      </div>
    `).join('');

    list.querySelectorAll('[data-delete-slot]').forEach(btn => {
      btn.addEventListener('click', () => onDelete(Number(btn.dataset.deleteSlot)));
    });
  }

  // --- Лобби ---
  renderLobby({ currentUser, accounts, onlineSlots, cloudEnabled, onCallSlot }) {
    const badge = document.getElementById('lobby-user-badge');
    if (badge && currentUser) {
      badge.innerHTML = `<span class="user-av">${currentUser.avatar}</span> <span>${this.escapeHtml(currentUser.name)}</span> <span class="meta-sep">·</span> <span class="muted">Слот #${currentUser.slot}</span>`;
    }
    const syncEl = document.getElementById('lobby-sync-mode');
    if (syncEl) {
      syncEl.textContent = cloudEnabled
        ? 'Синхронизация: Firebase RTDB + PeerJS'
        : 'Синхронизация: PeerJS DataChannel (локально + P2P)';
    }

    const grid = document.getElementById('lobby-members-grid');
    if (!grid) return;

    const slotsHtml = [1, 2, 3, 4].map(slot => {
      const acc = accounts.find(a => a.slot === slot);
      if (!acc) {
        return `
          <div class="member-card member-card--empty">
            <div class="member-card__avatar">🪑</div>
            <div class="member-card__body">
              <div class="member-card__name">Свободный стул #${slot}</div>
              <div class="member-card__status muted">Ждёт нового собутыльника</div>
            </div>
          </div>
        `;
      }
      const isMe = currentUser && acc.slot === currentUser.slot;
      const isOnline = isMe || onlineSlots.has(acc.slot);
      return `
        <div class="member-card ${isOnline ? 'member-card--online' : ''}">
          <div class="member-card__avatar">${acc.avatar}</div>
          <div class="member-card__body">
            <div class="member-card__name">
              ${this.escapeHtml(acc.name)} ${isMe ? '<span class="muted">(это ты)</span>' : ''}
            </div>
            <div class="member-card__status ${isOnline ? 'status-online' : 'status-offline'}">
              ${isOnline ? 'Готов бухать' : 'Трезвеет (оффлайн)'}
            </div>
          </div>
          ${!isMe ? `
            <button type="button" class="btn ${isOnline ? 'btn--primary' : 'btn--ghost'} btn--sm" data-call-slot="${acc.slot}">
              Позвонить
            </button>
          ` : ''}
        </div>
      `;
    }).join('');

    grid.innerHTML = slotsHtml;
    grid.querySelectorAll('[data-call-slot]').forEach(btn => {
      btn.addEventListener('click', () => onCallSlot(Number(btn.dataset.callSlot)));
    });
  }

  // --- Виртуальные фоны ---
  renderBgGrids(activeId) {
    ['device-bg-grid', 'call-bg-grid'].forEach(gridId => {
      const el = document.getElementById(gridId);
      if (!el) return;
      el.innerHTML = BACKGROUNDS.map(bg => `
        <button type="button" class="bg-chip ${bg.id === activeId ? 'bg-chip--active' : ''}" data-bg-mode="${bg.id}">
          <span>${bg.icon}</span>
          <span>${bg.name}</span>
        </button>
      `).join('');
    });
  }

  highlightActiveBg(mode) {
    document.querySelectorAll('[data-bg-mode]').forEach(btn => {
      btn.classList.toggle('bg-chip--active', btn.dataset.bgMode === mode);
    });
  }

  // --- Сетка видеозвонка (2 чел: fullscreen + PiP; 3-4 чел: сетка 2x2) ---
  renderCallVideos({ localStream, currentUser, remoteEntries, drinksMap, onAddDrink }) {
    const stage = document.getElementById('video-stage');
    const remoteContainer = document.getElementById('remote-videos-container');
    const localWrap = document.getElementById('local-pip-wrap');
    const localVideo = document.getElementById('local-video');
    const localName = document.getElementById('local-tile-name');
    const localDrinks = document.getElementById('local-tile-drinks');

    if (!stage || !remoteContainer || !localWrap || !localVideo) return;

    if (localVideo.srcObject !== localStream) {
      localVideo.srcObject = localStream;
    }
    if (localName && currentUser) {
      localName.textContent = `${currentUser.avatar} ${currentUser.name} (ты)`;
    }
    const myDrinks = drinksMap.get(currentUser?.slot) || 0;
    if (localDrinks) {
      localDrinks.textContent = `${myDrinks} 🍺`;
    }

    const totalParticipants = 1 + remoteEntries.length;
    const isGrid = totalParticipants >= 3;
    stage.classList.toggle('stage--grid', isGrid);
    stage.classList.toggle('stage--duo', !isGrid);

    // Сбрасываем смещение PiP при переходе в сетку 2x2
    if (isGrid) {
      localWrap.style.left = '';
      localWrap.style.top = '';
      localWrap.style.right = '';
      localWrap.style.bottom = '';
    }

    // Пустое состояние, если ждём подключения друзей
    if (remoteEntries.length === 0) {
      remoteContainer.innerHTML = `
        <div class="stage-waiting">
          <div class="stage-waiting__icon">🍻</div>
          <h2>Бар открыт — ждём собутыльников</h2>
          <p>Позови друзей из лобби или нажми кнопку <strong>«Бот»</strong> внизу, чтобы проверить AR-игры прямо сейчас.</p>
        </div>
      `;
    } else {
      // Перерисовываем удалённые плитки без мигания, сохраняя существующие video элементы
      const activeSlots = new Set(remoteEntries.map(e => String(e.slot)));
      remoteContainer.querySelectorAll('.video-tile--remote').forEach(tile => {
        if (!activeSlots.has(tile.dataset.slot)) tile.remove();
      });
      const waiting = remoteContainer.querySelector('.stage-waiting');
      if (waiting) waiting.remove();

      for (const entry of remoteEntries) {
        let tile = remoteContainer.querySelector(`.video-tile--remote[data-slot="${entry.slot}"]`);
        const count = drinksMap.get(entry.slot) || 0;
        if (!tile) {
          tile = document.createElement('div');
          tile.className = 'video-tile video-tile--remote';
          tile.dataset.slot = String(entry.slot);
          tile.innerHTML = `
            <video autoplay playsinline></video>
            <div class="video-tile__footer">
              <span class="video-tile__label"></span>
              <div class="video-tile__drinks-wrap">
                <span class="video-tile__drinks mono"></span>
                <button type="button" class="btn-drink-mini" data-drink-slot="${entry.slot}">+1 🍺</button>
              </div>
            </div>
          `;
          tile.querySelector('.btn-drink-mini').addEventListener('click', () => onAddDrink(entry.slot));
          remoteContainer.appendChild(tile);
        }
        const vid = tile.querySelector('video');
        if (vid.srcObject !== entry.stream) {
          vid.srcObject = entry.stream;
        }
        tile.querySelector('.video-tile__label').textContent = `${entry.avatar} ${entry.name}`;
        tile.querySelector('.video-tile__drinks').textContent = `${count} 🍺`;
      }
    }

    // Обновляем список целей для AR-троллинга (Муха / Полиграф / Вертолёты)
    this.updateArTargetSelect(currentUser, remoteEntries);
  }

  updateArTargetSelect(currentUser, remoteEntries) {
    const sel = document.getElementById('ar-target-select');
    if (!sel) return;
    const prev = sel.value;
    const options = [];
    for (const r of remoteEntries) {
      options.push({ value: String(r.slot), label: `${r.avatar} ${r.name}` });
    }
    if (currentUser) {
      options.push({ value: String(currentUser.slot), label: `${currentUser.avatar} ${currentUser.name} (на себя)` });
    }
    sel.innerHTML = options.map(o => `<option value="${o.value}">${this.escapeHtml(o.label)}</option>`).join('');
    if (options.some(o => o.value === prev)) {
      sel.value = prev;
    }
  }

  // --- Перетаскиваемое окно своего видео (PiP) ---
  setupDraggablePiP() {
    if (this.pipDragBound) return;
    const pip = document.getElementById('local-pip-wrap');
    const stage = document.getElementById('video-stage');
    if (!pip || !stage) return;
    this.pipDragBound = true;

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let origLeft = 0;
    let origTop = 0;

    pip.addEventListener('pointerdown', e => {
      if (stage.classList.contains('stage--grid')) return;
      if (e.target.closest('button')) return;
      dragging = true;
      pip.setPointerCapture(e.pointerId);
      const rect = pip.getBoundingClientRect();
      const sRect = stage.getBoundingClientRect();
      origLeft = rect.left - sRect.left;
      origTop = rect.top - sRect.top;
      startX = e.clientX;
      startY = e.clientY;
      pip.classList.add('is-dragging');
    });

    pip.addEventListener('pointermove', e => {
      if (!dragging) return;
      const sRect = stage.getBoundingClientRect();
      const pRect = pip.getBoundingClientRect();
      const nextLeft = Math.max(8, Math.min(sRect.width - pRect.width - 8, origLeft + (e.clientX - startX)));
      const nextTop = Math.max(8, Math.min(sRect.height - pRect.height - 8, origTop + (e.clientY - startY)));
      pip.style.right = 'auto';
      pip.style.bottom = 'auto';
      pip.style.left = `${nextLeft}px`;
      pip.style.top = `${nextTop}px`;
    });

    const stop = () => {
      dragging = false;
      pip.classList.remove('is-dragging');
    };
    pip.addEventListener('pointerup', stop);
    pip.addEventListener('pointercancel', stop);
  }

  // --- Двойные часы Иркутск / Минск и общий таймер пьянки ---
  startSessionHud(startedAt) {
    this.sessionStartedAt = startedAt || Date.now();
    this.stopSessionHud();
    const update = () => {
      const now = new Date();
      const fmtIrk = new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Asia/Irkutsk',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const fmtMsk = new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Europe/Minsk',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      const irkTime = fmtIrk.format(now);
      const mskTime = fmtMsk.format(now);
      const irkHour = Number(irkTime.split(':')[0]) || 0;
      const mskHour = Number(mskTime.split(':')[0]) || 0;

      const setTxt = (id, txt) => {
        const el = document.getElementById(id);
        if (el) el.textContent = txt;
      };

      setTxt('hud-irkutsk-time', irkTime);
      setTxt('hud-irkutsk-caption', getCityCaption('irkutsk', irkHour));
      setTxt('hud-minsk-time', mskTime);
      setTxt('hud-minsk-caption', getCityCaption('minsk', mskHour));

      const elapsed = Math.max(0, Math.floor((Date.now() - this.sessionStartedAt) / 1000));
      const hh = String(Math.floor(elapsed / 3600)).padStart(2, '0');
      const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
      const ss = String(elapsed % 60).padStart(2, '0');
      setTxt('hud-session-timer', `${hh}:${mm}:${ss}`);

      const stage = getDrinkStage(elapsed);
      setTxt('hud-drink-stage', stage.title);
      setTxt('hud-drink-subtitle', stage.subtitle);
    };
    update();
    this.clocksTimer = setInterval(update, 1000);
  }

  stopSessionHud() {
    if (this.clocksTimer) {
      clearInterval(this.clocksTimer);
      this.clocksTimer = null;
    }
  }

  updateDrinkTotals(drinksMap) {
    let totalMugs = 0;
    for (const v of drinksMap.values()) totalMugs += Number(v || 0);
    const liters = (totalMugs * 0.5).toFixed(1);
    const mugsEl = document.getElementById('hud-total-mugs');
    const litEl = document.getElementById('hud-total-liters');
    if (mugsEl) {
      mugsEl.textContent = `${totalMugs} кружек`;
      mugsEl.classList.remove('pop-bump');
      void mugsEl.offsetWidth;
      mugsEl.classList.add('pop-bump');
    }
    if (litEl) litEl.textContent = `${liters} л`;
  }

  // --- Боковые шторки во время звонка ---
  toggleCallDrawer(drawerId) {
    const all = ['drawer-games', 'drawer-bg', 'drawer-sound', 'drawer-chat'];
    for (const id of all) {
      const el = document.getElementById(id);
      if (!el) continue;
      if (id === drawerId) {
        el.classList.toggle('drawer--open');
      } else {
        el.classList.remove('drawer--open');
      }
    }
  }

  closeAllDrawers() {
    document.querySelectorAll('.call-drawer').forEach(el => el.classList.remove('drawer--open'));
  }

  // --- Чат и быстрые тосты ---
  renderQuickToasts() {
    ['lobby-quick-toasts', 'call-quick-toasts'].forEach(id => {
      const wrap = document.getElementById(id);
      if (!wrap) return;
      wrap.innerHTML = QUICK_TOASTS.map(t => `
        <button type="button" class="toast-chip" data-quick-toast="${this.escapeHtml(t)}">${this.escapeHtml(t)}</button>
      `).join('');
    });
  }

  renderChatMessages(messages, mySlot) {
    ['lobby-chat-messages', 'call-chat-messages'].forEach(id => {
      const box = document.getElementById(id);
      if (!box) return;
      if (!messages.length) {
        box.innerHTML = '<div class="empty-note">Чат чист, как стёклышко. Заряди первый тост!</div>';
        return;
      }
      box.innerHTML = messages.map(m => {
        const mine = m.fromSlot === mySlot;
        const time = new Date(m.ts || Date.now()).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        return `
          <div class="chat-msg ${mine ? 'chat-msg--mine' : ''}">
            <div class="chat-msg__head">
              <span>${m.authorAvatar || '🍺'} ${this.escapeHtml(m.authorName || 'Гость')}</span>
              <span class="mono muted">${time}</span>
            </div>
            <div class="chat-msg__text">${this.escapeHtml(m.text)}</div>
          </div>
        `;
      }).join('');
      box.scrollTop = box.scrollHeight;
    });
  }

  escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

export const ui = new UIManager();
