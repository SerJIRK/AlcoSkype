// AlcoSkype 2.0 Pro — AR-игры без мышки (жесты + голос) и синхронные эффекты

import {
  POLYGRAPH_VERDICTS,
  BOTTLE_MISS_LINES,
  COWBOY_LOSE_LINES,
  getBreathVerdict
} from './config.js';
import { sound } from './sound.js';

export class GamesEngine {
  constructor({ vision, onBroadcast, onToast, onScoreUpdate }) {
    this.vision = vision;
    this.onBroadcast = onBroadcast;
    this.onToast = onToast;
    this.onScoreUpdate = onScoreUpdate;

    this.canvas = null;
    this.ctx = null;
    this.rafId = null;
    this.running = false;
    this.particles = [];

    // 1. Падающая бутылка (AR-руки)
    this.bottleGame = {
      active: false,
      score: 0,
      bottles: [],
      spawnTimer: 0,
      bannerText: '',
      bannerUntil: 0
    };

    // 2. Муха на лице (AR-троллинг)
    this.fly = {
      active: false,
      senderName: '',
      x: 0.2,
      y: 0.2,
      vx: 0,
      vy: 0,
      wingPhase: 0,
      landed: false,
      swatCooldown: 0
    };

    // 3. Алко-ковбои (дуэль на поднятие руки)
    this.cowboy = {
      state: 'idle', // 'idle' | 'prepare' | 'fire' | 'finished'
      fireTimer: null,
      botTimer: null,
      winnerName: '',
      iLost: false,
      bulletX: 0.5,
      bulletY: 0.45,
      loseLine: '',
      endUntil: 0
    };

    // 4. Алкотестер / Задуй свечу (микрофон)
    this.breath = {
      active: false,
      startedAt: 0,
      durationMs: 5000,
      maxLevel: 0,
      sumLevel: 0,
      samples: 0,
      micMeter: null,
      results: [],
      resultBannerUntil: 0,
      resultText: ''
    };

    // 5. Пьяный полиграф
    this.polygraph = {
      active: false,
      targetName: '',
      startedAt: 0,
      scanDuration: 3400,
      verdict: null,
      beepTick: 0,
      endUntil: 0
    };

    // 6. Чокнуться (анимация 2 кружек)
    this.clink = {
      active: false,
      startedAt: 0,
      durationMs: 2200,
      clinkedSoundPlayed: false
    };
  }

  mount(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Клик/тап по холсту тоже сгоняет муху и может стрелять в ковбоях на устройствах без камеры
    this.canvas.addEventListener('pointerdown', e => {
      const rect = this.canvas.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;

      if (this.fly.active) {
        const dist = Math.hypot(nx - this.fly.x, ny - this.fly.y);
        if (dist < 0.16) {
          this.swatFly('кликом');
        }
      }
      if (this.bottleGame.active) {
        this.checkBottleHit(nx, ny, 0.14);
      }
      if (this.cowboy.state === 'fire') {
        this.triggerCowboyWin();
      }
    });

    if (!this.running) {
      this.running = true;
      const tick = () => {
        if (!this.running) return;
        this.updateAndDraw();
        this.rafId = requestAnimationFrame(tick);
      };
      tick();
    }
  }

  resize() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.canvas.width = Math.round(rect.width);
      this.canvas.height = Math.round(rect.height);
    }
  }

  hasInteractiveOverlay() {
    return this.fly.active || this.bottleGame.active || this.cowboy.state === 'fire';
  }

  // ==================== 1. ОТБЕЙ ПАДАЮЩУЮ БУТЫЛКУ ====================
  toggleBottleGame(forceState) {
    const next = typeof forceState === 'boolean' ? forceState : !this.bottleGame.active;
    this.bottleGame.active = next;
    this.bottleGame.bottles = [];
    if (next) {
      this.spawnBottle();
      this.onToast?.('🍺 Маши рукой перед камерой, чтобы отбивать бутылки! (или жми по ним)');
    }
    return next;
  }

  spawnBottle() {
    this.bottleGame.bottles.push({
      x: 0.2 + Math.random() * 0.6,
      y: -0.08,
      vx: (Math.random() - 0.5) * 0.0018,
      vy: 0.0042 + Math.random() * 0.0022,
      rot: (Math.random() - 0.5) * 0.5,
      vrot: (Math.random() - 0.5) * 0.04,
      hit: false
    });
  }

  checkBottleHit(hx, hy, radius = 0.14) {
    for (const b of this.bottleGame.bottles) {
      if (b.hit) continue;
      if (Math.hypot(hx - b.x, hy - b.y) < radius) {
        b.hit = true;
        b.vx = (b.x < hx ? -1 : 1) * (0.025 + Math.random() * 0.015);
        b.vy = -0.02;
        b.vrot = 0.35;
        this.bottleGame.score += 1;
        sound.playGlassClink();
        this.spawnSparkles(b.x, b.y, '#fbbf24', 18);
        this.onScoreUpdate?.(this.bottleGame.score);
        this.onBroadcast?.({ type: 'GAME_BOTTLE_SCORE', score: this.bottleGame.score });
      }
    }
  }

  // ==================== 2. ЗАПУСТИТЬ МУХУ ====================
  launchFlyOnMe(senderName = 'Друг') {
    this.fly.active = true;
    this.fly.senderName = senderName;
    this.fly.x = Math.random() > 0.5 ? 0.05 : 0.95;
    this.fly.y = 0.12 + Math.random() * 0.25;
    this.fly.swatCooldown = Date.now() + 700;
    sound.startFlyBuzz();
    this.onToast?.(`🪰 ${senderName} запустил тебе муху! Махни рукой перед лицом или щёлкни по ней!`);
  }

  swatFly(method = 'рукой') {
    if (!this.fly.active) return;
    this.fly.active = false;
    sound.stopFlyBuzz();
    sound.playSwat();
    this.spawnSparkles(this.fly.x, this.fly.y, '#a3e635', 16);
    this.onToast?.(`✋ Муха сбита ${method}!`);
    this.onBroadcast?.({ type: 'GAME_FLY_SWATTED' });
  }

  // ==================== 3. АЛКО-КОВБОИ ====================
  startCowboyDuel({ initiator = true, mySlot, myName, botActive = false } = {}) {
    clearTimeout(this.cowboy.fireTimer);
    clearTimeout(this.cowboy.botTimer);
    this.cowboy.state = 'prepare';
    this.cowboy.mySlot = mySlot;
    this.cowboy.myName = myName || 'Ты';
    this.cowboy.iLost = false;
    this.cowboy.winnerName = '';
    sound.playWesternTension();

    const delay = 2600 + Math.floor(Math.random() * 1900);
    if (initiator) {
      this.onBroadcast?.({ type: 'GAME_COWBOY_PREPARE', fireInMs: delay });
    }

    this.cowboy.fireTimer = setTimeout(() => {
      if (this.cowboy.state !== 'prepare') return;
      this.cowboy.state = 'fire';
      sound.playPolygraphBeep(1180);

      // Если играет Бот-Петрович, он выстрелит через 1.2 - 1.9 сек
      if (botActive) {
        this.cowboy.botTimer = setTimeout(() => {
          if (this.cowboy.state === 'fire') {
            this.finishCowboyDuel({ winnerSlot: 99, winnerName: 'Бот-Петрович' });
          }
        }, 1250 + Math.random() * 650);
      }
    }, delay);
  }

  onRemoteCowboyPrepare(fireInMs) {
    clearTimeout(this.cowboy.fireTimer);
    this.cowboy.state = 'prepare';
    this.cowboy.iLost = false;
    sound.playWesternTension();
    this.cowboy.fireTimer = setTimeout(() => {
      if (this.cowboy.state === 'prepare') {
        this.cowboy.state = 'fire';
        sound.playPolygraphBeep(1180);
      }
    }, Math.max(1200, Math.min(5000, fireInMs || 3000)));
  }

  triggerCowboyWin() {
    if (this.cowboy.state !== 'fire') return;
    const payload = {
      type: 'GAME_COWBOY_SHOT',
      winnerSlot: this.cowboy.mySlot,
      winnerName: this.cowboy.myName
    };
    this.onBroadcast?.(payload);
    this.finishCowboyDuel(payload);
  }

  finishCowboyDuel({ winnerSlot, winnerName }) {
    clearTimeout(this.cowboy.fireTimer);
    clearTimeout(this.cowboy.botTimer);
    if (this.cowboy.state === 'finished') return;
    this.cowboy.state = 'finished';
    this.cowboy.winnerName = winnerName || 'Ковбой';
    this.cowboy.iLost = winnerSlot !== this.cowboy.mySlot;
    this.cowboy.bulletX = 0.35 + Math.random() * 0.3;
    this.cowboy.bulletY = 0.35 + Math.random() * 0.3;
    this.cowboy.loseLine = COWBOY_LOSE_LINES[Math.floor(Math.random() * COWBOY_LOSE_LINES.length)];
    this.cowboy.endUntil = Date.now() + 5000;
    sound.playGunshot();
  }

  // ==================== 4. АЛКОТЕСТЕР / ЗАДУЙ СВЕЧУ ====================
  startBreathalyzer({ stream, mySlot, myName, initiator = true }) {
    if (this.breath.active) return;
    this.breath.active = true;
    this.breath.startedAt = Date.now();
    this.breath.maxLevel = 0;
    this.breath.sumLevel = 0;
    this.breath.samples = 0;
    this.breath.results = [];
    this.breath.mySlot = mySlot;
    this.breath.myName = myName || 'Ты';
    if (this.breath.micMeter) this.breath.micMeter.destroy();
    this.breath.micMeter = sound.createMicMeter(stream);

    if (initiator) {
      this.onBroadcast?.({ type: 'GAME_BREATH_START' });
    }
    this.onToast?.('🕯️ Дунь или крикни в микрофон изо всех сил (5 секунд)!');
  }

  addRemoteBreathResult({ slot, name, promille }) {
    this.breath.results.push({ slot, name, promille });
    this.refreshBreathWinnerBanner();
  }

  refreshBreathWinnerBanner() {
    if (!this.breath.results.length) return;
    const sorted = [...this.breath.results].sort((a, b) => b.promille - a.promille);
    const top = sorted[0];
    this.breath.resultText = `🏆 ${top.name}: ${top.promille.toFixed(2)} ‰ — ${getBreathVerdict(top.promille)}`;
    this.breath.resultBannerUntil = Date.now() + 6500;
  }

  // ==================== 5. ПЬЯНЫЙ ПОЛИГРАФ ====================
  startPolygraph({ targetName = 'Собутыльник', verdictIndex = null, initiator = true } = {}) {
    const idx = verdictIndex !== null
      ? verdictIndex % POLYGRAPH_VERDICTS.length
      : Math.floor(Math.random() * POLYGRAPH_VERDICTS.length);

    this.polygraph.active = true;
    this.polygraph.targetName = targetName;
    this.polygraph.startedAt = Date.now();
    this.polygraph.verdict = POLYGRAPH_VERDICTS[idx];
    this.polygraph.verdictPlayed = false;
    this.polygraph.beepTick = 0;
    this.polygraph.endUntil = Date.now() + this.polygraph.scanDuration + 4600;

    if (initiator) {
      this.onBroadcast?.({ type: 'GAME_POLYGRAPH_SCAN', targetName, verdictIndex: idx });
    }
  }

  // ==================== 6. ЧОКНУТЬСЯ ====================
  triggerClink(initiator = true) {
    this.clink.active = true;
    this.clink.startedAt = Date.now();
    this.clink.clinkedSoundPlayed = false;
    if (initiator) {
      this.onBroadcast?.({ type: 'FX_CLINK' });
    }
  }

  // ==================== ЧАСТИЦЫ ====================
  spawnSparkles(nx, ny, color, count = 14) {
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const spd = 0.004 + Math.random() * 0.012;
      this.particles.push({
        x: nx,
        y: ny,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 0.004,
        life: 1,
        color,
        size: 3 + Math.random() * 5
      });
    }
  }

  // ==================== ОСНОВНОЙ ЦИКЛ ОТРИСОВКИ ====================
  updateAndDraw() {
    if (!this.canvas || !this.ctx) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const now = Date.now();

    ctx.clearRect(0, 0, w, h);

    // Интерактивность указателя включается только когда реально нужна кликабельная игра
    this.canvas.style.pointerEvents = this.hasInteractiveOverlay() ? 'auto' : 'none';

    const det = this.vision.detection;

    // --- 1. Падающая бутылка ---
    if (this.bottleGame.active) {
      this.updateAndDrawBottles(ctx, w, h, det, now);
    }

    // --- 2. Муха на лице ---
    if (this.fly.active) {
      this.updateAndDrawFly(ctx, w, h, det, now);
    }

    // --- 3. Алко-ковбои ---
    if (this.cowboy.state !== 'idle') {
      this.updateAndDrawCowboy(ctx, w, h, det, now);
    }

    // --- 4. Алкотестер / Свеча ---
    if (this.breath.active || now < this.breath.resultBannerUntil) {
      this.updateAndDrawBreathalyzer(ctx, w, h, now);
    }

    // --- 5. Пьяный полиграф ---
    if (this.polygraph.active) {
      this.updateAndDrawPolygraph(ctx, w, h, det, now);
    }

    // --- 6. Чокнуться ---
    if (this.clink.active) {
      this.updateAndDrawClink(ctx, w, h, now);
    }

    // --- 7. Частицы ---
    this.updateAndDrawParticles(ctx, w, h);
  }

  updateAndDrawBottles(ctx, w, h, det, now) {
    // Проверка рук/движения
    if (det.hands.length > 0) {
      for (const hand of det.hands) {
        this.checkBottleHit(hand.x, hand.y, 0.14);
        // Показываем золотой ореол вокруг руки для обратной связи
        ctx.save();
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(hand.x * w, hand.y * h, 26, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    } else if (det.motionPoint.strength > 0.25) {
      this.checkBottleHit(det.motionPoint.x, det.motionPoint.y, 0.15);
    }

    // Обновление бутылок
    for (let i = this.bottleGame.bottles.length - 1; i >= 0; i--) {
      const b = this.bottleGame.bottles[i];
      b.x += b.vx;
      b.y += b.vy;
      b.rot += b.vrot;
      if (b.hit) {
        b.vy += 0.0012;
        if (b.x < -0.2 || b.x > 1.2 || b.y > 1.2) {
          this.bottleGame.bottles.splice(i, 1);
          continue;
        }
      } else if (b.y > 0.96) {
        // Упала вниз — разбилась!
        sound.playGlassShatter();
        this.spawnSparkles(b.x, 0.94, '#86efac', 22);
        this.bottleGame.bannerText = BOTTLE_MISS_LINES[Math.floor(Math.random() * BOTTLE_MISS_LINES.length)];
        this.bottleGame.bannerUntil = now + 2800;
        this.bottleGame.bottles.splice(i, 1);
        continue;
      }

      this.drawBeerBottle(ctx, b.x * w, b.y * h, b.rot);
    }

    if (this.bottleGame.bottles.length === 0) {
      this.spawnBottle();
    }

    // Счётчик сверху по центру
    this.drawPillBanner(ctx, w / 2, 34, `🍺 ОТБИТО БУТЫЛОК: ${this.bottleGame.score}`, '#f59e0b');

    if (now < this.bottleGame.bannerUntil) {
      this.drawCenterAlert(ctx, w, h * 0.28, '💥 ШТРАФНОЙ ГЛОТОК!', this.bottleGame.bannerText, '#dc2626');
    }
  }

  drawBeerBottle(ctx, x, y, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    // Стеклянный корпус
    const grad = ctx.createLinearGradient(-18, 0, 18, 0);
    grad.addColorStop(0, '#14532d');
    grad.addColorStop(0.35, '#22c55e');
    grad.addColorStop(0.75, '#15803d');
    grad.addColorStop(1, '#052e16');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(-18, -14, 36, 62, 10);
    ctx.fill();

    // Горлышко
    ctx.beginPath();
    ctx.moveTo(-16, -12);
    ctx.lineTo(-7, -48);
    ctx.lineTo(7, -48);
    ctx.lineTo(16, -12);
    ctx.closePath();
    ctx.fill();

    // Пробка
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(-8, -54, 16, 7);

    // Этикетка
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(-16, 4, 32, 24);
    ctx.fillStyle = '#b45309';
    ctx.font = 'bold 10px Oswald, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ALCO', 0, 20);

    // Блик стекла
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.beginPath();
    ctx.roundRect(-11, -6, 5, 44, 3);
    ctx.fill();

    ctx.restore();
  }

  updateAndDrawFly(ctx, w, h, det, now) {
    const targetX = det.faceCenter.x;
    const targetY = det.faceCenter.y;

    // Муха стремится сесть на нос/лицо с хаотичным жужжанием
    const dx = targetX - this.fly.x;
    const dy = targetY - this.fly.y;
    const dist = Math.hypot(dx, dy);

    this.fly.vx += dx * 0.006 + (Math.random() - 0.5) * 0.008;
    this.fly.vy += dy * 0.006 + (Math.random() - 0.5) * 0.008;
    this.fly.vx *= 0.88;
    this.fly.vy *= 0.88;
    this.fly.x = Math.max(0.06, Math.min(0.94, this.fly.x + this.fly.vx));
    this.fly.y = Math.max(0.08, Math.min(0.92, this.fly.y + this.fly.vy));
    this.fly.wingPhase += 0.9;

    // Проверка взмаха рукой перед лицом
    if (now > this.fly.swatCooldown) {
      let swatted = false;
      for (const hand of det.hands) {
        if (Math.hypot(hand.x - this.fly.x, hand.y - this.fly.y) < 0.2 || det.handWaveIntensity > 0.52) {
          swatted = true;
        }
      }
      if (!swatted && det.motionPoint.strength > 0.55 && Math.hypot(det.motionPoint.x - this.fly.x, det.motionPoint.y - this.fly.y) < 0.26) {
        swatted = true;
      }
      if (swatted) {
        this.swatFly('взмахом руки');
        return;
      }
    }

    // Отрисовка мухи
    const fx = this.fly.x * w;
    const fy = this.fly.y * h;
    const angle = Math.atan2(this.fly.vy, this.fly.vx);

    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(angle);

    // Прозрачные трепещущие крылья
    const wingSpread = 0.55 + Math.sin(this.fly.wingPhase) * 0.45;
    ctx.fillStyle = 'rgba(226, 232, 240, 0.72)';
    ctx.save();
    ctx.rotate(-wingSpread);
    ctx.beginPath();
    ctx.ellipse(-2, -12, 13, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.rotate(wingSpread);
    ctx.beginPath();
    ctx.ellipse(-2, 12, 13, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Тельце и красные глазки
    ctx.fillStyle = '#09090b';
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.arc(10, -3.5, 3, 0, Math.PI * 2);
    ctx.arc(10, 3.5, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    if (dist < 0.08) {
      this.drawPillBanner(ctx, w / 2, h - 108, '🪰 МУХА СЕЛА НА ЛИЦО! МАХНИ РУКОЙ, ЧТОБЫ ПРОГНАТЬ!', '#84cc16');
    }
  }

  updateAndDrawCowboy(ctx, w, h, det, now) {
    if (this.cowboy.state === 'prepare') {
      ctx.fillStyle = 'rgba(12, 7, 4, 0.72)';
      ctx.fillRect(0, 0, w, h);
      this.drawCenterAlert(ctx, w, h * 0.48, '🤠 АЛКО-КОВБОИ', 'Жди сигнал... Кто первый задерет руку — тот и выжил!', '#f59e0b');
      return;
    }

    if (this.cowboy.state === 'fire') {
      ctx.fillStyle = 'rgba(185, 28, 28, 0.34)';
      ctx.fillRect(0, 0, w, h);
      this.drawCenterAlert(ctx, w, h * 0.45, '🔫 ПЛИ!!!', 'ПОДНИМИ РУКУ ВВЕРХ ПЕРЕД КАМЕРОЙ (ИЛИ ЖМИ ПО ЭКРАНУ)!', '#ef4444');

      if (det.handRaisedHigh) {
        this.triggerCowboyWin();
      }
      return;
    }

    if (this.cowboy.state === 'finished') {
      if (now > this.cowboy.endUntil) {
        this.cowboy.state = 'idle';
        return;
      }
      if (this.cowboy.iLost) {
        this.drawBulletHole(ctx, this.cowboy.bulletX * w, this.cowboy.bulletY * h);
        this.drawCenterAlert(ctx, w, h * 0.25, `💀 ПОБЕДИЛ ${this.cowboy.winnerName.toUpperCase()}`, this.cowboy.loseLine, '#dc2626');
      } else {
        this.drawCenterAlert(ctx, w, h * 0.3, '🤠 САМАЯ БЫСТРАЯ ПЕЧЕНЬ НА ДИКОМ ЗАПАДЕ!', 'Ты выстрелил первым! Проигравшие наливают!', '#10b981');
      }
    }
  }

  drawBulletHole(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    // Трещины стекла
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const ang = (Math.PI * 2 * i) / 12 + (i % 2) * 0.14;
      const len = 35 + (i % 3) * 28;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
      ctx.stroke();
    }
    // Чёрное пулевое отверстие
    ctx.fillStyle = '#09090b';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  updateAndDrawBreathalyzer(ctx, w, h, now) {
    if (this.breath.active) {
      const elapsed = now - this.breath.startedAt;
      const leftSec = Math.max(0, (this.breath.durationMs - elapsed) / 1000);
      const level = this.breath.micMeter ? this.breath.micMeter.getLevel() : 15 + Math.random() * 25;

      this.breath.sumLevel += level;
      this.breath.samples += 1;
      if (level > this.breath.maxLevel) this.breath.maxLevel = level;

      const promille = Math.min(4.8, Number(((this.breath.maxLevel * 0.032) + (this.breath.sumLevel / Math.max(1, this.breath.samples)) * 0.025).toFixed(2)));

      // Отрисовка свечи, которая гнётся от ветра в микрофон
      const cx = w / 2;
      const cy = h * 0.65;
      const bend = (level / 100) * 58;

      ctx.save();
      // Подложка
      ctx.fillStyle = 'rgba(12, 10, 9, 0.72)';
      ctx.beginPath();
      ctx.roundRect(cx - 190, cy - 160, 380, 230, 18);
      ctx.fill();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Тело свечи
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(cx - 18, cy - 20, 36, 72);

      // Пламя
      const flameH = Math.max(10, 62 - level * 0.42);
      const flameGrad = ctx.createRadialGradient(cx + bend * 0.6, cy - 28 - flameH * 0.4, 4, cx + bend, cy - 35, 36);
      flameGrad.addColorStop(0, '#ffffff');
      flameGrad.addColorStop(0.4, '#fde047');
      flameGrad.addColorStop(1, '#ea580c');
      ctx.fillStyle = flameGrad;
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy - 20);
      ctx.quadraticCurveTo(cx + bend * 0.5, cy - 20 - flameH * 0.6, cx + bend, cy - 20 - flameH);
      ctx.quadraticCurveTo(cx + 12 + bend * 0.3, cy - 20 - flameH * 0.4, cx + 12, cy - 20);
      ctx.fill();

      ctx.fillStyle = '#fffbeb';
      ctx.font = 'bold 22px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`💨 ${promille.toFixed(2)} ‰  ·  ${leftSec.toFixed(1)}с`, cx, cy - 115);
      ctx.font = '600 14px Manrope, sans-serif';
      ctx.fillStyle = '#fde68a';
      ctx.fillText('ДУЙ ИЛИ ОРИ В МИКРОФОН!', cx, cy - 90);
      ctx.restore();

      if (elapsed >= this.breath.durationMs) {
        this.breath.active = false;
        if (this.breath.micMeter) {
          this.breath.micMeter.destroy();
          this.breath.micMeter = null;
        }
        const finalPromille = promille;
        this.breath.results.push({
          slot: this.breath.mySlot,
          name: this.breath.myName,
          promille: finalPromille
        });
        this.onBroadcast?.({
          type: 'GAME_BREATH_RESULT',
          slot: this.breath.mySlot,
          name: this.breath.myName,
          promille: finalPromille
        });
        sound.playSoundboard('drumroll');
        this.refreshBreathWinnerBanner();
      }
    } else if (now < this.breath.resultBannerUntil) {
      this.drawCenterAlert(ctx, w, h * 0.28, '🍻 РЕЗУЛЬТАТ АЛКОТЕСТЕРА', this.breath.resultText, '#f59e0b');
    }
  }

  updateAndDrawPolygraph(ctx, w, h, det, now) {
    if (now > this.polygraph.endUntil) {
      this.polygraph.active = false;
      return;
    }
    const elapsed = now - this.polygraph.startedAt;
    const scanning = elapsed < this.polygraph.scanDuration;
    const fx = det.faceCenter.x * w;
    const fy = det.faceCenter.y * h;

    if (scanning) {
      if (Math.floor(elapsed / 320) > this.polygraph.beepTick) {
        this.polygraph.beepTick = Math.floor(elapsed / 320);
        sound.playPolygraphBeep(680 + (this.polygraph.beepTick % 4) * 140);
      }
      const boxSize = Math.min(w, h) * 0.44;
      const bx = fx - boxSize / 2;
      const by = fy - boxSize / 2;

      ctx.save();
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 3;
      ctx.strokeRect(bx, by, boxSize, boxSize);

      // Лазерная полоса сканирования
      const scanY = by + ((Math.sin(elapsed * 0.008) + 1) / 2) * boxSize;
      ctx.strokeStyle = '#ef4444';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(bx, scanY);
      ctx.lineTo(bx + boxSize, scanY);
      ctx.stroke();

      // Осциллограмма пульса снизу
      ctx.strokeStyle = '#34d399';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      for (let i = 0; i < 60; i++) {
        const px = bx + (i / 59) * boxSize;
        const spike = Math.sin(elapsed * 0.03 + i * 0.7) * 14 * (i % 5 === 0 ? 1.8 : 0.4);
        const py = by + boxSize + 24 + spike;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();

      this.drawPillBanner(ctx, w / 2, 42, `📡 ПОЛИГРАФ СКАНИРУЕТ: ${this.polygraph.targetName}...`, '#06b6d4');
    } else {
      const v = this.polygraph.verdict;
      if (!this.polygraph.verdictPlayed) {
        this.polygraph.verdictPlayed = true;
        sound.playPolygraphVerdict(v.truth);
      }
      this.drawCenterAlert(
        ctx,
        w,
        h * 0.3,
        `${v.truth ? '✅' : '🚨'} ${v.title}`,
        `${this.polygraph.targetName}: ${v.desc}`,
        v.truth ? '#10b981' : '#dc2626'
      );
    }
  }

  updateAndDrawClink(ctx, w, h, now) {
    const elapsed = now - this.clink.startedAt;
    if (elapsed > this.clink.durationMs) {
      this.clink.active = false;
      return;
    }
    const p = elapsed / this.clink.durationMs;
    // Схождение к центру к p = 0.42, затем лёгкий отскок
    let approach;
    if (p < 0.42) {
      approach = p / 0.42;
    } else if (p < 0.56) {
      approach = 1 - ((p - 0.42) / 0.14) * 0.12;
    } else {
      approach = 0.88 - ((p - 0.56) / 0.44) * 0.25;
    }

    if (p >= 0.41 && !this.clink.clinkedSoundPlayed) {
      this.clink.clinkedSoundPlayed = true;
      sound.playGlassClink();
      this.spawnSparkles(0.5, 0.46, '#fde047', 28);
    }

    const alpha = p > 0.78 ? Math.max(0, 1 - (p - 0.78) / 0.22) : 1;
    const cx = w / 2;
    const cy = h * 0.5;
    const offset = (1 - approach) * Math.min(w * 0.35, 220) + 46;
    const tilt = approach * 0.24;

    ctx.save();
    ctx.globalAlpha = alpha;
    this.drawBeerMug(ctx, cx - offset, cy, tilt, 1);
    this.drawBeerMug(ctx, cx + offset, cy, -tilt, -1);

    if (p >= 0.4 && p <= 0.85) {
      ctx.font = 'bold 34px Oswald, sans-serif';
      ctx.fillStyle = '#fef08a';
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 18;
      ctx.textAlign = 'center';
      ctx.fillText('ДЗЫНЬ! ЗА НАС!', cx, cy - 115);
    }
    ctx.restore();
  }

  drawBeerMug(ctx, x, y, rot, dir) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(dir, 1);

    // Ручка
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(-44, 6, 26, Math.PI * 0.5, Math.PI * 1.5);
    ctx.stroke();

    // Пиво
    const g = ctx.createLinearGradient(0, -55, 0, 65);
    g.addColorStop(0, '#fbbf24');
    g.addColorStop(1, '#b45309');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(-42, -55, 84, 120, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.82)';
    ctx.lineWidth = 5;
    ctx.stroke();

    // Пена
    ctx.fillStyle = '#fffbeb';
    ctx.beginPath();
    ctx.arc(-26, -58, 22, 0, Math.PI * 2);
    ctx.arc(0, -66, 26, 0, Math.PI * 2);
    ctx.arc(26, -58, 22, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  updateAndDrawParticles(ctx, w, h) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.0005;
      p.life -= 0.025;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawPillBanner(ctx, x, y, text, borderColor) {
    ctx.save();
    ctx.font = '700 14px Manrope, sans-serif';
    const tw = Math.min(ctx.canvas.width - 32, ctx.measureText(text).width + 36);
    ctx.fillStyle = 'rgba(12, 10, 9, 0.84)';
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - tw / 2, y - 18, tw, 36, 18);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fffbeb';
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y + 5, tw - 18);
    ctx.restore();
  }

  drawCenterAlert(ctx, w, y, title, subtitle, color) {
    ctx.save();
    const boxW = Math.min(w - 32, 540);
    const boxH = 104;
    const x = (w - boxW) / 2;
    ctx.fillStyle = 'rgba(10, 8, 7, 0.88)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x, y - boxH / 2, boxW, boxH, 16);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.font = 'bold 24px Oswald, sans-serif';
    ctx.fillText(title, w / 2, y - 12, boxW - 28);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '600 14px Manrope, sans-serif';
    ctx.fillText(subtitle, w / 2, y + 22, boxW - 28);
    ctx.restore();
  }
}
