import crypto from "node:crypto";
import http from "node:http";
import { findMonument, markerSquare } from "./rt-catalog.js";

export const WEB_APP_VERSION = "2026.09.11.6";
const LINK_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const HTML = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>Rust Radar · ${WEB_APP_VERSION}</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    :root { color-scheme:dark; --bg:#090d12; --panel:#111820; --panel2:#17212b; --line:#263542; --text:#f3f7fb; --muted:#8796a5; --cyan:#64d8c5; --blue:#6ea7ff; --orange:#ffb45e; --pink:#ed7890; --purple:#b398ff; }
    * { box-sizing:border-box; } body { margin:0; min-height:100vh; color:var(--text); background:radial-gradient(circle at 50% -10%,#203446 0,#0d131a 42%,var(--bg) 76%); font:14px/1.45 Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    header { padding:18px 16px 14px; border-bottom:1px solid #ffffff0d; background:#0b1016d9; backdrop-filter:blur(18px); position:sticky; top:0; z-index:5; }
    .hero,.section-head,.stats,.filters,.row { display:flex; align-items:center; justify-content:space-between; gap:10px; } .hero { max-width:980px; margin:auto; }
    .brand { display:flex; align-items:center; gap:11px; min-width:0; } .logo { width:40px; height:40px; display:grid; place-items:center; border-radius:13px; color:#071217; background:linear-gradient(135deg,var(--cyan),#86a9ff); font-weight:900; font-size:21px; box-shadow:0 6px 18px #64d8c533; } h1,h2,h3,p { margin:0; } h1 { font-size:19px; line-height:1.1; } h2 { font-size:16px; } h3 { font-size:13px; } .sub,.muted { color:var(--muted); font-size:12px; } .version { color:var(--cyan); font-size:10px; letter-spacing:.06em; } .status { display:flex; align-items:center; gap:6px; color:var(--cyan); font-size:11px; white-space:nowrap; } .status i { width:7px; height:7px; background:var(--cyan); border-radius:50%; box-shadow:0 0 0 4px #64d8c522; }
    main { width:min(980px,100%); margin:auto; padding:14px 12px 28px; display:grid; gap:12px; } .panel { background:linear-gradient(145deg,#15202aee,#0f161dee); border:1px solid var(--line); border-radius:18px; padding:13px; box-shadow:0 15px 38px #0004; } .kicker { color:var(--cyan); font-size:10px; letter-spacing:.13em; font-weight:800; } .updated { color:var(--muted); font-size:11px; white-space:nowrap; }
    .stats { margin:12px 0; display:grid; grid-template-columns:repeat(4,1fr); gap:7px; } .stat { min-width:0; padding:9px 8px; border:1px solid #ffffff0d; border-radius:12px; background:#ffffff05; } .stat b { display:block; font-size:18px; line-height:1.15; } .stat span { color:var(--muted); font-size:10px; }
    .map-wrap { padding:5px; border-radius:15px; background:#091016; border:1px solid #ffffff12; } .map { position:relative; aspect-ratio:1/1; overflow:hidden; border-radius:11px; background-color:#223b3d; background-image:linear-gradient(#ffffff12 1px,transparent 1px),linear-gradient(90deg,#ffffff12 1px,transparent 1px),radial-gradient(circle at 35% 30%,#316052,transparent 25%),radial-gradient(circle at 72% 70%,#5a4d32,transparent 28%); background-size:3.846% 3.846%; background-position:center; background-repeat:no-repeat; }
    .map::after { content:""; position:absolute; inset:0; pointer-events:none; box-shadow:inset 0 0 40px #0008; } .axis { position:absolute; z-index:1; pointer-events:none; color:#fff9; font-size:9px; text-shadow:0 1px 2px #000; } .axis.top { top:4px; left:18px; right:4px; display:flex; justify-content:space-around; } .axis.left { top:17px; bottom:4px; left:4px; display:flex; flex-direction:column; justify-content:space-around; }
    .pin { position:absolute; transform:translate(-50%,-50%); min-width:19px; height:19px; padding:0 3px; border:2px solid #fff; border-radius:50%; box-shadow:0 3px 9px #000c; cursor:pointer; z-index:2; color:#071016; font-size:9px; font-weight:900; } .pin.team { background:var(--blue); } .pin.me { background:var(--cyan); } .pin.shop { background:var(--orange); } .pin.event { background:var(--pink); } .pin.monument { background:var(--purple); border-radius:6px; } .pin-label { position:absolute; left:14px; top:-5px; white-space:nowrap; padding:3px 6px; border:1px solid #ffffff1f; border-radius:6px; background:#091016e8; color:#fff; font-size:10px; font-weight:500; pointer-events:none; }
    .filters { justify-content:flex-start; flex-wrap:wrap; margin-top:10px; } .filter { border:1px solid var(--line); background:#ffffff06; color:var(--muted); border-radius:999px; padding:6px 9px; font:inherit; font-size:11px; cursor:pointer; } .filter.active { color:var(--text); border-color:#64d8c577; background:#64d8c51a; } .filter::first-letter { color:var(--cyan); } .map-note { margin-top:9px; color:var(--muted); font-size:11px; }
    .columns { display:grid; grid-template-columns:1fr 1fr; gap:12px; } .list { display:grid; gap:7px; margin-top:10px; } .item { padding:10px; border:1px solid #ffffff12; border-radius:12px; background:#ffffff04; } .item strong { font-size:13px; } .item small { display:block; color:var(--muted); margin-top:3px; font-size:11px; } .dot { display:inline-block; width:8px; height:8px; margin-right:6px; border-radius:50%; background:var(--cyan); } .dot.off { background:#657080; } .tag { display:inline-block; margin-left:5px; padding:2px 5px; border-radius:5px; color:var(--muted); background:#ffffff0d; font-size:10px; }
    .register { border-color:#527dbb; } .register h2 { margin-bottom:5px; } .register p { margin:6px 0; color:var(--muted); } .register code { display:block; margin:12px 0; padding:12px; border-radius:11px; background:#080d12; color:#fff; text-align:center; font:bold 26px/1.1 ui-monospace,SFMono-Regular,Menlo,monospace; letter-spacing:.22em; user-select:all; } .register small { color:var(--muted); } #toast { position:fixed; left:12px; right:12px; bottom:16px; z-index:10; padding:12px; background:#182632f5; border:1px solid var(--line); border-radius:12px; display:none; box-shadow:0 10px 30px #0008; }
    @media (max-width:680px) { .columns { grid-template-columns:1fr; } .status { font-size:0; } .status i { margin-right:5px; } } @media (min-width:820px) { main { grid-template-columns:1.35fr .65fr; align-items:start; } .map-panel { grid-row:span 2; } .columns { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <header><div class="hero"><div class="brand"><div class="logo">R</div><div><h1>Rust Radar <span class="version">${WEB_APP_VERSION}</span></h1><div class="sub" id="server">Подключение к Rust+…</div></div></div><div class="status"><i></i><span id="connection">LIVE</span></div></div><div class="sub" id="diagnostics" style="max-width:980px;margin:8px auto 0"></div></header>
  <main>
    <section class="panel register" id="registration" hidden><h2>🔐 Подключение устройства</h2><p>Если Telegram не передал приложению идентификатор, отправь боту этот короткий код:</p><code id="link-code">0000</code><p>Команда: <b>/link КОД</b></p><small id="link-status">Ожидаю подтверждение от бота…</small></section>
    <section class="panel map-panel"><div class="section-head"><div><div class="kicker">SERVER MAP</div><h2>Живая карта</h2></div><div class="updated" id="updated">—</div></div><div class="stats"><div class="stat"><b id="count-team">0</b><span>тимейты</span></div><div class="stat"><b id="count-rt">0</b><span>РТ</span></div><div class="stat"><b id="count-shop">0</b><span>магазины</span></div><div class="stat"><b id="count-event">0</b><span>события</span></div></div><div class="map-wrap"><div class="map" id="map"><div class="axis top" id="letters"></div><div class="axis left" id="numbers"></div></div></div><div class="filters"><button class="filter active" data-filter="team">● Тимейты</button><button class="filter active" data-filter="monument">◆ РТ</button><button class="filter active" data-filter="shop">● Магазины</button><button class="filter active" data-filter="event">● События</button></div><div class="map-note" id="map-note">Загружаю карту сервера…</div></section>
    <section class="columns"><section class="panel"><div class="section-head"><h2>👥 Тимейты</h2><span class="updated" id="team-updated">—</span></div><div class="list" id="team"></div></section><section class="panel"><div class="section-head"><h2>📍 Объекты на карте</h2><span class="updated">Rust+</span></div><div class="list" id="events"></div></section></section>
    <section class="panel"><div class="section-head"><div><div class="kicker">MONUMENTS</div><h2>РТ на этой карте</h2></div><span class="updated" id="rt-source">—</span></div><div class="list" id="rt-list"></div></section>
  </main>
  <div id="toast"></div>
  <script>
    const tg = window.Telegram?.WebApp; tg?.ready(); tg?.expand();
    function readTelegramInitData() { if (tg?.initData) return { value: tg.initData, source: "Telegram.WebApp.initData" }; for (const raw of [window.location.hash.slice(1), window.location.search.slice(1)]) { if (!raw) continue; const params = new URLSearchParams(raw); const value = params.get("tgWebAppData") || params.get("initData"); if (value) return { value, source: "URL tgWebAppData" }; } return { value:"", source:"не найден" }; }
    const telegramInitData = readTelegramInitData(), initData = telegramInitData.value, storageKey = "rust-live-map-session";
    const storage = { get(k) { try { return localStorage.getItem(k) || ""; } catch { return ""; } }, set(k,v) { try { localStorage.setItem(k,v); } catch {} }, remove(k) { try { localStorage.removeItem(k); } catch {} } };
    let sessionToken = storage.get(storageKey), linkInfo = null, linkPollTimer = null, filters = new Set(["team","monument","shop","event"]);
    const $ = (id) => document.getElementById(id), esc = (value) => String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
    $("letters").innerHTML = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((x) => "<span>"+x+"</span>").join(""); $("numbers").innerHTML = Array.from({length:26},(_,i) => "<span>"+(i+1)+"</span>").join("");
    document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => { const key = button.dataset.filter; filters.has(key) ? filters.delete(key) : filters.add(key); button.classList.toggle("active", filters.has(key)); if (window.lastState) refreshMap(window.lastState); }));
    function percent(value, mapSize, axis) { const n = Number(value); if (!Number.isFinite(n)) return null; const size = Number(mapSize || 4500); let result; if (n >= 0 && n <= size) result = axis === "y" ? (1 - n / size) * 100 : n / size * 100; else result = axis === "y" ? (0.5 - n / size) * 100 : (n / size + 0.5) * 100; return Math.max(1.5, Math.min(98.5, result)); }
    function pin(item, kind, label, mapSize) { if (!filters.has(kind)) return ""; const x = percent(item.x, mapSize, "x"), y = percent(item.y, mapSize, "y"); if (x === null || y === null) return ""; return '<button class="pin '+kind+'" style="left:'+x+'%;top:'+y+'%" data-info="'+esc(label)+'"><span class="pin-label">'+esc(label)+'</span></button>'; }
    function refreshMap(data) { const server = data.server || {}, map = data.map || {}; const node = $("map"); if (map.image) { node.style.backgroundImage = "url("+map.image+"),linear-gradient(#ffffff12 1px,transparent 1px),linear-gradient(90deg,#ffffff12 1px,transparent 1px)"; node.style.backgroundSize = "cover,3.846% 3.846%,3.846% 3.846%"; } else { node.style.backgroundImage = ""; node.style.backgroundSize = ""; } let html = ""; (data.team || []).forEach((m) => { html += pin(m, "team", (m.me ? "Я: " : "") + (m.name || "тимейт") + (m.grid ? " · "+m.grid : ""), server.mapSize); }); (map.monuments || []).forEach((m) => { html += pin(m, "monument", (m.name || "РТ") + (m.grid ? " · "+m.grid : ""), server.mapSize); }); (data.markers || []).forEach((m) => { const kind = m.shop ? "shop" : "event"; html += pin(m, kind, (m.name || m.label || "Событие") + (m.grid ? " · "+m.grid : ""), server.mapSize); }); node.querySelectorAll(".pin").forEach((p) => p.remove()); node.insertAdjacentHTML("beforeend", html); node.querySelectorAll(".pin").forEach((p) => p.addEventListener("click", () => { $("toast").textContent = p.dataset.info; $("toast").style.display = "block"; setTimeout(() => $("toast").style.display = "none", 3500); })); const count = (map.monuments || []).length; $("map-note").textContent = map.image ? "Карта сервера загружена · точки обновляются автоматически" : "Изображение карты ещё не пришло · показываю сетку и точки Rust+"; $("count-team").textContent = (data.team || []).length; $("count-rt").textContent = count; $("count-shop").textContent = (data.markers || []).filter((m) => m.shop).length; $("count-event").textContent = (data.markers || []).filter((m) => !m.shop).length; }
    function render(data) { window.lastState = data; const server = data.server || {}, connection = data.connection || {}, map = data.map || {}; $("server").textContent = (server.name || (connection.hasAccount ? "Rust server" : "Rust+ не привязан")) + " · " + (server.players !== undefined ? server.players + (server.maxPlayers ? "/"+server.maxPlayers : "") : "онлайн неизвестен") + (server.map ? " · "+server.map : ""); $("connection").textContent = connection.connected ? "LIVE" : (connection.hasAccount ? "ПОДКЛЮЧЕНИЕ" : "НЕТ СЕРВЕРА"); $("updated").textContent = data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString() : "—"; $("team-updated").textContent = data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString() : "—"; $("team").innerHTML = (data.team || []).length ? data.team.map((m) => '<div class="item"><span class="dot '+(m.online ? "" : "off")+'"></span><strong>'+esc(m.name || "unknown")+'</strong><span class="tag">'+(m.online ? "онлайн" : "вышел")+'</span><small>'+(m.alive === false ? "💀 погиб" : "❤️ жив")+(m.grid ? " · "+esc(m.grid) : "")+'</small></div>').join("") : '<div class="muted">Данные о тимейтах ещё не пришли.</div>'; const objects = (data.markers || []).filter((m) => m.shop || m.special); $("events").innerHTML = objects.length ? objects.slice(0,30).map((m) => '<div class="item"><strong>'+esc(m.name || m.special || "Событие")+'</strong><span class="tag">'+esc(m.shop ? "магазин" : "событие")+'</span><small>'+esc(m.grid || "координаты обновляются")+(m.loot ? " · "+esc(m.loot) : "")+'</small></div>').join("") : '<div class="muted">Новых магазинов и событий нет.</div>'; const monuments = map.monuments || []; $("rt-source").textContent = monuments.length ? monuments.length+" объектов" : "нет данных"; $("rt-list").innerHTML = monuments.length ? monuments.map((m) => '<div class="item"><strong>◆ '+esc(m.name || "РТ")+'</strong><small>'+esc(m.grid || "точка на карте")+'</small></div>').join("") : '<div class="muted">Rust+ не прислал список монументов. Для точных РТ нужен ответ getMap от сервера.</div>'; refreshMap(data); }
    function showDiagnostics(message) { $("diagnostics").textContent = message; } function showRegistration(show) { $("registration").hidden = !show; }
    async function startRegistration() { if (linkInfo) return; try { const response = await fetch("/api/link/start",{cache:"no-store"}), data = await response.json(); if (!response.ok) throw new Error(data.error || "Не удалось получить код"); linkInfo = data; $("link-code").textContent = data.code; $("link-status").textContent = "Отправь код боту. Эта страница сама проверит привязку."; showRegistration(true); linkPollTimer = setInterval(checkRegistration,2000); } catch (error) { showRegistration(true); $("link-status").textContent = "Ошибка получения кода: "+error.message; } }
    async function checkRegistration() { if (!linkInfo) return; try { const query = new URLSearchParams({code:linkInfo.code,deviceToken:linkInfo.deviceToken}), response = await fetch("/api/link/status?"+query,{cache:"no-store"}), data = await response.json(); if (!response.ok) throw new Error(data.error || "Код истёк"); if (data.status === "linked" && data.sessionToken) { sessionToken = data.sessionToken; storage.set(storageKey,sessionToken); clearInterval(linkPollTimer); linkPollTimer = null; showRegistration(false); poll(); } else $("link-status").textContent = "Код активен. Отправь боту /link "+linkInfo.code; } catch (error) { $("link-status").textContent = error.message; } }
    async function poll() { try { if (!initData && !sessionToken) { showDiagnostics("Telegram initData не передан · используй короткий код регистрации"); await startRegistration(); return; } const headers = {}; if (initData) headers["X-Telegram-Init-Data"] = initData; if (sessionToken) headers["X-Mini-App-Session"] = sessionToken; const response = await fetch("/api/state",{headers,cache:"no-store"}), data = await response.json(); if (!response.ok) { if (response.status === 401 && !initData && sessionToken) { sessionToken=""; storage.remove(storageKey); showRegistration(true); await startRegistration(); return; } throw new Error(data.error || "API error"); } showDiagnostics((data.connection?.status || "Rust+ статус неизвестен")+" · "+telegramInitData.source); render(data); } catch (error) { $("server").textContent = "Ошибка подключения: "+error.message; } }
    poll(); setInterval(poll,3000);
  </script>
</body>
</html>`;

export function validateInitData(initData, botToken) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  // Telegram Web Apps: secret_key = HMAC-SHA256(key=bot_token, data="WebAppData").
  // The previous version swapped the key and message, so every valid initData
  // signature was rejected and the Mini App could never load the user's state.
  const secret = crypto.createHmac("sha256", botToken).update("WebAppData").digest();
  const expected = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (hash.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expected))) return null;
  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > 86400) return null;
  try {
    return JSON.parse(params.get("user") || "{}");
  } catch {
    return null;
  }
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function normalizeLinkCode(value) {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

function coordinate(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function gridOf(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value.column !== undefined && value.row !== undefined) return `${value.column}${value.row}`;
  return null;
}

function positionOf(value) {
  return value?.position || value?.coordinates || value?.location || value || {};
}

function markerTypeName(type) {
  const names = {
    1: "Игрок",
    2: "Взрыв",
    3: "Торговый автомат",
    4: "CH47",
    5: "Карго",
    6: "Ящик",
    7: "Радиус",
    8: "Патрульный вертолёт"
  };
  return names[Number(type)] || (type ? `Маркер ${type}` : "Маркер");
}

function markerForWeb(marker, mapSize) {
  const raw = `${marker.name || ""} ${marker.type || ""} ${marker.markerType || ""}`.toLowerCase();
  const position = positionOf(marker);
  const orders = marker.sellOrders || marker.sell_orders || marker.orders || marker.offers ||
    marker.vendingMachine?.sellOrders || marker.vendingMachine?.orders || [];
  const list = Array.isArray(orders) ? orders : [];
  const isShop = Number(marker.type) === 3 || /vending|shop|store|market|магазин|торгов/.test(raw) || list.length > 0;
  const loot = list.slice(0, 8).map((item) => {
    const name = item.itemName || item.name || item.shortname || `предмет ${item.itemId || ""}`;
    const amount = item.amount ?? item.quantity ?? item.amountToSell ?? item.amountInStock;
    const cost = item.costPerItem ?? item.cost ?? item.price;
    return `${amount ? `${amount}× ` : ""}${name}${cost ? ` · ${cost} scrap` : ""}`;
  }).join("; ");
  const special = /cargo|ship|oil|rig|deep.?sea|heli|ch47|chinook|excav|quarry|карьер/.test(raw)
    ? (raw.includes("cargo") || raw.includes("ship") ? "Cargo" : raw.includes("deep") ? "Deep Sea Oil Rig" : raw.includes("oil") || raw.includes("rig") ? "Oil Rig" : raw.includes("heli") || raw.includes("ch47") || raw.includes("chinook") ? "Helicopter" : "Quarry")
    : ({ 4: "CH47", 5: "Cargo", 8: "Helicopter" }[Number(marker.type)] || null);
  const typeName = markerTypeName(marker.type);
  return {
    id: marker.id ?? marker.markerId,
    name: marker.name || (isShop ? "Торговый автомат" : typeName),
    type: marker.type,
    x: coordinate(marker.x ?? position.x, null),
    y: coordinate(marker.y ?? marker.z ?? position.z ?? position.y, null),
    grid: gridOf(marker.grid || marker.gridReference || marker.gridPosition) || markerSquare(marker, mapSize),
    shop: isShop,
    special,
    loot,
    outOfStock: Boolean(marker.outOfStock),
    label: isShop ? "Магазин" : special || typeName
  };
}

function monumentForWeb(monument, mapSize) {
  const known = findMonument(monument.token);
  return {
    id: `monument:${monument.token}`,
    name: known?.name || monument.token || "РТ",
    token: monument.token || "РТ",
    x: coordinate(monument.x, null),
    y: coordinate(monument.y, null),
    grid: gridOf(monument.grid) || markerSquare(monument, mapSize),
    monument: true,
    label: "РТ"
  };
}

function teamForWeb(member, mapSize, ownSteamId) {
  const position = positionOf(member);
  return {
    id: String(member.steamId ?? member.id ?? member.name ?? ""),
    name: member.name || member.displayName || "unknown",
    online: member.online ?? member.isOnline ?? false,
    alive: member.isAlive ?? member.alive ?? member.is_alive,
    me: String(member.steamId ?? member.id ?? "") === String(ownSteamId || ""),
    x: coordinate(member.x ?? position.x, null),
    y: coordinate(member.z ?? member.y ?? position.z ?? position.y, null),
    grid: gridOf(member.grid || member.gridReference) || markerSquare(member, mapSize),
    mapSize
  };
}

export function createWebAppServer(config, store, manager) {
  const pendingLinks = new Map();
  const sessions = new Map();

  const cleanupLinks = () => {
    const now = Date.now();
    for (const [code, link] of pendingLinks) {
      if (link.expiresAt <= now) pendingLinks.delete(code);
    }
    for (const [token, session] of sessions) {
      if (session.expiresAt <= now) sessions.delete(token);
    }
  };

  const createLink = () => {
    cleanupLinks();
    let code = "";
    do {
      code = String(crypto.randomInt(1000, 10000));
    } while (pendingLinks.has(code));
    const deviceToken = randomToken();
    const expiresAt = Date.now() + LINK_TTL_MS;
    pendingLinks.set(code, { code, deviceToken, expiresAt, userId: null, sessionToken: null });
    return { code, deviceToken, expiresAt };
  };

  const linkMiniAppCode = (code, userId) => {
    cleanupLinks();
    const link = pendingLinks.get(normalizeLinkCode(code));
    if (!link || link.expiresAt <= Date.now()) return false;
    const sessionToken = randomToken();
    link.userId = String(userId);
    link.sessionToken = sessionToken;
    sessions.set(sessionToken, { userId: String(userId), expiresAt: Date.now() + SESSION_TTL_MS });
    return true;
  };

  const server = http.createServer((request, response) => {
    cleanupLinks();
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (url.pathname === "/" || url.pathname === "/mini-app") {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store, no-cache, must-revalidate",
        "pragma": "no-cache",
        "x-mini-app-version": WEB_APP_VERSION
      });
      response.end(HTML);
      return;
    }
    if (url.pathname === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    if (url.pathname === "/api/link/start") {
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-mini-app-version": WEB_APP_VERSION
      });
      response.end(JSON.stringify({ ok: true, ...createLink(), version: WEB_APP_VERSION }));
      return;
    }
    if (url.pathname === "/api/link/status") {
      const code = normalizeLinkCode(url.searchParams.get("code"));
      const deviceToken = url.searchParams.get("deviceToken") || "";
      const link = pendingLinks.get(code);
      const headers = {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-mini-app-version": WEB_APP_VERSION
      };
      if (!link || link.deviceToken !== deviceToken || link.expiresAt <= Date.now()) {
        response.writeHead(404, headers);
        response.end(JSON.stringify({ error: "Код регистрации недействителен или истёк." }));
        return;
      }
      if (!link.userId || !link.sessionToken) {
        response.writeHead(200, headers);
        response.end(JSON.stringify({ ok: true, status: "waiting", expiresAt: link.expiresAt }));
        return;
      }
      response.writeHead(200, headers);
      response.end(JSON.stringify({
        ok: true,
        status: "linked",
        sessionToken: link.sessionToken,
        expiresAt: sessions.get(link.sessionToken)?.expiresAt || Date.now() + SESSION_TTL_MS
      }));
      pendingLinks.delete(code);
      return;
    }
    if (url.pathname !== "/api/state") {
      response.writeHead(404); response.end("Not found"); return;
    }
    const telegramUser = validateInitData(request.headers["x-telegram-init-data"], config.botToken);
    const session = sessions.get(String(request.headers["x-mini-app-session"] || ""));
    const userId = telegramUser?.id ?? session?.userId ?? (config.simulationMode ? url.searchParams.get("userId") : null);
    if (!userId) {
      response.writeHead(401, {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-mini-app-version": WEB_APP_VERSION
      });
      response.end(JSON.stringify({ error: "Открой мини-приложение из Telegram." }));
      return;
    }
    const profile = store.profile(userId);
    const account = store.getAccount(userId) || {};
    const monitor = typeof manager?.getMonitor === "function" ? manager.getMonitor(userId) : null;
    const info = profile.get("serverInfo") || {};
    const team = (profile.get("liveTeam") || []).map((member) => teamForWeb(member, info.mapSize, account.steamId));
    const markers = (profile.get("liveMarkers") || []).map((marker) => markerForWeb(marker, info.mapSize));
    response.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-mini-app-version": WEB_APP_VERSION
    });
    response.end(JSON.stringify({
      ok: true,
      updatedAt: profile.get("liveUpdatedAt"),
      server: { ...info, server: account.server, port: account.port },
      connection: {
        hasAccount: Object.keys(account).length > 0,
        connected: Boolean(monitor?.connected),
        status: typeof manager?.status === "function"
          ? manager.status(userId)
          : (Object.keys(account).length ? "Rust+ аккаунт привязан." : "Rust+ аккаунт не привязан.")
      },
      map: {
        ...(profile.get("liveMap") || {}),
        monuments: (profile.get("liveMap")?.monuments || []).map((monument) => monumentForWeb(monument, info.mapSize))
      },
      team,
      markers: markers.map((marker) => ({
        ...marker,
        grid: marker.grid || null
      }))
    }));
  });
  server.linkMiniAppCode = linkMiniAppCode;
  return server;
}