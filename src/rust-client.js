import { EventEmitter } from "node:events";

function valueAt(payload, keys) {
  for (const key of keys) {
    if (payload?.[key] !== undefined) return payload[key];
  }
  return undefined;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.items)) return value.items;
  if (value && Array.isArray(value.members)) return value.members;
  if (value && Array.isArray(value.markers)) return value.markers;
  if (value && Array.isArray(value.messages)) return value.messages;
  if (value && (value.message !== undefined || value.text !== undefined || value.content !== undefined)) {
    return [value];
  }
  return [];
}

function textOfMessage(item) {
  const value = item?.message ?? item?.text ?? item?.content ?? item?.messageText;
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    return value.message ?? value.text ?? value.content ?? "";
  }
  return "";
}

function asBoolean(value) {
  if (typeof value === "string") {
    if (["false", "0", "dead", "offline"].includes(value.toLowerCase())) return false;
    if (["true", "1", "alive", "online"].includes(value.toLowerCase())) return true;
  }
  return Boolean(value);
}

export function normalizeTime(payload) {
  const raw = (typeof payload === "number" || typeof payload === "string")
    ? payload
    : valueAt(payload, ["time", "currentTime", "serverTime"]);
  const nested = payload?.response?.time;
  const value = raw ?? (typeof nested === "string" ? nested : nested?.time);
  return formatGameTime(value);
}

function formatGameTime(value) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  const clock = text.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/);
  if (clock) {
    return `${String(Number(clock[1]) % 24).padStart(2, "0")}:${String(Number(clock[2])).padStart(2, "0")}`;
  }

  const number = Number(value);
  if (!Number.isFinite(number)) return null;

  // Rust+ returns the in-game clock as a decimal hour, e.g. 18.0787 = 18:04.
  // Flooring the minutes matches the clock shown inside Rust instead of rounding
  // into the next minute.
  const totalMinutes = Math.floor((number % 24) * 60);
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function normalizeTeam(payload) {
  const response = payload?.response || payload;
  return asArray(response?.teamInfo || response?.team || response)
    .filter(Boolean)
    .map((member) => {
      const alive = member.isAlive ?? member.alive ?? member.is_alive ??
        (member.isDead !== undefined ? !member.isDead : undefined) ??
        (member.dead !== undefined ? !member.dead : undefined);
      const online = member.online ?? member.isOnline;
      return {
        ...member,
        ...(alive === undefined ? {} : { isAlive: asBoolean(alive) }),
        ...(online === undefined ? {} : { online: asBoolean(online) })
      };
    });
}

export function normalizeChat(payload) {
  const response = payload?.response || payload;
  const sources = [
    payload?.broadcast?.teamMessage,
    payload?.broadcast?.teamChat,
    response?.teamMessage,
    response?.teamChat,
    response?.chat,
    response?.teamChatMessages,
    payload?.teamMessage,
    payload?.teamChat,
    payload
  ].filter(Boolean);
  const messages = sources.flatMap((source) => {
    if (source?.message && typeof source.message === "object") return [{ ...source, ...source.message }];
    return asArray(source);
  });
  return messages
    .filter((item) => item && textOfMessage(item))
    .map((item) => ({
      ...item,
      message: textOfMessage(item),
      messageId: item.messageId ?? item.id
    }))
    .filter((item, index, all) => {
      const key = `${item.messageId ?? ""}|${item.steamId ?? item.name ?? ""}|${item.message}`;
      return all.findIndex((candidate) =>
        `${candidate.messageId ?? ""}|${candidate.steamId ?? candidate.name ?? ""}|${candidate.message}` === key
      ) === index;
    });
}

export function normalizeMarkers(payload) {
  const response = payload?.response || payload?.broadcast || payload;
  const source = response?.mapMarkers || response?.markers || response?.marker || response?.mapMarker || response;
  if (source?.marker) return [source.marker].filter(Boolean);
  if (source && !Array.isArray(source) && (source.id !== undefined || source.type !== undefined || source.name || source.x !== undefined)) {
    return [source];
  }
  return asArray(source).filter(Boolean);
}

export function normalizeServerInfo(payload) {
  const response = payload?.response || payload;
  const info = response?.info || response?.serverInfo || response;
  if (!info || typeof info !== "object") return {};
  return {
    ...info,
    name: info.name || info.serverName || info.hostname || info.title,
    map: info.map || info.level,
    mapSize: info.mapSize ?? info.size,
    players: info.players ?? info.onlinePlayers ?? info.playerCount,
    maxPlayers: info.maxPlayers ?? info.maxPlayersCount ?? info.max_players,
    queuedPlayers: info.queuedPlayers ?? info.queued ?? info.queue,
    joiningPlayers: info.joiningPlayers ?? info.joining,
    lootMultiplier: info.lootMultiplier ?? info.loot_multiplier,
    respawnMultiplier: info.respawnMultiplier ?? info.respawn_multiplier,
    plugins: info.plugins,
    seed: info.seed,
    wipeTime: info.wipeTime ?? info.wipeTimestamp ?? info.wipe
  };
}

function bytesToDataUrl(value) {
  if (!value) return null;
  if (typeof value === "string") {
    if (value.startsWith("data:image/")) return value;
    return `data:image/jpeg;base64,${value}`;
  }
  if (Buffer.isBuffer(value)) return `data:image/jpeg;base64,${value.toString("base64")}`;
  if (value instanceof Uint8Array) {
    return `data:image/jpeg;base64,${Buffer.from(value).toString("base64")}`;
  }
  if (value?.type === "Buffer" && Array.isArray(value.data)) {
    return `data:image/jpeg;base64,${Buffer.from(value.data).toString("base64")}`;
  }
  if (Array.isArray(value) && value.every((item) => Number.isInteger(item))) {
    return `data:image/jpeg;base64,${Buffer.from(value).toString("base64")}`;
  }
  return null;
}

export function normalizeMap(payload) {
  const response = payload?.response || payload;
  const map = response?.map || response?.mapData || response;
  if (!map || typeof map !== "object") return {};
  const monuments = Array.isArray(map.monuments)
    ? map.monuments.map((monument) => ({
      token: monument.token || monument.name || "РТ",
      x: Number(monument.x),
      y: Number(monument.y)
    })).filter((monument) => Number.isFinite(monument.x) && Number.isFinite(monument.y))
    : [];
  return {
    width: map.width,
    height: map.height,
    oceanMargin: map.oceanMargin,
    image: bytesToDataUrl(map.jpgImage || map.image || map.background),
    monuments
  };
}

export function markerKey(marker) {
  return String(
    marker.id ??
    marker.markerId ??
    `${marker.type}:${marker.name}:${Math.round(Number(marker.x || 0) * 100)}:${Math.round(Number(marker.y || 0) * 100)}`
  );
}

export class RustMonitor extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.client = null;
    this.timer = null;
    this.mapTimer = null;
    this.mapImageTimer = null;
    this.polling = false;
    this.mapPolling = false;
    this.mapImagePolling = false;
    this.connected = false;
  }

  async connect() {
    if (this.config.simulationMode) {
      this.connected = true;
      this.emit("connected");
      this.poll();
      this.pollMap();
      this.pollMapImage();
      return;
    }
    const RustPlusModule = await import("@grolm/rustplus.js-typed");
    const RustPlus =
      RustPlusModule.RustPlus ||
      RustPlusModule.default?.RustPlus ||
      (typeof RustPlusModule.default === "function" ? RustPlusModule.default : null);
    if (typeof RustPlus !== "function") {
      throw new Error("Не найден конструктор RustPlus в установленной библиотеке.");
    }
    this.client = new RustPlus(
      this.config.rustServer,
      this.config.rustPort,
      this.config.steamId,
      this.config.playerToken
    );
    this.client.on("connected", () => {
      this.connected = true;
      this.emit("connected");
      this.poll();
      this.pollMap();
      this.pollMapImage();
    });
    this.client.on("disconnected", () => {
      this.connected = false;
      this.emit("disconnected");
    });
    this.client.on("error", (error) => this.emit("error", error));
    this.client.on("message", (message) => this.handleMessage(message));
    this.client.connect();
  }

  disconnect() {
    if (this.timer) clearTimeout(this.timer);
    if (this.mapTimer) clearTimeout(this.mapTimer);
    if (this.mapImageTimer) clearTimeout(this.mapImageTimer);
    this.timer = null;
    this.mapTimer = null;
    this.mapImageTimer = null;
    if (this.client?.disconnect) this.client.disconnect();
    this.connected = false;
  }

  handleMessage(message) {
    const changed = message?.broadcast?.entityChanged;
    if (changed) this.emit("entityChanged", changed);
    const mapPayload = message?.broadcast?.mapMarkers ||
      message?.broadcast?.mapMarkersChanged ||
      message?.broadcast?.mapMarker ||
      message?.mapMarkers;
    const markers = normalizeMarkers(mapPayload);
    if (markers.length) this.emit("markers", markers, mapPayload, { incremental: true });
    const teamPayload = message?.broadcast?.teamInfo ||
      message?.broadcast?.teamChanged ||
      message?.teamInfo;
    const team = normalizeTeam(teamPayload);
    if (team.length) this.emit("team", team, teamPayload);
    const chat = normalizeChat(message);
    if (chat.length) this.emit("chat", chat);
  }

  request(method, ...args) {
    if (this.config.simulationMode) return Promise.resolve(this.simulated(method));
    if (!this.client || typeof this.client[method] !== "function") {
      return Promise.reject(new Error(`Rust+ метод ${method} недоступен`));
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Таймаут Rust+ метода ${method}`)), 12000);
      try {
        this.client[method](...args, (message) => {
          clearTimeout(timeout);
          resolve(message);
          return true;
        });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  simulated(method) {
    if (method === "getTime") return { response: { time: { time: "12:00" } } };
    if (method === "getTeamInfo") {
      return { response: { teamInfo: { members: [{ steamId: this.config.steamId, name: "You", online: true, isAlive: true }] } } };
    }
    if (method === "getTeamChat") return { response: { teamChat: { messages: [] } } };
    if (method === "getMapMarkers") return { response: { mapMarkers: { markers: [] } } };
    if (method === "getInfo") return { response: { info: { name: "Simulation Rust server", map: "Procedural Map" } } };
    if (method === "getMap") return { response: { map: { width: 1024, height: 1024, monuments: [] } } };
    return {};
  }

  async poll() {
    if (!this.connected || this.polling) return;
    this.polling = true;
    const calls = [
      ["team", "getTeamInfo", normalizeTeam],
      ["chat", "getTeamChat", normalizeChat],
      ["time", "getTime", normalizeTime],
      ["info", "getInfo", normalizeServerInfo]
    ];
    await Promise.all(calls.map(async ([event, method, normalize]) => {
      try {
        const payload = await this.request(method);
        this.emit(event, normalize(payload), payload);
      } catch (error) {
        this.emit("pollError", { method, error });
      }
    }));
    this.polling = false;
    this.timer = setTimeout(() => this.poll(), this.config.pollIntervalMs);
  }

  async pollMap() {
    if (!this.connected || this.mapPolling) return;
    this.mapPolling = true;
    try {
      const payload = await this.request("getMapMarkers");
      this.emit("markers", normalizeMarkers(payload), payload, { incremental: false });
    } catch (error) {
      this.emit("pollError", { method: "getMapMarkers", error });
    } finally {
      this.mapPolling = false;
      if (this.connected) {
        this.mapTimer = setTimeout(() => this.pollMap(), this.config.mapPollIntervalMs);
      }
    }
  }

  async pollMapImage() {
    if (!this.connected || this.mapImagePolling) return;
    this.mapImagePolling = true;
    try {
      const payload = await this.request("getMap");
      this.emit("map", normalizeMap(payload), payload);
    } catch (error) {
      this.emit("pollError", { method: "getMap", error });
    } finally {
      this.mapImagePolling = false;
      if (this.connected) {
        this.mapImageTimer = setTimeout(() => this.pollMapImage(), this.config.mapImagePollIntervalMs);
      }
    }
  }

  async subscribeToEntities() {
    const ids = [...new Set([...this.config.smartAlarmIds, ...this.config.storageMonitorIds])];
    for (const id of ids) {
      try {
        await this.request("getEntityInfo", id);
      } catch (error) {
        this.emit("pollError", { method: `getEntityInfo(${id})`, error });
      }
    }
  }

  async sendTeamMessage(message) {
    if (!message?.trim()) throw new Error("Пустое сообщение");
    if (this.config.simulationMode) {
      this.emit("outgoingChat", message);
      return;
    }
    if (!this.client?.sendTeamMessage) throw new Error("Rust+ ещё не подключён");
    this.client.sendTeamMessage(message);
  }

  async snapshot() {
    const [team, time, markers, info] = await Promise.all(
      ["getTeamInfo", "getTime", "getMapMarkers", "getInfo"].map((method) => this.request(method))
    );
    return { team: normalizeTeam(team), time: normalizeTime(time), markers: normalizeMarkers(markers), info };
  }
}