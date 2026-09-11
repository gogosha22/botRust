import { EventEmitter } from "node:events";
import { FcmPairingListener } from "./fcm-pairing.js";
import { RustMonitor } from "./rust-client.js";

export class AccountManager extends EventEmitter {
  constructor(config, store) {
    super();
    this.config = config;
    this.store = store;
    this.accounts = new Map();
  }

  profile(userId) {
    return this.store.profile(userId);
  }

  async registerCredentials(userId, text) {
    const { parseCredentialInfo } = await import("./credentials.js");
    const fcmCredentials = parseCredentialInfo(text);
    if (!fcmCredentials) {
      throw new Error("Не нашёл android ID и security token. Пришли всю строку `/credentials add ...` целиком.");
    }
    const previous = this.store.getAccount(userId) || {};
    this.store.setAccount(userId, { ...previous, fcmCredentials });
    const oldRuntime = this.accounts.get(String(userId));
    oldRuntime?.fcm?.stop();
    if (oldRuntime) oldRuntime.fcm = null;
    await this.startFcm(userId);
    this.emit("waitingForPairing", { userId });
    return fcmCredentials;
  }

  async startFcm(userId) {
    const account = this.store.getAccount(userId);
    if (!account?.fcmCredentials || this.accounts.get(String(userId))?.fcm) return;
    const fcm = new FcmPairingListener(account.fcmCredentials);
    const runtime = this.accounts.get(String(userId)) || {};
    runtime.fcm = fcm;
    this.accounts.set(String(userId), runtime);
    fcm.on("pairing", (pairing) => this.attachPairing(userId, pairing).catch((error) => {
      this.emit("error", { userId, error, source: "Pairing" });
    }));
    fcm.on("notification", (notification) => this.emit("notification", { userId, notification }));
    try {
      await fcm.start();
    } catch (error) {
      runtime.fcm = null;
      this.accounts.set(String(userId), runtime);
      this.emit("error", { userId, error, source: "FCM" });
    }
  }

  async attachPairing(userId, pairing) {
    const previous = this.store.getAccount(userId) || {};
    const ids = {
      smartAlarmIds: previous.smartAlarmIds || [],
      storageMonitorIds: previous.storageMonitorIds || []
    };
    if (pairing.entityId && String(pairing.entityType || "").toLowerCase().includes("alarm")) {
      ids.smartAlarmIds = [...new Set([...ids.smartAlarmIds, Number(pairing.entityId)])];
    }
    if (pairing.entityId && String(pairing.entityType || "").toLowerCase().includes("storage")) {
      ids.storageMonitorIds = [...new Set([...ids.storageMonitorIds, Number(pairing.entityId)])];
    }
    this.store.setAccount(userId, { ...previous, ...pairing, ...ids });
    await this.connectRust(userId);
    this.emit("pairing", { userId, pairing });
  }

  async connectRust(userId) {
    const account = this.store.getAccount(userId);
    if (!account?.server || !account?.port || !account?.steamId || !account?.playerToken) {
      throw new Error("Pairing notification не содержит полные данные сервера.");
    }
    const current = this.accounts.get(String(userId)) || {};
    if (current.monitor) current.monitor.disconnect();
    const profile = this.profile(userId);
    const monitor = new RustMonitor({
      ...this.config,
      rustServer: account.server,
      rustPort: Number(account.port),
      steamId: String(account.steamId),
      playerToken: account.playerToken,
      smartAlarmIds: [...new Set([...(account.smartAlarmIds || []), ...this.config.defaultSmartAlarmIds])],
      storageMonitorIds: [...new Set([...(account.storageMonitorIds || []), ...this.config.defaultStorageMonitorIds])]
    });
    current.monitor = monitor;
    this.accounts.set(String(userId), current);
    for (const event of ["connected", "disconnected", "error", "pollError", "chat", "team", "time", "markers", "info", "entityChanged", "outgoingChat"]) {
      monitor.on(event, (...args) => this.emit(event, { userId, monitor, profile, args }));
    }
    await monitor.connect();
  }

  getMonitor(userId) {
    return this.accounts.get(String(userId))?.monitor || null;
  }

  hasAccount(userId) {
    return Boolean(this.store.getAccount(userId));
  }

  status(userId) {
    const account = this.store.getAccount(userId);
    const monitor = this.getMonitor(userId);
    if (!account) return "Аккаунт не привязан. Пришли `/credentials add ...` из Credential Application.";
    if (!account.server) return "FCM credentials сохранены. Теперь открой Rust и нажми Pair with Server.";
    return monitor?.connected
      ? `Rust+ подключён к ${account.server}:${account.port}.`
      : `Pairing найден для ${account.server}:${account.port}, Rust+ ещё подключается.`;
  }

  async startAll() {
    for (const userId of this.store.allUserIds()) {
      await this.startFcm(userId);
      if (this.store.getAccount(userId)?.server) {
        try {
          await this.connectRust(userId);
        } catch (error) {
          this.emit("error", { userId, error, source: "Rust+" });
        }
      }
    }
  }

  async forget(userId) {
    const runtime = this.accounts.get(String(userId));
    runtime?.fcm?.stop();
    runtime?.monitor?.disconnect();
    this.accounts.delete(String(userId));
    this.store.deleteAccount(userId);
  }
}