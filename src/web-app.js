import crypto from "node:crypto";
import http from "node:http";

export const WEB_APP_VERSION = "2026.09.11.4";
const LINK_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const HTML = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>Rust Live Map · ${WEB_APP_VERSION}</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    :root { color-scheme: dark; --bg:#0e1117; --panel:#171c25; --line:#2b3442; --muted:#8f9bad; --green:#69d08a; --blue:#78a9ff; --orange:#ffb15e; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; background:radial-gradient(circle at top,#1c2736 0,#0e1117 48%); color:#f4f7fb; font:14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif; }
    header { position:sticky; top:0; z-index:4; padding:16px 16px 12px; background:rgba(14,17,23,.88); backdrop-filter:blur(16px); border-bottom:1px solid var(--line); }
     h1 { margin:0 0 4px; font-size:21px; } .version { color:var(--blue); font-size:10px; font-weight:500; letter-spacing:.04em; white-space:nowrap; } .sub { color:var(--muted); font-size:12px; }
    main { padding:12px; max-width:920px; margin:auto; display:grid; gap:12px; }
    .panel { background:rgba(23,28,37,.92); border:1px solid var(--line); border-radius:16px; padding:12px; box-shadow:0 10px 30px #0003; }
    .map { position:relative; aspect-ratio:1/1; overflow:hidden; border-radius:12px; background-color:#243c3d; background-image:linear-gradient(#ffffff12 1px,transparent 1px),linear-gradient(90deg,#ffffff12 1px,transparent 1px),radial-gradient(circle at 35% 30%,#316052,transparent 25%),radial-gradient(circle at 72% 70%,#5a4d32,transparent 28%); background-size:3.846% 3.846%; }
    .axis { position:absolute; pointer-events:none; color:#ffffff99; font-size:9px; text-shadow:0 1px 2px #000; }
    .axis.top { top:3px; left:0; right:0; display:flex; justify-content:space-around; } .axis.left { top:0; bottom:0; left:3px; display:flex; flex-direction:column; justify-content:space-around; }
    .pin { position:absolute; transform:translate(-50%,-50%); min-width:18px; height:18px; border-radius:50%; border:2px solid #fff; box-shadow:0 2px 7px #000b; cursor:pointer; z-index:2; }
    .pin.team { background:var(--blue); } .pin.shop { background:var(--orange); } .pin.event { background:#e76c83; } .pin.me { background:var(--green); }
    .pin-label { position:absolute; left:12px; top:-4px; white-space:nowrap; padding:2px 5px; border-radius:5px; background:#10151dcc; font-size:10px; pointer-events:none; }
    .legend { display:flex; flex-wrap:wrap; gap:8px; color:var(--muted); font-size:11px; margin-top:9px; } .legend span::before { content:""; display:inline-block; width:9px; height:9px; border-radius:50%; margin-right:4px; background:var(--blue); } .legend .shop::before { background:var(--orange); } .legend .event::before { background:#e76c83; }
    .row { display:flex; align-items:center; justify-content:space-between; gap:8px; } .title { font-weight:700; font-size:15px; } .muted { color:var(--muted); }
    .list { display:grid; gap:7px; margin-top:9px; } .item { padding:9px 10px; border:1px solid var(--line); border-radius:10px; background:#ffffff05; }
    .dot { display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--green); margin-right:6px; } .off { background:#657080; }
     #toast { position:fixed; left:12px; right:12px; bottom:14px; z-index:10; padding:10px 12px; background:#182331f2; border:1px solid var(--line); border-radius:10px; display:none; }
     .register { border-color:#527dbb; } .register h2 { margin:0 0 6px; font-size:16px; } .register p { margin:6px 0; color:var(--muted); } .register code { display:block; margin:12px 0; padding:12px; border-radius:10px; background:#0c1118; color:#fff; text-align:center; font:bold 24px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace; letter-spacing:.12em; user-select:all; } .register small { color:var(--muted); }
    @media (min-width:760px) { main { grid-template-columns:1.25fr .75fr; align-items:start; } header { padding-left:max(16px,calc((100% - 920px)/2)); } }
  </style>
</head>
<body>
  <header><h1>🗺 Rust Live Map <span class="version">${WEB_APP_VERSION}</span></h1><div class="sub" id="server">Подключение к Rust+…</div><div class="sub" id="diagnostics"></div></header>
   <main>
    <section class="panel register" id="registration" hidden><h2>🔐 Одноразовая регистрация</h2><p>Telegram не передал приложению служебный идентификатор. Это можно безопасно исправить через бота.</p><p>Скопируй код и отправь боту отдельным сообщением:</p><code id="link-code">получаю код…</code><p>Команда: <b>/link КОД</b></p><small id="link-status">Ожидаю подтверждение от бота…</small></section>
    <section class="panel"><div class="map" id="map"><div class="axis top" id="letters"></div><div class="axis left" id="numbers"></div></div><div class="legend"><span>тимейты</span><span class="shop">магазины</span><span class="event">события</span></div></section>
    <section class="panel"><div class="row"><div class="title">Тимейты</div><div class="muted" id="updated">—</div></div><div class="list" id="team"></div><div class="title" style="margin-top:16px">Магазины и события</div><div class="list" id="events"></div></section>
  </main>
  <div id="toast"></div>
  <script>
     const tg = window.Telegram?.WebApp;
     tg?.ready(); tg?.expand();
     function readTelegramInitData() {
       if (tg?.initData) return { value: tg.initData, source: "Telegram.WebApp.initData" };
       for (const raw of [window.location.hash.slice(1), window.location.search.slice(1)]) {
         if (!raw) continue;
         const params = new URLSearchParams(raw);
         const value = params.get("tgWebAppData") || params.get("initData");
         if (value) return { value, source: "URL tgWebAppData" };
       }
       return { value: "", source: "не найден" };
     }
      const telegramInitData = readTelegramInitData();
      const initData = telegramInitData.value;
      const storageKey = "rust-live-map-session";
      const storage = {
        get(key) { try { return window.localStorage.getItem(key) || ""; } catch { return ""; } },
        set(key, value) { try { window.localStorage.setItem(key, value); } catch {} },
        remove(key) { try { window.localStorage.removeItem(key); } catch {} }
      };
      let sessionToken = storage.get(storageKey);
      let linkInfo = null;
      let linkPollTimer = null;
    const $ = (id) => document.getElementById(id);
    const esc = (value) => String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[char]));
    const axisLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    $("letters").innerHTML = axisLetters.map((letter) => "<span>"+letter+"</span>").join("");
    $("numbers").innerHTML = Array.from({length:26},(_,i)=>"<span>"+(i+1)+"</span>").join("");
    function percent(value, mapSize) {
      const n = Number(value); if (!Number.isFinite(n)) return null;
      return Math.max(2, Math.min(98, Math.abs(n) <= 1 ? (n + .5) * 100 : ((n + Number(mapSize || 4500)/2) / Number(mapSize || 4500)) * 100));
    }
    function pin(map, item, kind, label) {
      const x = percent(item.x, map.mapSize), y = percent(item.y, map.mapSize);
      if (x === null || y === null) return "";
      return '<button class="pin '+kind+'" style="left:'+x+'%;top:'+y+'%" data-info="'+esc(label)+'"><span class="pin-label">'+esc(label)+'</span></button>';
    }
    function refreshMap(data) {
      const map = data.server || {};
      let html = "";
      (data.team || []).forEach((member) => { html += pin(map, member, member.me ? "me" : "team", member.name || "тимейт"); });
      (data.markers || []).forEach((marker) => { html += pin(map, marker, marker.shop ? "shop" : "event", marker.name || marker.type || "marker"); });
      $("map").querySelectorAll(".pin").forEach((node) => node.remove());
      $("map").insertAdjacentHTML("beforeend", html);
      $("map").querySelectorAll(".pin").forEach((node) => node.addEventListener("click", () => { $("toast").textContent = node.dataset.info; $("toast").style.display="block"; setTimeout(() => $("toast").style.display="none", 3500); }));
    }
    function render(data) {
      const server = data.server || {};
      $("server").textContent = (server.name || "Rust server") + " · " + (server.players !== undefined ? server.players + (server.maxPlayers ? "/"+server.maxPlayers : "") : "онлайн неизвестен") + (server.map ? " · "+server.map : "");
      $("updated").textContent = data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString() : "—";
      $("team").innerHTML = (data.team || []).length ? data.team.map((m) => '<div class="item"><span class="dot '+(m.online ? "" : "off")+'"></span><b>'+esc(m.name || "unknown")+'</b><span class="muted"> — '+(m.online ? "онлайн" : "вышел")+', '+(m.alive === false ? "мертв" : "жив")+(m.grid ? " · "+esc(m.grid) : "")+'</span></div>').join("") : '<div class="muted">Данные о тимейтах ещё не пришли.</div>';
      $("events").innerHTML = (data.markers || []).filter((m) => m.shop || m.special).slice(0,20).map((m) => '<div class="item"><b>'+esc(m.name || m.special || "Событие")+'</b><br><span class="muted">'+esc(m.grid || "квадрат неизвестен")+(m.loot ? " · "+esc(m.loot) : "")+'</span></div>').join("") || '<div class="muted">Новых магазинов и событий нет.</div>';
      refreshMap(data);
    }
     function showDiagnostics(message) {
       $("diagnostics").textContent = message;
     }
     function showRegistration(show) {
       $("registration").hidden = !show;
     }
     async function startRegistration() {
       if (linkInfo) return;
       try {
         const response = await fetch("/api/link/start", { cache: "no-store" });
         const data = await response.json();
         if (!response.ok) throw new Error(data.error || "Не удалось получить код");
         linkInfo = data;
         $("link-code").textContent = data.code;
         $("link-status").textContent = "Отправь код боту. Эта страница сама проверит привязку.";
         showRegistration(true);
         linkPollTimer = setInterval(checkRegistration, 2000);
       } catch (error) {
         showRegistration(true);
         $("link-status").textContent = "Ошибка получения кода: " + error.message;
       }
     }
     async function checkRegistration() {
       if (!linkInfo) return;
       try {
         const query = new URLSearchParams({ code: linkInfo.code, deviceToken: linkInfo.deviceToken });
         const response = await fetch("/api/link/status?" + query, { cache: "no-store" });
         const data = await response.json();
         if (!response.ok) throw new Error(data.error || "Код истёк");
         if (data.status === "linked" && data.sessionToken) {
           sessionToken = data.sessionToken;
           storage.set(storageKey, sessionToken);
           clearInterval(linkPollTimer);
           linkPollTimer = null;
           showRegistration(false);
           showDiagnostics("Версия сервера: " + (response.headers.get("X-Mini-App-Version") || "не определена") + " · регистрация через бота подтверждена");
           poll();
         } else {
           $("link-status").textContent = "Код активен. Отправь боту /link " + linkInfo.code;
         }
       } catch (error) {
         $("link-status").textContent = error.message;
       }
     }
     async function poll() {
      try {
         if (!initData && !sessionToken) {
           showDiagnostics("Telegram initData не передан · запусти регистрацию через бота");
           await startRegistration();
           return;
         }
         const headers = {};
         if (initData) headers["X-Telegram-Init-Data"] = initData;
         if (sessionToken) headers["X-Mini-App-Session"] = sessionToken;
         const response = await fetch("/api/state", { headers, cache: "no-store" });
         const data = await response.json();
         if (!response.ok) {
           if (response.status === 401 && !initData && sessionToken) {
             sessionToken = "";
             storage.remove(storageKey);
             showRegistration(true);
             await startRegistration();
             return;
           }
           const reason = response.status === 401
             ? (initData ? "Telegram initData передан, но подпись отклонена сервером." : "Telegram initData не передан. Открой через кнопку бота.")
             : (data.error || "API error");
           showDiagnostics("Диагностика: HTTP " + response.status + " · initData: " + telegramInitData.source + " · " + reason);
           throw new Error(data.error || "API error");
         }
         showDiagnostics("Версия сервера: " + (response.headers.get("X-Mini-App-Version") || "не определена") + " · initData: " + telegramInitData.source);
         render(data);
       } catch (error) { $("server").textContent = "Ошибка подключения: " + error.message; }
    }
     poll(); setInterval(poll, 1000);
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

function markerForWeb(marker) {
  const raw = `${marker.name || ""} ${marker.type || ""} ${marker.markerType || ""}`.toLowerCase();
  const orders = marker.sellOrders || marker.sell_orders || marker.orders || marker.offers ||
    marker.vendingMachine?.sellOrders || marker.vendingMachine?.orders;
  const list = Array.isArray(orders) ? orders : [];
  const isShop = /vending|shop|store|market|магазин|торгов/.test(raw) || list.length > 0;
  const loot = list.slice(0, 8).map((item) => {
    const name = item.itemName || item.name || item.shortname || `item ${item.itemId || ""}`;
    const amount = item.amount ?? item.quantity ?? item.amountToSell;
    return `${amount ? `${amount}× ` : ""}${name}`;
  }).join("; ");
  const special = /cargo|ship|oil|rig|deep.?sea|heli|ch47|chinook|excav|quarry|карьер/.test(raw)
    ? (raw.includes("cargo") || raw.includes("ship") ? "Cargo" : raw.includes("deep") ? "Deep Sea Oil Rig" : raw.includes("oil") || raw.includes("rig") ? "Oil Rig" : raw.includes("heli") || raw.includes("ch47") || raw.includes("chinook") ? "Helicopter" : "Quarry")
    : null;
  return {
    id: marker.id ?? marker.markerId,
    name: marker.name,
    type: marker.type,
    x: coordinate(marker.x ?? marker.position?.x, null),
    y: coordinate(marker.y ?? marker.z ?? marker.position?.z ?? marker.position?.y, null),
    grid: gridOf(marker.grid || marker.gridReference || marker.gridPosition),
    shop: isShop,
    special,
    loot
  };
}

function teamForWeb(member, mapSize, ownSteamId) {
  const position = member.position || member.location || {};
  return {
    id: String(member.steamId ?? member.id ?? member.name ?? ""),
    name: member.name || member.displayName || "unknown",
    online: member.online ?? member.isOnline ?? false,
    alive: member.isAlive ?? member.alive ?? member.is_alive,
    me: String(member.steamId ?? member.id ?? "") === String(ownSteamId || ""),
    x: coordinate(member.x ?? position.x, null),
    y: coordinate(member.z ?? member.y ?? position.z ?? position.y, null),
    grid: gridOf(member.grid || member.gridReference),
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
      code = crypto.randomBytes(5).toString("hex").toUpperCase();
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
    const info = profile.get("serverInfo") || {};
    const team = (profile.get("liveTeam") || []).map((member) => teamForWeb(member, info.mapSize, account.steamId));
    const markers = (profile.get("liveMarkers") || []).map(markerForWeb);
    response.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-mini-app-version": WEB_APP_VERSION
    });
    response.end(JSON.stringify({
      ok: true,
      updatedAt: profile.get("liveUpdatedAt"),
      server: { ...info, server: account.server, port: account.port },
      team,
      markers
    }));
  });
  server.linkMiniAppCode = linkMiniAppCode;
  return server;
}