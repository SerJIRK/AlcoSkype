// AlcoSkype 2.0 Pro — Гибридное хранилище (localStorage + PeerJS sync + опциональный Firebase RTDB)

import { DEFAULT_CONFIG, sanitizeClubKey } from './config.js';

const KEYS = {
  GATE_UNLOCKED: 'alcoskype_gate_unlocked_v2',
  SETTINGS: 'alcoskype_settings_v2',
  ACCOUNTS: 'alcoskype_accounts_v2',
  CHAT: 'alcoskype_chat_v2'
};

class StorageManager {
  constructor() {
    this.eventSource = null;
    this.pollTimer = null;
    this.cloudListeners = new Set();
    this.lastCloudHash = '';
  }

  // --- Настройки ---
  getSettings() {
    try {
      const raw = localStorage.getItem(KEYS.SETTINGS);
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        clubKey: parsed.clubKey || DEFAULT_CONFIG.clubKey,
        adminPassword: parsed.adminPassword || DEFAULT_CONFIG.adminPassword,
        firebaseDatabaseUrl: (parsed.firebaseDatabaseUrl ?? DEFAULT_CONFIG.firebaseDatabaseUrl).trim().replace(/\/+$/, ''),
        theme: parsed.theme || DEFAULT_CONFIG.defaultTheme,
        volume: typeof parsed.volume === 'number' ? parsed.volume : 0.75,
        muted: Boolean(parsed.muted),
        customTurn: {
          url: parsed.customTurn?.url || DEFAULT_CONFIG.customTurn.url,
          username: parsed.customTurn?.username || DEFAULT_CONFIG.customTurn.username,
          credential: parsed.customTurn?.credential || DEFAULT_CONFIG.customTurn.credential
        }
      };
    } catch {
      return {
        clubKey: DEFAULT_CONFIG.clubKey,
        adminPassword: DEFAULT_CONFIG.adminPassword,
        firebaseDatabaseUrl: DEFAULT_CONFIG.firebaseDatabaseUrl,
        theme: DEFAULT_CONFIG.defaultTheme,
        volume: 0.75,
        muted: false,
        customTurn: { ...DEFAULT_CONFIG.customTurn }
      };
    }
  }

  saveSettings(partial) {
    const current = this.getSettings();
    const merged = {
      ...current,
      ...partial,
      customTurn: {
        ...current.customTurn,
        ...(partial.customTurn || {})
      }
    };
    if (merged.firebaseDatabaseUrl) {
      merged.firebaseDatabaseUrl = merged.firebaseDatabaseUrl.trim().replace(/\/+$/, '');
    }
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(merged));
    return merged;
  }

  // --- Club Gate ---
  isGateUnlocked() {
    const savedKey = localStorage.getItem(KEYS.GATE_UNLOCKED);
    const { clubKey } = this.getSettings();
    return Boolean(savedKey && sanitizeClubKey(savedKey) === sanitizeClubKey(clubKey));
  }

  tryUnlockGate(inputKey) {
    const { clubKey } = this.getSettings();
    if (sanitizeClubKey(inputKey) === sanitizeClubKey(clubKey)) {
      localStorage.setItem(KEYS.GATE_UNLOCKED, clubKey);
      return true;
    }
    return false;
  }

  lockGate() {
    localStorage.removeItem(KEYS.GATE_UNLOCKED);
  }

  // --- Аккаунты (максимум 4 слота: 1..4) ---
  getAccounts() {
    try {
      const raw = localStorage.getItem(KEYS.ACCOUNTS);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(a => a && a.slot >= 1 && a.slot <= DEFAULT_CONFIG.maxAccounts)
        .sort((a, b) => a.slot - b.slot);
    } catch {
      return [];
    }
  }

  saveAccounts(accounts) {
    const clean = accounts
      .filter(a => a && a.slot >= 1 && a.slot <= DEFAULT_CONFIG.maxAccounts)
      .slice(0, DEFAULT_CONFIG.maxAccounts)
      .sort((a, b) => a.slot - b.slot);
    localStorage.setItem(KEYS.ACCOUNTS, JSON.stringify(clean));
    return clean;
  }

  getFreeSlot() {
    const taken = new Set(this.getAccounts().map(a => a.slot));
    for (let s = 1; s <= DEFAULT_CONFIG.maxAccounts; s++) {
      if (!taken.has(s)) return s;
    }
    return null;
  }

  createAccount({ name, avatar, pin }) {
    const accounts = this.getAccounts();
    if (accounts.length >= DEFAULT_CONFIG.maxAccounts) {
      return { ok: false, error: 'В баре уже максимум 4 собутыльника! Удали лишнего через Техподдержку.' };
    }
    const cleanName = String(name || '').trim().slice(0, 20);
    const cleanPin = String(pin || '').replace(/[^1-9]/g, '');
    if (cleanName.length < 2) {
      return { ok: false, error: 'Имя должно быть хотя бы 2 символа!' };
    }
    if (cleanPin.length !== 4) {
      return { ok: false, error: 'PIN должен состоять из 4 цифр (от 1 до 9)!' };
    }
    if (accounts.some(a => a.pin === cleanPin)) {
      return { ok: false, error: 'Этот PIN уже занят другим собутыльником! Придумай свой.' };
    }
    const slot = this.getFreeSlot();
    if (!slot) {
      return { ok: false, error: 'Свободных табуреток у стойки не осталось (максимум 4).' };
    }
    const now = Date.now();
    const account = {
      id: `slot-${slot}`,
      slot,
      name: cleanName,
      avatar: avatar || '🍺',
      pin: cleanPin,
      drinksCount: 0,
      createdAt: now,
      updatedAt: now
    };
    const updated = this.saveAccounts([...accounts, account]);
    this.pushAccountToCloud(account).catch(() => {});
    return { ok: true, account, accounts: updated };
  }

  deleteAccount(slot) {
    const accounts = this.getAccounts();
    const filtered = accounts.filter(a => a.slot !== Number(slot));
    this.saveAccounts(filtered);
    this.deleteAccountFromCloud(slot).catch(() => {});
    return filtered;
  }

  findAccountByPin(pin) {
    return this.getAccounts().find(a => a.pin === String(pin)) || null;
  }

  // Слияние аккаунтов, полученных по PeerJS DataChannel или из Firebase
  mergeRemoteAccounts(remoteList) {
    if (!Array.isArray(remoteList) || remoteList.length === 0) return this.getAccounts();
    const localMap = new Map(this.getAccounts().map(a => [a.slot, a]));
    let changed = false;

    for (const remote of remoteList) {
      if (!remote || !remote.slot || remote.slot < 1 || remote.slot > DEFAULT_CONFIG.maxAccounts) continue;
      if (!remote.name || !remote.pin) continue;
      const existing = localMap.get(remote.slot);
      if (!existing || (remote.updatedAt || 0) > (existing.updatedAt || 0)) {
        localMap.set(remote.slot, {
          id: `slot-${remote.slot}`,
          slot: Number(remote.slot),
          name: String(remote.name).slice(0, 20),
          avatar: remote.avatar || '🍺',
          pin: String(remote.pin),
          drinksCount: Number(remote.drinksCount || 0),
          createdAt: remote.createdAt || Date.now(),
          updatedAt: remote.updatedAt || Date.now()
        });
        changed = true;
      }
    }

    const merged = Array.from(localMap.values()).sort((a, b) => a.slot - b.slot);
    if (changed) {
      this.saveAccounts(merged);
    }
    return merged;
  }

  // --- Чат ---
  getChatHistory() {
    try {
      const raw = localStorage.getItem(KEYS.CHAT);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(-80) : [];
    } catch {
      return [];
    }
  }

  appendChatMessage(msg) {
    const list = this.getChatHistory();
    if (list.some(m => m.id === msg.id)) return list;
    const next = [...list, msg].slice(-80);
    localStorage.setItem(KEYS.CHAT, JSON.stringify(next));
    return next;
  }

  // --- Firebase Realtime Database (опционально через REST / EventSource) ---
  getCloudBasePath() {
    const { firebaseDatabaseUrl, clubKey } = this.getSettings();
    if (!firebaseDatabaseUrl) return null;
    const safeKey = sanitizeClubKey(clubKey);
    return `${firebaseDatabaseUrl}/alcoskype/${safeKey}`;
  }

  hasCloudEnabled() {
    return Boolean(this.getCloudBasePath());
  }

  async pushAccountToCloud(account) {
    const base = this.getCloudBasePath();
    if (!base) return false;
    const res = await fetch(`${base}/accounts/slot_${account.slot}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(account)
    });
    return res.ok;
  }

  async deleteAccountFromCloud(slot) {
    const base = this.getCloudBasePath();
    if (!base) return false;
    const res = await fetch(`${base}/accounts/slot_${slot}.json`, { method: 'DELETE' });
    return res.ok;
  }

  async pushPresenceToCloud(slot, online) {
    const base = this.getCloudBasePath();
    if (!base) return false;
    const res = await fetch(`${base}/presence/slot_${slot}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot, online, ts: Date.now() })
    });
    return res.ok;
  }

  async fetchCloudSnapshot() {
    const base = this.getCloudBasePath();
    if (!base) return null;
    const res = await fetch(`${base}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data) return null;

    const remoteAccounts = data.accounts ? Object.values(data.accounts).filter(Boolean) : [];
    const accounts = this.mergeRemoteAccounts(remoteAccounts);
    const presence = data.presence || {};
    return { accounts, presence };
  }

  onCloudUpdate(cb) {
    this.cloudListeners.add(cb);
    return () => this.cloudListeners.delete(cb);
  }

  emitCloudUpdate(payload) {
    for (const cb of this.cloudListeners) {
      try { cb(payload); } catch { /* noop */ }
    }
  }

  startCloudSync() {
    this.stopCloudSync();
    const base = this.getCloudBasePath();
    if (!base) return;

    // 1. Первичный фетч и выгрузка локальных аккаунтов
    this.fetchCloudSnapshot()
      .then(snap => {
        if (snap) this.emitCloudUpdate(snap);
        for (const acc of this.getAccounts()) {
          this.pushAccountToCloud(acc).catch(() => {});
        }
      })
      .catch(() => {});

    // 2. Попытка реалтайм EventSource (Firebase REST Streaming)
    try {
      const es = new EventSource(`${base}.json`);
      es.addEventListener('put', () => {
        this.fetchCloudSnapshot().then(snap => snap && this.emitCloudUpdate(snap)).catch(() => {});
      });
      es.addEventListener('patch', () => {
        this.fetchCloudSnapshot().then(snap => snap && this.emitCloudUpdate(snap)).catch(() => {});
      });
      es.onerror = () => {
        // Если EventSource закрыт, держим резервный лёгкий поллинг
        es.close();
        this.eventSource = null;
      };
      this.eventSource = es;
    } catch {
      this.eventSource = null;
    }

    // 3. Резервный поллинг раз в 12 секунд
    this.pollTimer = setInterval(() => {
      this.fetchCloudSnapshot()
        .then(snap => {
          if (!snap) return;
          const hash = JSON.stringify(snap);
          if (hash !== this.lastCloudHash) {
            this.lastCloudHash = hash;
            this.emitCloudUpdate(snap);
          }
        })
        .catch(() => {});
    }, 12000);
  }

  stopCloudSync() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}

export const storage = new StorageManager();
