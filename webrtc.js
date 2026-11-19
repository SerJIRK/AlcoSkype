// AlcoSkype 2.0 Pro — WebRTC / PeerJS Mesh, ICE/TURN-диагностика и Собутыльник-бот

import { DEFAULT_CONFIG, BOT_REPLIES, sanitizeClubKey, buildIceServers } from './config.js';

export function makePeerId(clubKey, slot) {
  return `${DEFAULT_CONFIG.peerPrefix}-${sanitizeClubKey(clubKey)}-slot-${slot}`;
}

export function extractSlotFromPeerId(peerId) {
  const m = String(peerId || '').match(/-slot-(\d+)$/);
  return m ? Number(m[1]) : null;
}

// Тест соединения (ICE / STUN / TURN) — проверяет прохождение relay-кандидатов
export async function testIceConnection(customTurn) {
  const iceServers = buildIceServers(customTurn);
  const found = { host: false, srflx: false, relay: false, candidates: [] };

  return new Promise(resolve => {
    let pc;
    try {
      pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 2 });
    } catch (err) {
      resolve({
        ok: false,
        relay: false,
        srflx: false,
        summary: `Ошибка инициализации WebRTC: ${err.message}`
      });
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try { pc.close(); } catch { /* noop */ }
      let summary = '';
      if (found.relay) {
        summary = 'Отлично! TURN-реле (relay) работает — связь пробьёт любой NAT, Wi-Fi и мобильный интернет между Иркутском и Минском.';
      } else if (found.srflx) {
        summary = 'STUN работает, но публичный TURN-сервер не ответил. В обычных сетях связь пройдёт, но для жёсткого мобильного NAT укажи свой TURN.';
      } else if (found.host) {
        summary = 'Найдены только локальные адреса. Проверь интернет или укажи свой TURN-сервер на порту 443/TCP.';
      } else {
        summary = 'Не удалось собрать ICE-кандидаты. Возможно, браузер или VPN блокирует WebRTC.';
      }
      resolve({
        ok: found.relay || found.srflx,
        relay: found.relay,
        srflx: found.srflx,
        host: found.host,
        count: found.candidates.length,
        summary
      });
    };

    const timer = setTimeout(finish, 5000);

    pc.onicecandidate = e => {
      if (!e.candidate) {
        clearTimeout(timer);
        finish();
        return;
      }
      const c = e.candidate.candidate || '';
      found.candidates.push(c);
      if (c.includes(' typ host')) found.host = true;
      if (c.includes(' typ srflx')) found.srflx = true;
      if (c.includes(' typ relay')) {
        found.relay = true;
        clearTimeout(timer);
        finish();
      }
    };

    pc.createDataChannel('ice-probe');
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .catch(() => {
        clearTimeout(timer);
        finish();
      });
  });
}

// Виртуальный «Собутыльник-бот» с процедурным 24fps видеопотоком для теста в одиночку
export class VirtualBotPeer {
  constructor() {
    this.slot = 99;
    this.id = 'bot-petrovich';
    this.name = 'Бот-Петрович';
    this.avatar = '🤖';
    this.active = false;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 640;
    this.canvas.height = 480;
    this.ctx = this.canvas.getContext('2d');
    this.stream = null;
    this.rafId = null;
    this.mood = 'chill'; // 'chill' | 'cheers' | 'fly' | 'shot' | 'scan' | 'helicopter'
    this.moodUntil = 0;
    this.bubbleText = '';
    this.bubbleUntil = 0;
    this.t = 0;
    this.drinks = 1;
  }

  start() {
    if (this.active) return this.stream;
    this.active = true;
    this.mood = 'chill';
    this.say('Здарова! Наливай, я уже в эфире 🍺');
    const loop = () => {
      if (!this.active) return;
      this.t += 0.04;
      this.drawFrame();
      this.rafId = requestAnimationFrame(loop);
    };
    loop();
    this.stream = this.canvas.captureStream(24);
    return this.stream;
  }

  stop() {
    this.active = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }

  setMood(mood, durationMs = 4500, text = '') {
    this.mood = mood;
    this.moodUntil = Date.now() + durationMs;
    if (text) this.say(text, durationMs);
  }

  say(text, durationMs = 4200) {
    this.bubbleText = text;
    this.bubbleUntil = Date.now() + durationMs;
  }

  randomReply() {
    return BOT_REPLIES[Math.floor(Math.random() * BOT_REPLIES.length)];
  }

  drawFrame() {
    const { ctx, canvas, t } = this;
    const w = canvas.width;
    const h = canvas.height;
    const now = Date.now();
    if (this.mood !== 'chill' && now > this.moodUntil) {
      this.mood = 'chill';
    }

    ctx.save();
    if (this.mood === 'helicopter') {
      ctx.translate(w / 2, h / 2);
      ctx.rotate(Math.sin(t * 2.4) * 0.14);
      ctx.scale(1.06 + Math.sin(t * 3) * 0.04, 1.06 + Math.cos(t * 3) * 0.04);
      ctx.translate(-w / 2, -h / 2);
    }

    // Фон бара
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#1a110a');
    bg.addColorStop(0.6, '#2a180d');
    bg.addColorStop(1, '#120b07');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Полки с бутылками и боке-огни
    for (let i = 0; i < 8; i++) {
      const bx = 50 + i * 78;
      const by = 85 + Math.sin(t * 0.7 + i) * 4;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(245, 158, 11, 0.22)' : 'rgba(234, 88, 12, 0.18)';
      ctx.beginPath();
      ctx.arc(bx, by, 26 + (i % 3) * 8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Неоновая табличка сзади
    ctx.save();
    ctx.strokeStyle = '#f59e0b';
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur = 16;
    ctx.lineWidth = 2;
    ctx.strokeRect(420, 32, 185, 48);
    ctx.fillStyle = '#fde68a';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('BAR 24/7', 455, 63);
    ctx.restore();

    // Барная стойка
    ctx.fillStyle = '#3b2112';
    ctx.fillRect(0, h - 85, w, 85);
    ctx.fillStyle = '#5a321b';
    ctx.fillRect(0, h - 85, w, 10);

    // Тело собутыльника
    const bob = Math.sin(t * 1.6) * 6;
    const cx = w * 0.48;
    const cy = h * 0.56 + bob;

    // Плечи / рубашка
    ctx.fillStyle = '#1f2937';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 120, 125, 95, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(cx - 22, cy + 45);
    ctx.lineTo(cx + 22, cy + 45);
    ctx.lineTo(cx, cy + 120);
    ctx.closePath();
    ctx.fill();

    // Голова
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath();
    ctx.arc(cx, cy - 22, 68, 0, Math.PI * 2);
    ctx.fill();

    // Шапка / чуб
    ctx.fillStyle = '#3f2a1d';
    ctx.beginPath();
    ctx.arc(cx, cy - 42, 66, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();

    // Глаза (моргает каждые ~4 сек)
    const blink = Math.sin(t * 0.9) > 0.96;
    ctx.fillStyle = '#111827';
    if (blink) {
      ctx.fillRect(cx - 34, cy - 30, 18, 4);
      ctx.fillRect(cx + 16, cy - 30, 18, 4);
    } else {
      ctx.beginPath();
      ctx.arc(cx - 25, cy - 28, 8, 0, Math.PI * 2);
      ctx.arc(cx + 25, cy - 28, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - 22, cy - 31, 3, 0, Math.PI * 2);
      ctx.arc(cx + 28, cy - 31, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Усы и улыбка
    ctx.strokeStyle = '#3f2a1d';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 28, cy + 2);
    ctx.quadraticCurveTo(cx - 12, cy - 8, cx, cy);
    ctx.quadraticCurveTo(cx + 12, cy - 8, cx + 28, cy + 2);
    ctx.stroke();

    // Рот
    ctx.fillStyle = '#7f1d1d';
    ctx.beginPath();
    const mouthOpen = this.bubbleUntil > now ? 10 + Math.abs(Math.sin(t * 7)) * 9 : 6;
    ctx.ellipse(cx, cy + 16, 18, mouthOpen, 0, 0, Math.PI * 2);
    ctx.fill();

    // Пивная кружка в руке
    const mugLift = this.mood === 'cheers' ? -45 : Math.sin(t * 1.6) * 5;
    const mx = cx + 115;
    const my = cy + 38 + mugLift;
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(mx - 24, my - 35, 48, 68);
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 4;
    ctx.strokeRect(mx - 24, my - 35, 48, 68);
    // Ручка кружки
    ctx.beginPath();
    ctx.arc(mx + 24, my, 16, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    // Пена
    ctx.fillStyle = '#fffbeb';
    ctx.beginPath();
    ctx.arc(mx - 14, my - 36, 14, 0, Math.PI * 2);
    ctx.arc(mx, my - 40, 16, 0, Math.PI * 2);
    ctx.arc(mx + 14, my - 36, 13, 0, Math.PI * 2);
    ctx.fill();

    // Реакция на муху
    if (this.mood === 'fly') {
      const fx = cx + Math.cos(t * 7) * 32;
      const fy = cy - 24 + Math.sin(t * 9) * 20;
      ctx.fillStyle = '#09090b';
      ctx.beginPath();
      ctx.arc(fx, fy, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Реакция на выстрел ковбоев
    if (this.mood === 'shot') {
      ctx.fillStyle = 'rgba(220, 38, 38, 0.25)';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy - 10, 26, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Речевой пузырь бота
    if (this.bubbleText && now < this.bubbleUntil) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(24, 24, Math.min(w - 48, 380), 54, 14);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fef3c7';
      ctx.font = '600 15px sans-serif';
      ctx.fillText(this.bubbleText.slice(0, 44), 40, 56);
    }

    ctx.restore();
  }
}

// Менеджер P2P PeerJS Mesh
export class WebRTCManager {
  constructor() {
    this.peer = null;
    this.clubKey = '';
    this.mySlot = null;
    this.myAccount = null;
    this.customTurn = null;
    this.localStream = null;

    this.dataConns = new Map(); // slot -> DataConnection
    this.mediaCalls = new Map(); // slot -> MediaConnection
    this.remoteStreams = new Map(); // slot -> MediaStream
    this.onlineSlots = new Set();

    this.discoveryTimer = null;
    this.listeners = new Map();
    this.bot = new VirtualBotPeer();
  }

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(handler);
  }

  emit(event, payload) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try { fn(payload); } catch (e) { console.error('[WebRTC]', event, e); }
    }
  }

  isPeerJsLoaded() {
    return typeof window.Peer === 'function';
  }

  connect({ clubKey, account, customTurn }) {
    this.disconnect();
    this.clubKey = clubKey;
    this.mySlot = account.slot;
    this.myAccount = account;
    this.customTurn = customTurn;

    if (!this.isPeerJsLoaded()) {
      this.emit('status', { state: 'error', message: 'Библиотека PeerJS не загружена (проверь интернет).' });
      return;
    }

    const peerId = makePeerId(clubKey, account.slot);
    const iceServers = buildIceServers(customTurn);

    this.emit('status', { state: 'connecting', peerId });

    try {
      this.peer = new window.Peer(peerId, {
        debug: 1,
        config: {
          iceServers,
          iceTransportPolicy: 'all'
        }
      });
    } catch (err) {
      this.emit('status', { state: 'error', message: err.message });
      return;
    }

    this.peer.on('open', id => {
      this.emit('status', { state: 'ready', peerId: id });
      this.probeOtherSlots();
      this.discoveryTimer = setInterval(() => this.probeOtherSlots(), 10000);
    });

    this.peer.on('connection', conn => {
      this.registerDataConn(conn);
    });

    this.peer.on('call', call => {
      const fromSlot = extractSlotFromPeerId(call.peer);
      this.emit('incoming-call', { call, fromSlot, metadata: call.metadata || {} });
    });

    this.peer.on('disconnected', () => {
      this.emit('status', { state: 'reconnecting' });
      if (this.peer && !this.peer.destroyed) {
        try { this.peer.reconnect(); } catch { /* noop */ }
      }
    });

    this.peer.on('error', err => {
      // peer-unavailable — нормальный ответ при опросе оффлайн слотов
      if (err && err.type === 'peer-unavailable') return;
      if (err && err.type === 'unavailable-id') {
        this.emit('status', {
          state: 'warning',
          message: 'Этот аккаунт уже открыт в другой вкладке. Закрой старую вкладку или выбери другой слот.'
        });
        return;
      }
      this.emit('status', { state: 'warning', message: `PeerJS: ${err?.type || err?.message || 'ошибка'}` });
    });
  }

  disconnect() {
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = null;
    }
    this.hangupAll();
    for (const conn of this.dataConns.values()) {
      try { conn.close(); } catch { /* noop */ }
    }
    this.dataConns.clear();
    this.onlineSlots.clear();
    if (this.peer) {
      try { this.peer.destroy(); } catch { /* noop */ }
      this.peer = null;
    }
    this.stopBot();
  }

  probeOtherSlots() {
    if (!this.peer || this.peer.disconnected || this.peer.destroyed) return;
    for (let slot = 1; slot <= DEFAULT_CONFIG.maxAccounts; slot++) {
      if (slot === this.mySlot) continue;
      const existing = this.dataConns.get(slot);
      if (existing && existing.open) continue;
      const targetId = makePeerId(this.clubKey, slot);
      try {
        const conn = this.peer.connect(targetId, {
          reliable: true,
          metadata: { slot: this.mySlot, name: this.myAccount?.name }
        });
        this.registerDataConn(conn, slot);
      } catch { /* noop */ }
    }
  }

  registerDataConn(conn, knownSlot = null) {
    const slot = knownSlot || extractSlotFromPeerId(conn.peer);
    if (!slot || slot === this.mySlot) return;

    conn.on('open', () => {
      this.dataConns.set(slot, conn);
      this.onlineSlots.add(slot);
      this.emit('presence-change', { slot, online: true });
      this.emit('peer-connected', { slot, conn });
    });

    conn.on('data', data => {
      if (!data || typeof data !== 'object') return;
      this.emit('data', { fromSlot: slot, payload: data });
    });

    const handleClose = () => {
      if (this.dataConns.get(slot) === conn) {
        this.dataConns.delete(slot);
        this.onlineSlots.delete(slot);
        this.emit('presence-change', { slot, online: false });
      }
    };

    conn.on('close', handleClose);
    conn.on('error', handleClose);
  }

  sendTo(slot, payload) {
    if (slot === this.bot.slot && this.bot.active) {
      this.handleBotIncoming(payload);
      return true;
    }
    const conn = this.dataConns.get(slot);
    if (conn && conn.open) {
      try {
        conn.send({ ...payload, fromSlot: this.mySlot, ts: Date.now() });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  broadcast(payload) {
    for (const [slot, conn] of this.dataConns.entries()) {
      if (conn && conn.open) {
        try {
          conn.send({ ...payload, fromSlot: this.mySlot, ts: Date.now() });
        } catch { /* noop */ }
      }
    }
    if (this.bot.active) {
      this.handleBotIncoming(payload);
    }
  }

  setLocalStream(stream) {
    this.localStream = stream;
    // Заменяем видеотрек на лету в активных WebRTC-соединениях
    const videoTrack = stream ? stream.getVideoTracks()[0] : null;
    const audioTrack = stream ? stream.getAudioTracks()[0] : null;
    for (const call of this.mediaCalls.values()) {
      const pc = call.peerConnection;
      if (!pc) continue;
      pc.getSenders().forEach(sender => {
        if (sender.track && sender.track.kind === 'video' && videoTrack) {
          sender.replaceTrack(videoTrack).catch(() => {});
        }
        if (sender.track && sender.track.kind === 'audio' && audioTrack) {
          sender.replaceTrack(audioTrack).catch(() => {});
        }
      });
    }
  }

  callSlot(slot, stream) {
    if (!this.peer || !stream) return false;
    const targetId = makePeerId(this.clubKey, slot);
    try {
      const call = this.peer.call(targetId, stream, {
        metadata: {
          slot: this.mySlot,
          name: this.myAccount?.name || 'Друг',
          avatar: this.myAccount?.avatar || '🍺'
        }
      });
      this.attachMediaCall(call, slot);
      return true;
    } catch (err) {
      console.error('[WebRTC] callSlot failed:', err);
      return false;
    }
  }

  answerCall(call, stream) {
    const slot = extractSlotFromPeerId(call.peer);
    call.answer(stream);
    this.attachMediaCall(call, slot);
  }

  attachMediaCall(call, slot) {
    if (!slot) return;
    const prev = this.mediaCalls.get(slot);
    if (prev && prev !== call) {
      try { prev.close(); } catch { /* noop */ }
    }
    this.mediaCalls.set(slot, call);

    call.on('stream', remoteStream => {
      this.remoteStreams.set(slot, remoteStream);
      this.emit('remote-stream', { slot, stream: remoteStream });
    });

    const onEnd = () => {
      if (this.mediaCalls.get(slot) === call) {
        this.mediaCalls.delete(slot);
        this.remoteStreams.delete(slot);
        this.emit('remote-stream-ended', { slot });
      }
    };

    call.on('close', onEnd);
    call.on('error', onEnd);
  }

  hangupAll() {
    for (const call of this.mediaCalls.values()) {
      try { call.close(); } catch { /* noop */ }
    }
    this.mediaCalls.clear();
    this.remoteStreams.clear();
    if (this.bot.active) {
      this.stopBot();
    }
  }

  // --- Виртуальный Собутыльник-бот ---
  startBot() {
    const stream = this.bot.start();
    this.remoteStreams.set(this.bot.slot, stream);
    this.emit('remote-stream', { slot: this.bot.slot, stream, isBot: true });
    return stream;
  }

  stopBot() {
    if (!this.bot.active) return;
    this.bot.stop();
    this.remoteStreams.delete(this.bot.slot);
    this.emit('remote-stream-ended', { slot: this.bot.slot, isBot: true });
  }

  handleBotIncoming(payload) {
    if (!payload || !payload.type) return;
    if (payload.type === 'CHAT_MSG') {
      setTimeout(() => {
        if (!this.bot.active) return;
        const reply = this.bot.randomReply();
        this.bot.say(reply);
        this.emit('data', {
          fromSlot: this.bot.slot,
          payload: {
            type: 'CHAT_MSG',
            id: `bot-${Date.now()}`,
            authorName: this.bot.name,
            authorAvatar: this.bot.avatar,
            text: reply,
            ts: Date.now()
          }
        });
      }, 1100 + Math.random() * 900);
    } else if (payload.type === 'FX_CLINK') {
      this.bot.setMood('cheers', 3500, 'Дзынь! За нас красивых! 🍻');
    } else if (payload.type === 'GAME_FLY_LAUNCH' && payload.targetSlot === this.bot.slot) {
      this.bot.setMood('fly', 3600, 'Эй! Забери свою муху, зараза! 🪰');
      setTimeout(() => {
        if (!this.bot.active) return;
        this.bot.say('Шлёп! Нет больше мухи ✋');
        this.emit('data', {
          fromSlot: this.bot.slot,
          payload: { type: 'GAME_FLY_SWATTED', byName: this.bot.name }
        });
      }, 2800);
    } else if (payload.type === 'GAME_HELICOPTERS' && (!payload.targetSlot || payload.targetSlot === this.bot.slot)) {
      this.bot.setMood('helicopter', 10000, 'Ой-ёй, комната поплыла! 🚁');
    } else if (payload.type === 'GAME_COWBOY_SHOT' && payload.winnerSlot !== this.bot.slot) {
      this.bot.setMood('shot', 4000, 'Ай! Попал прямо в печень, наливаю! 🤠');
    } else if (payload.type === 'GAME_BREATH_START') {
      setTimeout(() => {
        if (!this.bot.active) return;
        const promille = Number((1.2 + Math.random() * 2.6).toFixed(2));
        this.bot.say(`Я надул ${promille} ‰! Попробуй переплюнуть! 💨`);
        this.emit('data', {
          fromSlot: this.bot.slot,
          payload: {
            type: 'GAME_BREATH_RESULT',
            slot: this.bot.slot,
            name: this.bot.name,
            promille
          }
        });
      }, 5100);
    } else if (payload.type === 'GAME_POLYGRAPH_SCAN') {
      this.bot.setMood('scan', 4500, 'Не верь этой железке, я чист! 😅');
    }
  }
}

export const webrtc = new WebRTCManager();
