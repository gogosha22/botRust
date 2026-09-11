import { loadConfig, validateConfig, ensureDataDir } from "./config.js";
import { Store } from "./storage.js";
import { AccountManager } from "./account-manager.js";
import { createTelegramBot } from "./telegram.js";
import {
  normalizeChat,
  normalizeMarkers,
  normalizeTeam,
  normalizeTime,
  normalizeServerInfo,
  markerKey
} from "./rust-client.js";
import { RT_CATALOG, RT_CATEGORIES, findMonument, formatMonument, markerSquare } from "./rt-catalog.js";
import { decayEstimate, formatDuration, parseDecayCommand } from "./decay.js";
import { createWebAppServer } from "./web-app.js";

const config = loadConfig();
const errors = validateConfig(config);
if (errors.length) {
  console.error(`Не заполнены настройки: ${errors.join("; ")}. Скопируй .env.example в .env.`);
  process.exit(1);
}
ensureDataDir(config);

const store = new Store(config.dataDir, config.botToken);
const manager = new AccountManager(config, store);
const webAppServer = createWebAppServer(config, store, manager);
let bot;
const raidTimers = new Map();

const raidKeyboard = {
  inline_keyboard: [[{ text: "✅ Проснулся — отключить тревогу", callback_data: "raid:ack" }]]
};

const stopRaidAlert = (userId) => {
  const timer = raidTimers.get(String(userId));
  if (timer) clearInterval(timer);
  raidTimers.delete(String(userId));
};

const acknowledgeRaid = (userId) => {
  stopRaidAlert(userId);
  store.profile(userId).update({
    raidAlertActive: false,
    raidAlertEntityId: null
  });
  return true;
};

const startRaidAlert = (userId, reason = "Smart Alarm") => {
  const profile = store.profile(userId);
  const key = String(userId);
  const alreadyActive = profile.get("raidAlertActive");
  profile.update({
    raidAlertActive: true,
    raidAlertStartedAt: profile.get("raidAlertStartedAt") || Date.now(),
    raidAlertEntityId: reason
  });
  if (raidTimers.has(key)) return alreadyActive;

  const notify = async () => {
    if (!store.profile(userId).get("raidAlertActive")) {
      stopRaidAlert(userId);
      return;
    }
    if (!bot) return;
    try {
      await bot.api.sendMessage(
        Number(userId),
        `🚨 ТРЕВОГА РЕЙДА: ${reason}\nСообщение будет повторяться каждые ${Math.round(config.raidAlertIntervalMs / 1000)} сек. Нажми кнопку, когда проснёшься.`,
        { reply_markup: raidKeyboard }
      );
    } catch (error) {
      console.error(`Raid alert ${userId}:`, error.message);
    }
  };
  void notify();
  raidTimers.set(key, setInterval(notify, config.raidAlertIntervalMs));
  return alreadyActive;
};

const sendTelegram = async (userId, text, { force = false } = {}) => {
  const profile = store.profile(userId);
  if (!bot || (!force && !profile.get("enabled"))) return;
  const chunks = String(text).match(/[\s\S]{1,3900}/g) || [String(text)];
  for (const chunk of chunks) {
    try {
      await bot.api.sendMessage(Number(userId), chunk);
    } catch (error) {
      console.error(`Telegram notification ${userId}:`, error.message);
    }
  }
};

const sendNotification = async (userId, text, kind) => {
  const profile = store.profile(userId);
  if (!profile.get("enabled") || !profile.notificationEnabled(kind)) return;
  return sendTelegram(userId, text);
};

const formatDateTime = (timestamp) => {
  if (!timestamp) return "неизвестно";
  const numeric = Number(timestamp);
  const value = Number.isFinite(numeric) && numeric > 0 && numeric < 1e12
    ? numeric * 1000
    : timestamp;
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: config.timezone,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
};

const teamText = (team, userId = null) => {
  if (!team.length) return "Тимейты: данных пока нет.";
  const stored = userId ? store.profile(userId).get("lastTeam") || {} : {};
  return "👥 Тимейты:\n" + team.map((member) => {
    const id = String(member.steamId ?? member.id ?? member.name);
    const previous = stored[id] || {};
    const name = member.name || member.displayName || String(member.steamId || "unknown");
    const online = member.online === undefined ? "статус неизвестен" : member.online ? "онлайн" : "вышел";
    const aliveValue = member.isAlive ?? member.alive ?? member.is_alive;
    const alive = aliveValue === undefined ? "жизнь неизвестна" : aliveValue ? "жив" : "умер";
    const lastLogout = member.lastOfflineAt || previous.lastOfflineAt;
    return `• ${name}: ${online}, ${alive}\n  Последний выход: ${formatDateTime(lastLogout)}`;
  }).join("\n");
};

const markerLabel = (marker) => {
  const raw = `${marker.name || ""} ${marker.type || ""}`.toLowerCase();
  if (raw.includes("cargo") || raw.includes("ship")) return "🚢 Cargo";
  if (raw.includes("heli") || raw.includes("ch47") || raw.includes("chinook")) return "🚁 Вертолёт/Chinook";
  if (raw.includes("deep sea") || raw.includes("deepsea")) return "🌊 Deep Sea Oil Rig";
  if (raw.includes("oil") || raw.includes("rig")) return "🛢 Нефтевышка";
  if (raw.includes("excav") || raw.includes("quarry") || raw.includes("карьер")) return "⛏ Карьер";
  if (raw.includes("crash")) return "💥 Crash site";
  return marker.name || `marker type ${marker.type ?? "unknown"}`;
};

const formatMarkers = (markers) =>
  markers.length
    ? "🗺 Активные маркеры:\n" + markers.map((marker) => `• ${markerLabel(marker)}${marker.id ? ` (#${marker.id})` : ""}`).join("\n")
    : "🗺 Активных map markers не найдено.";

const markerText = (marker) => `${marker.name || ""} ${marker.type || ""} ${marker.markerType || ""}`.toLowerCase();

const nestedArray = (...values) => {
  for (const value of values) {
    if (Array.isArray(value)) return value;
    if (value && Array.isArray(value.items)) return value.items;
    if (value && Array.isArray(value.orders)) return value.orders;
    if (value && Array.isArray(value.sellOrders)) return value.sellOrders;
    if (value && Array.isArray(value.sellOrder)) return value.sellOrder;
    if (value && Array.isArray(value.sell_orders)) return value.sell_orders;
    if (value && Array.isArray(value.offers)) return value.offers;
  }
  return [];
};

const isShopMarker = (marker) => {
  const raw = markerText(marker);
  const serialized = (() => {
    try {
      return JSON.stringify(marker).toLowerCase();
    } catch {
      return "";
    }
  })();
  return /vending|vendingmachine|shop|store|market|магазин|торгов/.test(`${raw} ${serialized}`) ||
    nestedArray(
      marker.sellOrders,
      marker.sell_orders,
      marker.orders,
      marker.offers,
      marker.items,
      marker.vendingMachine?.sellOrders,
      marker.vendingMachine?.orders,
      marker.vendingMachine?.items
    ).length > 0;
};

const shopOrderText = (order) => {
  const item = order.item && typeof order.item === "object" ? order.item : order;
  const name = item.itemName || item.displayName || item.name || item.shortname ||
    (item.itemId ? `item ${item.itemId}` : "предмет");
  const amount = item.amount ?? item.quantity ?? item.stackSize ?? item.quantityCanBuy ?? item.amountToSell;
  const cost = item.costPerItem ?? item.cost ?? item.price ?? item.currencyAmount ?? item.amountToBuy;
  const currency = item.currencyName || item.currencyItemName ||
    (item.currencyItemId || item.currencyId ? `item ${item.currencyItemId || item.currencyId}` : "scrap");
  return `${amount ? `${amount}× ` : ""}${name}${cost !== undefined ? ` за ${cost} ${currency}` : ""}`;
};

const shopLootText = (marker) => {
  const orders = nestedArray(
    marker.sellOrders,
    marker.sell_orders,
    marker.orders,
    marker.offers,
    marker.items,
    marker.vendingMachine?.sellOrders,
    marker.vendingMachine?.orders,
    marker.vendingMachine?.items
  );
  return orders.length
    ? orders.slice(0, 8).map(shopOrderText).join("; ")
    : "лут не передан Rust+";
};

const specialMarkerLabel = (marker) => {
  const raw = markerText(marker);
  if (raw.includes("deep sea") || raw.includes("deepsea")) return "Deep Sea Oil Rig";
  if (raw.includes("oil") || raw.includes("rig") || raw.includes("нефтевыш")) return "нефтевышка";
  if (raw.includes("cargo") || raw.includes("ship") || raw.includes("карго")) return "карго";
  if (raw.includes("heli") || raw.includes("ch47") || raw.includes("chinook") || raw.includes("верт")) return "вертолёт";
  if (raw.includes("excav") || raw.includes("quarry") || raw.includes("карьер")) return "карьер";
  return null;
};

const markerEventText = (marker, profile) => {
  const square = markerSquare(marker, profile.get("serverInfo")?.mapSize) || "квадрат не передан";
  if (isShopMarker(marker)) {
    return [
      "🛒 На карте появился новый магазин.",
      `Квадрат: ${square}`,
      `Название: ${marker.name || marker.shopName || "без названия"}`,
      `Лут: ${shopLootText(marker)}`
    ].join("\n");
  }
  const event = specialMarkerLabel(marker);
  if (event) return `📢 Появился ${event}.\nКвадрат: ${square}`;
  return `📢 Новое событие: ${markerLabel(marker)}.\nКвадрат: ${square}`;
};

const favoritesOf = (profile) => {
  const stored = profile.get("favoriteMonuments");
  if (Array.isArray(stored)) return stored;
  const legacy = profile.get("favoriteMonument");
  return legacy ? [legacy] : [];
};

const remainingMinutes = (timestamp) => {
  if (!timestamp) return null;
  return Math.max(0, Math.ceil((Number(timestamp) - Date.now()) / 60000));
};

const effectiveRespawnMinutes = (profile, item) => {
  const observation = profile.get("lootObservations")?.[item.slug];
  const value = Number(observation?.respawnMinutes);
  if (Number.isFinite(value) && value > 0) return Math.round(value);
  const serverMultiplier = Number(profile.get("serverInfo")?.respawnMultiplier);
  const multiplier = Number.isFinite(serverMultiplier) && serverMultiplier > 0
    ? serverMultiplier
    : config.respawnMultiplier;
  return Math.max(1, Math.round(item.respawnMinutes / multiplier));
};

const lootStatus = (profile, item) => {
  const timer = remainingMinutes(profile.get("rtTimers")?.[item.slug]);
  const observation = profile.get("lootObservations")?.[item.slug];
  const minutes = effectiveRespawnMinutes(profile, item);
  const source = observation?.samples ? `, замеров: ${observation.samples}` : "";
  if (timer === null) return `респавн ~${minutes} мин.${source}`;
  if (timer === 0) return "лут уже должен быть доступен";
  return `лут через ~${timer} мин.`;
};

const rtListText = (userId) => {
  const profile = store.profile(userId);
  const favorites = new Set(favoritesOf(profile));
  return [
    "🗺 РТ и таймеры лута:",
    ...RT_CATALOG.map((item, index) => {
      return `${index + 1}. ${favorites.has(item.slug) ? "⭐" : "▫️"} ${item.name} — ${lootStatus(profile, item)}`;
    }),
    "",
    "⭐ Нажми на РТ, чтобы добавить или убрать её из избранного.",
    "Таймер можно запустить вручную после сбора лута."
  ].join("\n");
};

const markerMatchesItem = (marker, item) => {
  const raw = `${marker.name || ""} ${marker.type || ""}`.toLowerCase();
  return [item.slug, item.name, ...item.aliases].some((value) =>
    raw.includes(String(value).toLowerCase())
  );
};

const rtCategoryText = async (userId, category) => {
  const items = RT_CATALOG.filter((item) => item.category === category);
  const profile = store.profile(userId);
  let markers = [];
  try {
    markers = normalizeMarkers(await getMonitor(userId).request("getMapMarkers"));
  } catch {
    // The catalog remains useful when the server does not expose map markers.
  }
  return [
    `${RT_CATEGORIES[category] || "🗺 РТ"}:`,
    ...items.map((item) => {
      const marker = markers.find((candidate) => markerMatchesItem(candidate, item));
      const square = markerSquare(marker, profile.get("serverInfo")?.mapSize) || "по текущей карте";
      return `${marker ? "🟢" : "⚪"} ${item.name}\n   Квадрат: ${square}`;
    }),
    "",
    "🟢 — сервер прислал активный marker; ⚪ — объект есть в каталоге, но его marker сейчас не передан."
  ].join("\n");
};

const formatServerInfo = (info, account, monitor) => {
  const players = firstValue(info.players, info.onlinePlayers, info.playerCount);
  const maxPlayers = firstValue(info.maxPlayers, info.maxPlayersCount);
  const queue = firstValue(info.queuedPlayers, info.queued, info.queue);
  const plugins = Array.isArray(info.plugins)
    ? info.plugins.map((plugin) => typeof plugin === "string" ? plugin : plugin.name).filter(Boolean)
    : null;
  return [
    "🖥 Сервер",
    `Название: ${info.name || account.serverName || "название не передано Rust+"}`,
    `Онлайн: ${players !== undefined ? `${players}${maxPlayers !== undefined ? `/${maxPlayers}` : ""}` : "не передан Rust+"}`,
    queue !== undefined ? `Очередь: ${queue}` : null,
    `Карта: ${info.map || "не передана"}`,
    info.mapSize ? `Размер карты: ${info.mapSize}` : null,
    info.seed !== undefined ? `Seed: ${info.seed}` : null,
    info.wipeTime ? `Wipe: ${formatDateTime(info.wipeTime)}` : null,
    `Плагины: ${plugins?.length ? plugins.join(", ") : "Rust+ не передаёт список; нужен серверный plugin/API"}`,
    `Loot multiplier: x${info.lootMultiplier || config.lootMultiplier}; respawn multiplier: x${info.respawnMultiplier || config.respawnMultiplier}`,
    `Адрес Rust+: ${account.server}:${account.port}`,
    `Статус Rust+: ${monitor?.connected ? "подключён" : "подключение неактивно"}`,
    `Steam ID: ${account.steamId || "—"}`
  ].filter(Boolean).join("\n");
};

const serverText = async (userId) => {
  const account = store.getAccount(userId);
  const monitor = manager.getMonitor(userId);
  if (!account?.server) return "🖥 Сервер\n\nRust+ ещё не привязан. Сначала отправь Credential Info и нажми Pair with Server в Rust.";
  let info = null;
  try {
    info = monitor ? normalizeServerInfo(await monitor.request("getInfo")) : null;
    if (info && Object.keys(info).length) store.profile(userId).set("serverInfo", info);
  } catch {
    // The server name is optional: some Rust+ servers do not expose getInfo.
  }
  const stored = store.profile(userId).get("serverInfo") || {};
  return formatServerInfo({ ...stored, ...(info || {}) }, account, monitor);
};

const notificationLabels = {
  teamStatus: "вход/выход тимейтов",
  playerStatus: "смерть игрока",
  raid: "Smart Alarm/рейд",
  storage: "изменение хранилища",
  sunrise: "рассвет",
  sunset: "закат",
  rt: "события и респавн РТ",
  shop: "новый магазин на карте"
};

const settingsText = (profile) => {
  const settings = profile.get("notificationSettings") || {};
  const rows = Object.entries(notificationLabels).map(([key, label]) =>
    `${settings[key] === false ? "🔕" : "🔔"} ${label}`
  );
  return [
    "⚙ Настройки",
    `Общие уведомления: ${profile.get("enabled") ? "включены" : "выключены"}`,
    `Префикс команд Rust: ${profile.get("rustCommandPrefix") || "/"}`,
    "",
    ...rows,
    "",
    "В Rust доступны: <префикс>help, time, team, markers, server, rt, loot и HP стен.",
    "Например: .help или !time."
  ].join("\n");
};

const parseJsonValue = (value) => {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text.startsWith("{") && !text.startsWith("[")) return value;
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
};

const findDeathNotification = (value, seen = new Set()) => {
  const parsed = parseJsonValue(value);
  if (!parsed || typeof parsed !== "object" || seen.has(parsed)) return null;
  seen.add(parsed);
  const eventType = String(parsed.type || parsed.eventType || "").toLowerCase();
  if (eventType === "death" || eventType.includes("death")) return parsed;
  for (const [key, child] of Object.entries(parsed)) {
    const found = findDeathNotification(child, seen);
    if (found) return { ...parsed, ...found };
    if (key === "data" && typeof child === "string") {
      const nested = findDeathNotification(parseJsonValue(child), seen);
      if (nested) return { ...parsed, ...nested };
    }
  }
  return null;
};

const firstValue = (...values) => values.find((value) => value !== undefined && value !== null && value !== "");

const deathDetails = (notification, mapSize) => {
  const killer = firstValue(
    notification.killerName,
    notification.attackerName,
    notification.killer,
    notification.attacker,
    notification.murderer,
    notification.killer?.name,
    notification.attacker?.name
  );
  const weapon = firstValue(
    notification.weaponName,
    notification.weapon,
    notification.weaponShortName,
    notification.damageType,
    notification.cause
  );
  const position = firstValue(
    notification.position,
    notification.location,
    notification.coordinates,
    notification.playerPosition,
    notification.deathPosition,
    notification.worldPosition,
    notification.pos,
    notification
  );
  const directGrid = firstValue(
    notification.grid,
    notification.gridReference,
    notification.gridPosition
  );
  const square = typeof directGrid === "string"
    ? directGrid
    : markerSquare(directGrid || position, mapSize);
  return {
    killer: typeof killer === "object" ? killer.name || killer.displayName : killer,
    weapon: typeof weapon === "object" ? weapon.name || weapon.displayName : weapon,
    square
  };
};

function getMonitor(userId) {
  const monitor = manager.getMonitor(userId);
  if (!monitor) throw new Error("Rust+ ещё не подключён. Сначала пришли Credential Info и нажми Pair with Server в игре.");
  return monitor;
}

const decayText = (parts) => {
  const parsed = parseDecayCommand(parts);
  if (!parsed) {
    return "Формат: /дерево хп 120, /камень хп 250, /метал хп 700 или /мвк хп 1500.";
  }
  const { material, hp } = parsed;
  const estimate = decayEstimate(material, hp, config.decayMultiplier);
  return [
    `🧱 ${material.name}`,
    `Текущее HP: ${hp}/${material.maxHp}`,
    `До полного гниения: примерно ${formatDuration(estimate.minutes)}`,
    "Расчёт действует при отсутствии TC/upkeep и зависит от decay.scale сервера.",
    "Для точного значения с плагином сервера нужен его API; Rust+ этого параметра не передаёт."
  ].join("\n");
};

const rtLootText = (profile, item) => [
  `🎒 ${item.name}`,
  `Таймер: ${lootStatus(profile, item)}`,
  "Запускать после фактического сбора: /loot водоочистная.",
  "Если серверный plugin/API отдаёт событие respawn, его можно подключить для точного времени."
].join("\n");

const handlers = {
  registerCredentials: (userId, text) => manager.registerCredentials(userId, text),
  linkMiniApp: (userId, code) => webAppServer.linkMiniAppCode(code, userId),
  forget: (userId) => {
    acknowledgeRaid(userId);
    return manager.forget(userId);
  },
  status: (userId) => manager.status(userId),
  server: (userId) => serverText(userId),
  settings: (userId) => settingsText(store.profile(userId)),
  chat: async (userId) => {
    const messages = normalizeChat(await getMonitor(userId).request("getTeamChat"));
    return messages.length
      ? "💬 Team chat:\n" + messages.slice(-25).map((message) =>
        `• ${message.name || message.senderName || message.steamId || "team"}: ${message.message || message.text}`
      ).join("\n")
      : "💬 Team chat пуст или сервер не вернул историю.";
  },
  team: async (userId) => teamText(
    normalizeTeam(await getMonitor(userId).request("getTeamInfo")),
    userId
  ),
  time: async (userId) => `🕒 Игровое время: ${normalizeTime(await getMonitor(userId).request("getTime")) || "нет данных"}`,
  markers: async (userId) => formatMarkers(normalizeMarkers(await getMonitor(userId).request("getMapMarkers"))),
  decay: (userId, text) => decayText(String(text || "").trim().split(/\s+/).filter(Boolean)),
  raidTest: (userId) => {
    startRaidAlert(userId, "тестовая тревога /raidtest");
    return "🚨 Тест рейда запущен. Нажми «Проснулся», чтобы остановить повторения.";
  },
  acknowledgeRaid: (userId) => acknowledgeRaid(userId),
  say: async (userId, text) => getMonitor(userId).sendTeamMessage(text),
  rtList: (userId) => rtListText(userId),
  rtCategory: (userId, category) => rtCategoryText(userId, category),
  toggleFavorite: (userId, slug) => {
    const item = findMonument(slug);
    if (!item) throw new Error("РТ не найдена.");
    const profile = store.profile(userId);
    const favorites = new Set(favoritesOf(profile));
    if (favorites.has(item.slug)) favorites.delete(item.slug);
    else favorites.add(item.slug);
    const next = [...favorites];
    profile.update({
      favoriteMonuments: next,
      favoriteMonument: next[0] || null
    });
    return favorites.has(item.slug);
  },
  markRtLoot: (userId, slug) => {
    const item = findMonument(slug);
    if (!item) throw new Error("РТ не найдена.");
    const profile = store.profile(userId);
    const timers = { ...(profile.get("rtTimers") || {}) };
    const minutes = effectiveRespawnMinutes(profile, item);
    timers[item.slug] = Date.now() + minutes * 60 * 1000;
    const observations = { ...(profile.get("lootObservations") || {}) };
    observations[item.slug] = {
      ...(observations[item.slug] || {}),
      lastCollectedAt: Date.now(),
      respawnMinutes: minutes,
      source: observations[item.slug]?.samples ? "observations" : "catalog"
    };
    profile.update({ rtTimers: timers, lootObservations: observations });
    return item;
  },
  setPrefix: (userId, prefix) => {
    const value = String(prefix || "").trim();
    if (!["/", ".", "!", "@", "$"].includes(value)) {
      throw new Error("Можно выбрать только /, ., !, @ или $.");
    }
    store.profile(userId).set("rustCommandPrefix", value);
    return value;
  },
  toggleNotification: (userId, kind) => {
    const profile = store.profile(userId);
    const next = !profile.notificationEnabled(kind);
    profile.setNotification(kind, next);
    return next;
  },
  toggleEnabled: (userId) => {
    const profile = store.profile(userId);
    return profile.set("enabled", !profile.get("enabled"));
  }
};

bot = createTelegramBot(config, store, manager, handlers);

manager.on("waitingForPairing", ({ userId }) => {
  sendTelegram(userId, "📡 Credential Info сохранён. Теперь в Rust открой Companion и нажми Pair with Server. Я жду pairing notification.");
});
manager.on("pairing", ({ userId, pairing }) => {
  sendTelegram(userId, `✅ Pairing получен: ${pairing.server}:${pairing.port}. Подключаю Rust+ автоматически.`);
});
manager.on("notification", async ({ userId, notification }) => {
  const death = findDeathNotification(notification);
  if (!death) return;
  const account = store.getAccount(userId) || {};
  const victimId = String(firstValue(death.targetId, death.target_id, death.victimId, death.victim_id, death.playerId, "") || "");
  const victimName = firstValue(death.targetName, death.victimName, death.playerName);
  const isSelf = victimId && String(account.steamId || "") === victimId;
  if (!isSelf && victimId && victimId !== String(account.steamId || "")) return;

  const profile = store.profile(userId);
   const details = deathDetails(death, profile.get("serverInfo")?.mapSize);
  const signature = [victimId, victimName, details.killer, details.weapon, details.square].join("|");
  const previous = profile.get("lastDeathEvent");
  if (previous?.signature === signature && Date.now() - Number(previous.at || 0) < 120000) return;
  profile.set("lastDeathEvent", { signature, at: Date.now() });

  await sendNotification(userId, [
    "💀 Ты погиб в Rust.",
    `Убийца: ${details.killer || "данные не переданы Rust+"}`,
    `Оружие: ${details.weapon || "данные не переданы Rust+"}`,
    `Квадрат: ${details.square || "данные не переданы Rust+"}`
  ].join("\n"), "playerStatus");
});
manager.on("error", ({ userId, error, source }) => {
  console.error(`${source || "Account"} error ${userId}:`, error.message);
  sendTelegram(userId, `⚠️ ${source || "Rust+"}: ${error.message}`);
});
manager.on("connected", async ({ userId }) => {
  console.log(`Rust+ connected for Telegram ${userId}`);
  const monitor = manager.getMonitor(userId);
  await monitor?.subscribeToEntities();
  if (store.profile(userId).get("raidAlertActive")) {
    startRaidAlert(userId, store.profile(userId).get("raidAlertEntityId") || "Smart Alarm");
  }
  await sendTelegram(userId, "✅ Rust+ подключён. Персональный мониторинг активен.");
});
manager.on("disconnected", ({ userId }) => sendTelegram(userId, "⚠️ Rust+ отключился. Бот попробует переподключиться после нового pairing."));

manager.on("info", ({ userId, args }) => {
  const info = args[0] || {};
  if (info && Object.keys(info).length) {
    const profile = store.profile(userId);
    profile.set("serverInfo", { ...(profile.get("serverInfo") || {}), ...info });
  }
});

manager.on("chat", async ({ userId, profile, args }) => {
  const messages = args[0] || [];
  for (const message of messages) {
    const text = message.message || message.text || message.content || "";
    const sender = message.name || message.senderName || message.steamId || "team";
    const key = [
      message.messageId ?? message.id ?? "",
      sender,
      message.time ?? message.timestamp ?? "",
      text
    ].join(":");
    if (!text || !profile.rememberChat(key)) continue;
    if (profile.get("chatMirror") || profile.get("chatMode")) {
      await sendTelegram(userId, `💬 ${sender}: ${text}`, { force: profile.get("chatMode") });
    }
    await handleRustCommand(userId, text);
  }
});

async function handleRustCommand(userId, text) {
  const [command, ...parts] = text.trim().split(/\s+/);
  const monitor = manager.getMonitor(userId);
  if (!monitor) return;
  const profile = store.profile(userId);
  const selectedPrefix = profile.get("rustCommandPrefix") || "/";
  const prefix = [selectedPrefix, "/", ".", "!", "@", "$"]
    .filter((value, index, values) => values.indexOf(value) === index)
    .find((value) => command.toLowerCase().startsWith(value.toLowerCase()));
  if (!prefix) return;
  const name = command.slice(prefix.length).toLowerCase();
  try {
    if (name === "help") {
      await monitor.sendTeamMessage([
        "Команды Rust+ чата:",
        `${prefix}time — время сервера`,
        `${prefix}team — тимейты`,
        `${prefix}markers — события`,
        `${prefix}server — сервер, онлайн, карта и wipe`,
        `${prefix}rt [название] — информация о РТ`,
        `${prefix}loot [РТ] — запустить таймер после сбора лута`,
        `${prefix}raidtest — проверить тревогу рейда`,
        `${prefix}дерево хп 120 / ${prefix}камень хп 250`,
        `${prefix}метал хп 700 / ${prefix}мвк хп 1500`
      ].join("\n"));
    } else if (name === "raidtest") {
      await monitor.sendTeamMessage(handlers.raidTest(userId));
    } else if (name === "time") {
      await monitor.sendTeamMessage(`Время: ${normalizeTime(await monitor.request("getTime")) || "нет данных"}`);
    } else if (name === "team") {
      await monitor.sendTeamMessage(teamText(normalizeTeam(await monitor.request("getTeamInfo")), userId));
    } else if (name === "markers") {
      await monitor.sendTeamMessage(formatMarkers(normalizeMarkers(await monitor.request("getMapMarkers"))));
    } else if (["server", "сервер", "info", "инфо"].includes(name)) {
      const account = store.getAccount(userId) || {};
      const info = normalizeServerInfo(await monitor.request("getInfo"));
      const profileInfo = store.profile(userId);
      profileInfo.set("serverInfo", { ...(profileInfo.get("serverInfo") || {}), ...info });
      await monitor.sendTeamMessage(formatServerInfo(
        { ...(profileInfo.get("serverInfo") || {}), ...info },
        account,
        monitor
      ));
    } else if (name === "rt") {
      const item = findMonument(parts.join(" ")) || findMonument(profile.get("favoriteMonument"));
      if (!item) {
        await monitor.sendTeamMessage(`Используй: ${prefix}rt oil rig или ${prefix}rt водоочистная`);
      } else {
        const markers = normalizeMarkers(await monitor.request("getMapMarkers"));
        const marker = markers.find((candidate) => markerMatchesItem(candidate, item));
        await monitor.sendTeamMessage(
          `${formatMonument(item, marker)}\n\n${rtLootText(profile, item)}`
        );
      }
    } else if (["loot", "лут", "респавн", "таймер"].includes(name)) {
      const item = findMonument(parts.join(" ")) || findMonument(profile.get("favoriteMonument"));
      if (!item) {
        await monitor.sendTeamMessage(`Используй: ${prefix}loot водоочистная`);
      } else {
        handlers.markRtLoot(userId, item.slug);
        await monitor.sendTeamMessage(`✅ Сбор лута зафиксирован.\n${rtLootText(profile, item)}`);
      }
    } else if ([
      "twig", "wood", "stone", "metal", "hqm", "armored",
      "ветка", "ветки", "солома", "дерево", "камень", "метал", "металл", "мвк", "броня",
      "wall", "стена", "хп"
    ].includes(name)) {
      const decayParts = name === "wall" || name === "стена" || name === "хп"
        ? parts
        : [name, ...parts];
      await monitor.sendTeamMessage(decayText(decayParts));
    }
  } catch (error) {
    await monitor.sendTeamMessage(`Ошибка команды: ${error.message}`);
  }
}

manager.on("team", async ({ userId, profile, args }) => {
  const team = args[0] || [];
  const account = store.getAccount(userId) || {};
  const current = Object.fromEntries(team.map((member) => [
    String(member.steamId ?? member.id ?? member.name),
    (() => {
      const id = String(member.steamId ?? member.id ?? member.name);
      const previousMember = (profile.get("lastTeam") || {})[id] || {};
      const online = member.online === undefined ? previousMember.online : Boolean(member.online);
      const alive = member.isAlive ?? member.alive ?? member.is_alive;
      return {
        name: member.name || member.displayName || member.steamId,
        online,
        alive,
        lastOfflineAt: online === false && previousMember.online !== false
          ? Date.now()
          : previousMember.lastOfflineAt || (online === false ? Date.now() : null)
      };
    })()
  ]));
  const previous = profile.get("lastTeam") || {};
  for (const [id, previousMember] of Object.entries(previous)) {
    if (current[id] || previousMember.online === false) continue;
    current[id] = {
      ...previousMember,
      online: false,
      lastOfflineAt: Date.now()
    };
  }
  if (profile.get("bootstrapped")) {
    for (const [id, member] of Object.entries(current)) {
      if (previous[id] && previous[id].online !== member.online) {
        await sendNotification(userId, `${member.online ? "🟢" : "⚫"} ${member.name} ${member.online ? "зашёл" : "вышел"} на сервер.`, "teamStatus");
      }
      if (previous[id] && previous[id].alive !== false && member.alive === false) {
        const isSelf = String(account.steamId || "") === id;
        await sendNotification(
          userId,
          isSelf ? "💀 Ты погиб в Rust." : `💀 ${member.name} погиб в Rust.`,
          "playerStatus"
        );
      }
    }
  }
  profile.update({
    lastTeam: current,
    liveTeam: team,
    liveUpdatedAt: Date.now(),
    bootstrapped: true
  });
});

manager.on("time", async ({ userId, profile, args }) => {
  const time = args[0];
  const match = String(time || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return;
  const currentMinute = Number(match[1]) * 60 + Number(match[2]);
  const previousText = String(profile.get("lastGameTime") || "");
  const previousMatch = previousText.match(/^(\d{1,2}):(\d{2})$/);
  if (previousMatch) {
    const previousMinute = Number(previousMatch[1]) * 60 + Number(previousMatch[2]);
    const elapsed = (currentMinute - previousMinute + 1440) % 1440;
    const crossed = (target) => {
      const distance = (target - previousMinute + 1440) % 1440;
      return elapsed > 0 && elapsed <= 180 && distance > 0 && distance <= elapsed;
    };
    if (crossed(6 * 60)) await sendNotification(userId, "🌅 Рассвет в Rust.", "sunrise");
    if (crossed(18 * 60)) await sendNotification(userId, "🌇 Закат в Rust.", "sunset");
  }
  profile.set("lastGameTime", time);
});

manager.on("markers", async ({ userId, profile, args }) => {
  const incomingMarkers = args[0] || [];
  const meta = args[2] || {};
  const markers = meta.incremental
    ? [...new Map([
      ...((profile.get("liveMarkers") || []).map((marker) => [markerKey(marker), marker])),
      ...incomingMarkers.map((marker) => [markerKey(marker), marker])
    ]).values()]
    : incomingMarkers;
  const known = new Set(profile.get("markerKeys") || []);
  const markerBootstrapped = profile.get("markerBootstrapped");
  const previousRt = profile.get("rtSeen") || {};
  const currentRt = {};
  const favorites = new Set(favoritesOf(profile));
  const timers = { ...(profile.get("rtTimers") || {}) };
  const observations = { ...(profile.get("lootObservations") || {}) };
  const now = Date.now();
  for (const marker of markers) {
    if (markerBootstrapped && !known.has(markerKey(marker))) {
      const kind = isShopMarker(marker) ? "shop" : "rt";
      await sendNotification(userId, markerEventText(marker, profile), kind);
    }
    const item = findMonument(`${marker.name || ""} ${marker.type || ""}`);
    if (!item || !item.dynamic) continue;
    currentRt[item.slug] = true;
    if (!previousRt[item.slug]) {
      const observation = observations[item.slug];
      const lastCollectedAt = Number(observation?.lastCollectedAt);
      if (lastCollectedAt && now > lastCollectedAt) {
        const measuredMinutes = (now - lastCollectedAt) / 60000;
        if (measuredMinutes >= 5 && measuredMinutes <= 360) {
          const samples = Number(observation.samples || 0);
          const previousEstimate = Number(observation.respawnMinutes) || item.respawnMinutes;
          observations[item.slug] = {
            ...observation,
            respawnMinutes: Math.round((previousEstimate * samples + measuredMinutes) / (samples + 1)),
            samples: samples + 1,
            lastRespawnAt: now,
            source: "observations"
          };
        }
      }
      delete timers[item.slug];
      if (favorites.has(item.slug)) {
        const message = `📢 Доступно: ${item.name}. Можно забирать лут.`;
        await sendNotification(userId, message, "rt");
        try {
          await getMonitor(userId).sendTeamMessage(message);
        } catch (error) {
          console.error(`RT team chat ${userId}:`, error.message);
        }
      }
    }
  }
  for (const item of RT_CATALOG.filter((entry) => entry.dynamic)) {
    if (previousRt[item.slug] && !currentRt[item.slug] && !timers[item.slug]) {
      const minutes = effectiveRespawnMinutes(profile, item);
      timers[item.slug] = now + minutes * 60 * 1000;
      observations[item.slug] = {
        ...(observations[item.slug] || {}),
        lastCollectedAt: now,
        respawnMinutes: minutes
      };
    }
    if (!currentRt[item.slug] && timers[item.slug] && Number(timers[item.slug]) <= now) {
      delete timers[item.slug];
      if (favorites.has(item.slug)) {
        const message = `📢 Респавн: ${item.name} снова доступна.`;
        await sendNotification(userId, message, "rt");
        try {
          await getMonitor(userId).sendTeamMessage(message);
        } catch (error) {
          console.error(`RT respawn team chat ${userId}:`, error.message);
        }
      }
    }
  }
  profile.update({
    markerKeys: markers.map(markerKey),
    markerBootstrapped: true,
    rtSeen: currentRt,
    rtTimers: timers,
    lootObservations: observations,
    liveMarkers: markers,
    liveUpdatedAt: Date.now()
  });
});

manager.on("entityChanged", async ({ userId, monitor, args }) => {
  const changed = args[0];
  const profile = store.profile(userId);
  const account = store.getAccount(userId) || {};
  const entityId = Number(changed.entityId);
  const payload = changed.payload || {};
  if ((account.smartAlarmIds || []).includes(entityId) && payload.value) {
    startRaidAlert(userId, `Smart Alarm #${entityId}: возможный рейд/срабатывание базы`);
  }
  if ((account.storageMonitorIds || []).includes(entityId) && payload.value === false && Array.isArray(payload.items)) {
    const summary = payload.items.slice(0, 10)
      .map((item) => `${item.itemId || item.name || "item"}×${item.quantity ?? item.amount ?? "?"}`)
      .join(", ");
    await sendNotification(userId, `📦 Storage Monitor #${entityId}: хранилище изменилось.\n${summary || "Состав не передан."}`, "storage");
  }
});

async function startBot() {
  webAppServer.on("error", (error) => {
    console.error(`Mini App не запустился на порту ${config.webAppPort}:`, error.message);
  });
  webAppServer.listen(config.webAppPort, "0.0.0.0", () => {
    console.log(`Telegram Mini App server listening on :${config.webAppPort}`);
  });
  console.log("Проверяю подключение к Telegram API...");
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(
      "Telegram API не ответил за 15 секунд. Проверь интернет, VPN/прокси и доступ к api.telegram.org."
    )), 15000);
  });

  try {
    const info = await Promise.race([bot.api.getMe(), timeout]);
    console.log(`Токен принят. Бот: @${info.username}`);
  } catch (error) {
    console.error("Не удалось подключиться к Telegram:", error.message || error);
    console.error("Проверь BOT_TOKEN в файле .env. Не отправляй токен в чат.");
    process.exitCode = 1;
    return;
  }

  await bot.start({
    onStart: async (info) => {
      console.log(`Telegram bot @${info.username} started`);
      await manager.startAll();
    }
  });
}

startBot().catch((error) => {
  console.error("Startup error:", error.message || error);
  if (String(error.message || error).includes("409")) {
    console.error("Похоже, этот токен уже используется другим запущенным экземпляром бота.");
  }
  process.exitCode = 1;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    for (const userId of store.allUserIds()) {
      stopRaidAlert(userId);
      manager.forget(userId);
    }
    webAppServer.close();
    bot.stop();
  });
}