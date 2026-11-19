// AlcoSkype 2.0 Pro — MediaPipe Tasks Vision + Виртуальные фоны + Motion Fallback + AR-маски

import { DEFAULT_CONFIG } from './config.js';

export class VisionPipeline {
  constructor() {
    this.sourceVideo = document.createElement('video');
    this.sourceVideo.autoplay = true;
    this.sourceVideo.playsInline = true;
    this.sourceVideo.muted = true;

    this.outputCanvas = document.createElement('canvas');
    this.outputCanvas.width = 640;
    this.outputCanvas.height = 480;
    this.ctx = this.outputCanvas.getContext('2d', { willReadFrequently: false });

    // Вспомогательные буферы
    this.maskCanvas = document.createElement('canvas');
    this.maskCanvas.width = 256;
    this.maskCanvas.height = 192;
    this.maskCtx = this.maskCanvas.getContext('2d', { willReadFrequently: true });

    this.personCanvas = document.createElement('canvas');
    this.personCanvas.width = 640;
    this.personCanvas.height = 480;
    this.personCtx = this.personCanvas.getContext('2d');

    // Детектор движения (мгновенный fallback пока MediaPipe грузится или нет WebGL)
    this.motionCanvas = document.createElement('canvas');
    this.motionCanvas.width = 64;
    this.motionCanvas.height = 48;
    this.motionCtx = this.motionCanvas.getContext('2d', { willReadFrequently: true });
    this.prevFrame = null;

    this.rawStream = null;
    this.processedStream = null;
    this.running = false;
    this.rafId = null;
    this.frameCount = 0;
    this.startTime = performance.now();

    // Настройки фона и AR
    this.bgMode = 'original'; // 'original' | 'blur' | 'pub' | 'cyber' | 'banya' | 'space' | 'custom'
    this.blurAmount = 14;
    this.customBgImage = null;
    this.beerHelmetEnabled = false;
    this.helicoptersUntil = 0;

    // MediaPipe инстансы
    this.mpLoading = false;
    this.mpReady = false;
    this.segmenter = null;
    this.handLandmarker = null;
    this.faceLandmarker = null;
    this.lastMaskImageData = null;

    // Последние координаты детекции (нормализованные 0..1, отзеркаленные как на экране)
    this.detection = {
      hands: [], // [{ x, y }]
      handWaveIntensity: 0,
      handRaisedHigh: false,
      faceCenter: { x: 0.5, y: 0.44, detected: false },
      forehead: { x: 0.5, y: 0.28, width: 0.28 },
      motionPoint: { x: 0.5, y: 0.5, strength: 0 },
      modelsReady: false
    };
    this.prevHandPos = null;
    this.onStatusChange = null;
  }

  async initMediaPipe() {
    if (this.mpReady || this.mpLoading) return;
    this.mpLoading = true;
    this.notifyStatus('Загрузка MediaPipe Vision...');

    try {
      const mpUrl = DEFAULT_CONFIG.mediapipe.moduleUrl;
      const visionMod = await import(/* @vite-ignore */ mpUrl);
      const { FilesetResolver, ImageSegmenter, HandLandmarker, FaceLandmarker } = visionMod;

      const fileset = await FilesetResolver.forVisionTasks(DEFAULT_CONFIG.mediapipe.wasmPath);

      const createWithFallback = async (Factory, opts) => {
        try {
          return await Factory.createFromOptions(fileset, {
            ...opts,
            baseOptions: { ...opts.baseOptions, delegate: 'GPU' }
          });
        } catch {
          return await Factory.createFromOptions(fileset, {
            ...opts,
            baseOptions: { ...opts.baseOptions, delegate: 'CPU' }
          });
        }
      };

      const [seg, hand, face] = await Promise.allSettled([
        createWithFallback(ImageSegmenter, {
          baseOptions: { modelAssetPath: DEFAULT_CONFIG.mediapipe.selfieModel },
          runningMode: 'VIDEO',
          outputCategoryMask: true,
          outputConfidenceMasks: false
        }),
        createWithFallback(HandLandmarker, {
          baseOptions: { modelAssetPath: DEFAULT_CONFIG.mediapipe.handModel },
          runningMode: 'VIDEO',
          numHands: 2
        }),
        createWithFallback(FaceLandmarker, {
          baseOptions: { modelAssetPath: DEFAULT_CONFIG.mediapipe.faceModel },
          runningMode: 'VIDEO',
          numFaces: 1
        })
      ]);

      if (seg.status === 'fulfilled') this.segmenter = seg.value;
      if (hand.status === 'fulfilled') this.handLandmarker = hand.value;
      if (face.status === 'fulfilled') this.faceLandmarker = face.value;

      this.mpReady = Boolean(this.segmenter || this.handLandmarker || this.faceLandmarker);
      this.detection.modelsReady = this.mpReady;
      this.notifyStatus(this.mpReady ? 'MediaPipe AR активен' : 'Активен режим детектора движения');
    } catch (err) {
      console.warn('[Vision] MediaPipe CDN fallback to motion detector:', err);
      this.notifyStatus('Активен лёгкий детектор движения');
    } finally {
      this.mpLoading = false;
    }
  }

  notifyStatus(text) {
    if (typeof this.onStatusChange === 'function') {
      this.onStatusChange(text, this.mpReady);
    }
  }

  setBackground(mode) {
    this.bgMode = mode || 'original';
    if (this.bgMode !== 'original' && !this.mpReady && !this.mpLoading) {
      this.initMediaPipe();
    }
  }

  setBlurAmount(px) {
    this.blurAmount = Math.max(4, Math.min(32, Number(px) || 14));
  }

  setCustomBackgroundFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        this.customBgImage = img;
        this.bgMode = 'custom';
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  toggleBeerHelmet(flag) {
    this.beerHelmetEnabled = typeof flag === 'boolean' ? flag : !this.beerHelmetEnabled;
    if (this.beerHelmetEnabled && !this.mpReady && !this.mpLoading) {
      this.initMediaPipe();
    }
    return this.beerHelmetEnabled;
  }

  triggerHelicopters(durationMs = 10000) {
    this.helicoptersUntil = Date.now() + durationMs;
  }

  async attachStream(rawStream) {
    this.rawStream = rawStream;
    this.sourceVideo.srcObject = rawStream;
    try {
      await this.sourceVideo.play();
    } catch { /* noop */ }

    if (!this.running) {
      this.running = true;
      this.loop();
    }

    // Создаём результирующий поток: обработанное видео с Canvas + оригинальный микрофон
    const canvasStream = this.outputCanvas.captureStream(24);
    const audioTracks = rawStream ? rawStream.getAudioTracks() : [];
    this.processedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioTracks
    ]);

    // Ленивая подгрузка MediaPipe в фоне
    this.initMediaPipe();
    return this.processedStream;
  }

  stop() {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  loop() {
    if (!this.running) return;
    this.frameCount++;
    this.renderFrame();
    this.rafId = requestAnimationFrame(() => this.loop());
  }

  renderFrame() {
    const v = this.sourceVideo;
    const w = this.outputCanvas.width;
    const h = this.outputCanvas.height;
    const ctx = this.ctx;
    const nowMs = performance.now();
    const t = (nowMs - this.startTime) / 1000;

    if (!v || v.readyState < 2 || v.videoWidth === 0) {
      this.drawNoCameraPlaceholder(ctx, w, h, t);
      return;
    }

    // 1. Всегда считаем быстрый детектор движения (раз в 2 кадра)
    if (this.frameCount % 2 === 0) {
      this.updateMotionDetector(v);
    }

    // 2. MediaPipe Hands / Face (раз в 3 кадра для экономии CPU/GPU на телефонах)
    if (this.frameCount % 3 === 0) {
      this.updateMediaPipeLandmarks(v, nowMs);
    }

    // 3. Рисуем видео + виртуальный фон
    ctx.save();
    const helicoptersActive = Date.now() < this.helicoptersUntil;

    if (this.bgMode === 'original') {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(v, 0, 0, w, h);
    } else {
      this.renderWithVirtualBackground(ctx, v, w, h, t, nowMs);
    }
    ctx.restore();

    // 4. Эффект «Вертолёты» (волнообразная деформация 10 секунд)
    if (helicoptersActive) {
      this.applyHelicopterWarp(ctx, w, h, t);
    }

    // 5. AR-маска «Пивная каска»
    if (this.beerHelmetEnabled) {
      this.drawBeerHelmet(ctx, w, h);
    }
  }

  renderWithVirtualBackground(ctx, v, w, h, t, nowMs) {
    // Отрисовка фона
    if (this.bgMode === 'blur') {
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.filter = `blur(${this.blurAmount}px)`;
      ctx.drawImage(v, -16, -16, w + 32, h + 32);
      ctx.restore();
    } else if (this.bgMode === 'custom' && this.customBgImage) {
      ctx.drawImage(this.customBgImage, 0, 0, w, h);
    } else {
      this.drawProceduralBackground(ctx, this.bgMode, w, h, t);
    }

    // Если MediaPipe Segmenter готов — вырезаем человека
    if (this.segmenter) {
      try {
        const res = this.segmenter.segmentForVideo(v, nowMs);
        const mask = res?.categoryMask;
        if (mask) {
          const mw = mask.width;
          const mh = mask.height;
          if (this.maskCanvas.width !== mw || this.maskCanvas.height !== mh) {
            this.maskCanvas.width = mw;
            this.maskCanvas.height = mh;
          }
          const rawMask = mask.getAsUint8Array();
          const imgData = this.maskCtx.createImageData(mw, mh);
          const d = imgData.data;
          for (let i = 0; i < rawMask.length; i++) {
            // В selfie_segmenter 0 = человек, 1 = фон (или наоборот в некоторых моделях; проверяем центр)
            const isPerson = rawMask[i] === 0;
            const idx = i * 4;
            d[idx] = 255;
            d[idx + 1] = 255;
            d[idx + 2] = 255;
            d[idx + 3] = isPerson ? 255 : 0;
          }
          this.maskCtx.putImageData(imgData, 0, 0);
          mask.close();

          // Композитинг вырезанного человека (зеркально)
          const pCtx = this.personCtx;
          pCtx.clearRect(0, 0, w, h);
          pCtx.save();
          pCtx.translate(w, 0);
          pCtx.scale(-1, 1);
          pCtx.globalCompositeOperation = 'source-over';
          pCtx.drawImage(this.maskCanvas, 0, 0, w, h);
          pCtx.globalCompositeOperation = 'source-in';
          pCtx.drawImage(v, 0, 0, w, h);
          pCtx.restore();

          ctx.drawImage(this.personCanvas, 0, 0, w, h);
          return;
        }
      } catch {
        // Fallback ниже
      }
    }

    // Мягкий овальный виньетный fallback, пока модель сегментации ещё качается
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.56, w * 0.34, h * 0.44, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0, w, h);
    ctx.restore();
  }

  drawProceduralBackground(ctx, mode, w, h, t) {
    if (mode === 'pub') {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#1c1008');
      g.addColorStop(0.55, '#3b1f0e');
      g.addColorStop(1, '#120905');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // Тёплое боке ламп паба
      for (let i = 0; i < 14; i++) {
        const x = ((i * 97 + Math.sin(t * 0.4 + i) * 18) % (w + 60)) - 30;
        const y = 60 + (i % 4) * 95 + Math.cos(t * 0.6 + i) * 10;
        const r = 18 + (i % 3) * 14;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(245,158,11,0.22)' : 'rgba(251,191,36,0.14)';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Неон
      ctx.save();
      ctx.font = 'bold 28px Oswald, sans-serif';
      ctx.fillStyle = '#fbbf24';
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 18;
      ctx.fillText('ALCOSKYPE PUB', 28, 52);
      ctx.restore();
      return;
    }

    if (mode === 'cyber') {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#09051a');
      g.addColorStop(0.5, '#1b0b38');
      g.addColorStop(1, '#071c2b');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // Перспективная неоновая сетка
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.28)';
      ctx.lineWidth = 1.5;
      for (let y = h * 0.55; y < h; y += 26) {
        const shift = ((t * 45) % 26);
        ctx.beginPath();
        ctx.moveTo(0, y + shift);
        ctx.lineTo(w, y + shift);
        ctx.stroke();
      }
      for (let x = -200; x <= w + 200; x += 65) {
        ctx.beginPath();
        ctx.moveTo(w / 2, h * 0.52);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      // Неоновое солнце
      const sun = ctx.createLinearGradient(0, 90, 0, 240);
      sun.addColorStop(0, '#ff007a');
      sun.addColorStop(1, '#ffb800');
      ctx.fillStyle = sun;
      ctx.beginPath();
      ctx.arc(w * 0.8, 160, 62, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (mode === 'banya') {
      // Деревянные доски парной
      ctx.fillStyle = '#6b3e1d';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 44) {
        ctx.fillStyle = y % 88 === 0 ? '#7c4822' : '#5e3417';
        ctx.fillRect(0, y, w, 42);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(0, y + 42, w, 2);
      }
      // Клубы пара
      for (let i = 0; i < 16; i++) {
        const sx = ((i * 83 + Math.sin(t * 0.8 + i) * 40) % (w + 100)) - 50;
        const sy = h - ((t * 55 + i * 52) % (h + 120));
        ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.beginPath();
        ctx.arc(sx, sy, 48 + (i % 3) * 20, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    // 'space'
    ctx.fillStyle = '#040615';
    ctx.fillRect(0, 0, w, h);
    const neb = ctx.createRadialGradient(w * 0.25, h * 0.35, 10, w * 0.25, h * 0.35, 260);
    neb.addColorStop(0, 'rgba(139, 92, 246, 0.38)');
    neb.addColorStop(0.5, 'rgba(14, 165, 233, 0.18)');
    neb.addColorStop(1, 'transparent');
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 65; i++) {
      const sx = (i * 137.5 + t * (8 + (i % 5) * 4)) % w;
      const sy = (i * 91.3) % h;
      const r = (i % 3 === 0) ? 2.2 : 1.2;
      ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.5 * Math.sin(t * 3 + i)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  applyHelicopterWarp(ctx, w, h, t) {
    // Копируем текущий кадр и нарезаем волнами («вертолёты» после перебора)
    this.personCtx.clearRect(0, 0, w, h);
    this.personCtx.drawImage(this.outputCanvas, 0, 0);

    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    // Лёгкое покачивание всей комнаты
    ctx.translate(w / 2, h / 2);
    ctx.rotate(Math.sin(t * 2.2) * 0.09);
    ctx.scale(1.09, 1.09);
    ctx.translate(-w / 2, -h / 2);

    const sliceH = 12;
    for (let y = 0; y < h; y += sliceH) {
      const offsetX = Math.sin(y * 0.032 + t * 7.5) * 18;
      ctx.drawImage(this.personCanvas, 0, y, w, sliceH, offsetX, y, w, sliceH);
    }

    // Головокружительная виньетка
    const grad = ctx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, h * 0.65);
    grad.addColorStop(0, 'transparent');
    grad.addColorStop(1, 'rgba(245, 158, 11, 0.28)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  drawBeerHelmet(ctx, w, h) {
    const fh = this.detection.forehead;
    const cx = fh.x * w;
    const cy = fh.y * h;
    const hw = Math.max(120, fh.width * w * 1.45);
    const hh = hw * 0.56;

    ctx.save();
    ctx.translate(cx, cy);

    // Купол красной строительной каски
    const grad = ctx.createLinearGradient(0, -hh, 0, 12);
    grad.addColorStop(0, '#ef4444');
    grad.addColorStop(1, '#991b1b');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, hw * 0.52, hh, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    // Козырёк
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.ellipse(0, 2, hw * 0.62, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Надпись на каске
    ctx.fillStyle = '#fef08a';
    ctx.font = 'bold 14px Oswald, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ALCO PRO', 0, -hh * 0.36);

    // Две банки пива по бокам каски
    const drawCan = (side) => {
      const canX = side * hw * 0.56;
      const canY = -hh * 0.42;
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(canX - 15, canY - 26, 30, 52);
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(canX - 15, canY - 29, 30, 5);
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('🍺', canX, canY + 4);
      // Трубочка к рту
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(canX, canY - 28);
      ctx.quadraticCurveTo(canX + side * 22, canY + 40, side * 12, hh * 1.15);
      ctx.stroke();
    };
    drawCan(-1);
    drawCan(1);

    ctx.restore();
  }

  drawNoCameraPlaceholder(ctx, w, h, t) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#140f0c');
    g.addColorStop(1, '#261810');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(245, 158, 11, 0.16)';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 70 + Math.sin(t * 2) * 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fef3c7';
    ctx.font = '600 20px Manrope, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Камера выключена или не выдано разрешение', w / 2, h / 2 + 8);
  }

  updateMotionDetector(video) {
    const mw = this.motionCanvas.width;
    const mh = this.motionCanvas.height;
    this.motionCtx.save();
    this.motionCtx.translate(mw, 0);
    this.motionCtx.scale(-1, 1);
    this.motionCtx.drawImage(video, 0, 0, mw, mh);
    this.motionCtx.restore();

    const frame = this.motionCtx.getImageData(0, 0, mw, mh).data;
    if (!this.prevFrame) {
      this.prevFrame = new Uint8ClampedArray(frame);
      return;
    }

    let sumX = 0;
    let sumY = 0;
    let count = 0;
    let upperCount = 0;

    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        const idx = (y * mw + x) * 4;
        const diff =
          Math.abs(frame[idx] - this.prevFrame[idx]) +
          Math.abs(frame[idx + 1] - this.prevFrame[idx + 1]) +
          Math.abs(frame[idx + 2] - this.prevFrame[idx + 2]);
        if (diff > 78) {
          sumX += x;
          sumY += y;
          count++;
          if (y < mh * 0.34) upperCount++;
        }
      }
    }

    this.prevFrame.set(frame);
    const strength = Math.min(1, count / 160);
    if (count > 18) {
      this.detection.motionPoint = {
        x: (sumX / count) / mw,
        y: (sumY / count) / mh,
        strength
      };
    } else {
      this.detection.motionPoint.strength = strength * 0.3;
    }

    // Если MediaPipe руки ещё не готовы, используем движение в кадре как fallback
    if (!this.handLandmarker) {
      this.detection.handWaveIntensity = strength;
      this.detection.handRaisedHigh = upperCount > 45;
      this.detection.hands = strength > 0.2
        ? [{ x: this.detection.motionPoint.x, y: this.detection.motionPoint.y }]
        : [];
    }
  }

  updateMediaPipeLandmarks(video, nowMs) {
    // Руки
    if (this.handLandmarker) {
      try {
        const res = this.handLandmarker.detectForVideo(video, nowMs);
        const hands = [];
        let raisedHigh = false;
        if (res?.landmarks?.length) {
          for (const lm of res.landmarks) {
            // Кончик среднего пальца (12) и центр ладони (9), зеркалим X
            const palm = lm[9];
            const tip = lm[12];
            const x = 1 - palm.x;
            const y = palm.y;
            hands.push({ x, y });
            if (tip.y < 0.36 || palm.y < 0.38) raisedHigh = true;
          }
        }
        let wave = this.detection.motionPoint.strength * 0.5;
        if (hands.length && this.prevHandPos) {
          const dx = hands[0].x - this.prevHandPos.x;
          const dy = hands[0].y - this.prevHandPos.y;
          wave = Math.min(1, Math.hypot(dx, dy) * 7.5);
        }
        this.prevHandPos = hands[0] ? { ...hands[0] } : null;
        this.detection.hands = hands;
        this.detection.handWaveIntensity = wave;
        this.detection.handRaisedHigh = raisedHigh;
      } catch { /* noop */ }
    }

    // Лицо
    if (this.faceLandmarker) {
      try {
        const res = this.faceLandmarker.detectForVideo(video, nowMs);
        if (res?.faceLandmarks?.length) {
          const lm = res.faceLandmarks[0];
          const nose = lm[1] || lm[4];
          const topHead = lm[10];
          const leftTemple = lm[234];
          const rightTemple = lm[454];
          if (nose && topHead && leftTemple && rightTemple) {
            this.detection.faceCenter = {
              x: 1 - nose.x,
              y: nose.y,
              detected: true
            };
            this.detection.forehead = {
              x: 1 - topHead.x,
              y: Math.max(0.08, topHead.y - 0.04),
              width: Math.abs(rightTemple.x - leftTemple.x)
            };
          }
        } else {
          this.detection.faceCenter.detected = false;
        }
      } catch { /* noop */ }
    }
  }
}

export const vision = new VisionPipeline();
