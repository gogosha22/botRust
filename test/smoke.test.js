import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { findMonument, formatMonument, RT_CATALOG, markerSquare } from "../src/rt-catalog.js";
import { markerKey, normalizeChat, normalizeMarkers, normalizeServerInfo, normalizeTime, normalizeTeam } from "../src/rust-client.js";
import { findPairing, parseCredentialInfo } from "../src/credentials.js";
import { decayEstimate, findDecayMaterial, formatDuration, parseDecayCommand } from "../src/decay.js";
import { createWebAppServer, validateInitData, WEB_APP_VERSION } from "../src/web-app.js";

test("catalog finds Russian and English aliases", () => {
  assert.equal(findMonument("нефтевышка").slug, "oil-rig");
  assert.equal(findMonument("cargo").slug, "cargo-ship");
  assert.match(formatMonument(RT_CATALOG[0]), /Oil Rig/);
});

test("Rust+ payload normalizers accept nested responses", () => {
  assert.equal(normalizeTime({ response: { time: { time: "06:30" } } }), "06:30");
  assert.equal(normalizeTime({ response: { time: { time: 18.078763961791992 } } }), "18:04");
  assert.equal(normalizeTeam({ response: { teamInfo: { members: [{ steamId: 1 }] } } }).length, 1);
  assert.equal(normalizeChat({ response: { teamChat: { messages: [{ message: { text: ".help" } }] } } })[0].message, ".help");
  assert.equal(normalizeChat({ broadcast: { teamMessage: { message: { text: "/дерево хп 120" } } } })[0].message, "/дерево хп 120");
  assert.equal(normalizeMarkers({ broadcast: { mapMarker: { id: 7, type: 3, name: "VendingMachine", x: 0, y: 0 } } }).length, 1);
  assert.equal(normalizeMarkers({ marker: { id: 7, type: 3, name: "VendingMachine", x: 0, y: 0 } }).length, 1);
  assert.deepEqual(normalizeServerInfo({ response: { info: { players: 12, maxPlayers: 100, map: "Procedural Map" } } }), {
    players: 12,
    maxPlayers: 100,
    map: "Procedural Map",
    name: undefined,
    mapSize: undefined,
    queuedPlayers: undefined,
    joiningPlayers: undefined,
    lootMultiplier: undefined,
    respawnMultiplier: undefined,
    plugins: undefined,
    seed: undefined,
    wipeTime: undefined
  });
});

test("marker keys are stable", () => {
  assert.equal(markerKey({ id: 42 }), "42");
  assert.equal(markerKey({ type: 1, name: "cargo", x: 0.1, y: 0.2 }), markerKey({ type: 1, name: "cargo", x: 0.1, y: 0.2 }));
  assert.match(markerSquare({ x: 0, y: 0 }), /^[A-Z]\d+$/);
  assert.match(markerSquare({ x: 0, z: 0 }, 4500), /^[A-Z]\d+$/);
});

test("decay commands calculate remaining wall time", () => {
  assert.equal(findDecayMaterial("дерево").key, "wood");
  assert.equal(parseDecayCommand(["метал", "хп", "700"]).material.key, "metal");
  assert.equal(formatDuration(decayEstimate(findDecayMaterial("stone"), 250).minutes), "2 ч. 30 мин.");
});

test("Credential Info and pairing notifications are parsed", () => {
  const credentials = parseCredentialInfo(
    "/credentials add gcm_android_id:abc123 gcm_security_token:secret steam_id:76561198000000000 issued_date:2026-01-01 expire_date:2027-01-01"
  );
  assert.deepEqual(credentials, {
    androidId: "abc123",
    securityToken: "secret",
    steamId: "76561198000000000",
    issuedDate: "2026-01-01",
    expireDate: "2027-01-01"
  });
  assert.deepEqual(findPairing({
    data: { ip: "rust.example", port: "28082", playerId: "76561198000000000", playerToken: "token" }
  }), {
    server: "rust.example",
    port: 28082,
    steamId: "76561198000000000",
    playerToken: "token",
    entityId: undefined,
    entityType: undefined
  });
});

test("Telegram Mini App initData uses the Telegram Web Apps HMAC order", () => {
  const botToken = "123456789:AA_test_token";
  const user = { id: 424242, first_name: "Test" };
  const params = new URLSearchParams([
    ["auth_date", String(Math.floor(Date.now() / 1000))],
    ["query_id", "AAH_test_query"],
    ["user", JSON.stringify(user)]
  ]);
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = crypto.createHmac("sha256", botToken).update("WebAppData").digest();
  const hash = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  const initData = `${params.toString()}&hash=${hash}`;

  assert.deepEqual(validateInitData(initData, botToken), user);
  assert.equal(validateInitData(`${params.toString()}&hash=${"0".repeat(64)}`, botToken), null);
});

test("Mini App exposes a visible release version", () => {
  assert.equal(WEB_APP_VERSION, "2026.09.11.4");
});

test("Mini App can be linked through a one-time bot code", async () => {
  const profile = {
    get(key) {
      return {
        serverInfo: { name: "Test Rust", mapSize: 4500 },
        liveTeam: [],
        liveMarkers: [],
        liveUpdatedAt: Date.now()
      }[key];
    }
  };
  const store = { profile: () => profile, getAccount: () => ({}) };
  const server = createWebAppServer({ botToken: "test-token", simulationMode: false }, store, {});
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const start = await fetch(`${base}/api/link/start`);
  assert.equal(start.status, 200);
  const link = await start.json();
  assert.match(link.code, /^[A-F0-9]{10}$/);
  assert.equal((await (await fetch(`${base}/api/link/status?code=${link.code}&deviceToken=${encodeURIComponent(link.deviceToken)}`)).json()).status, "waiting");

  assert.equal(server.linkMiniAppCode(link.code, 424242), true);
  const linked = await (await fetch(`${base}/api/link/status?code=${link.code}&deviceToken=${encodeURIComponent(link.deviceToken)}`)).json();
  assert.equal(linked.status, "linked");
  const state = await fetch(`${base}/api/state`, { headers: { "X-Mini-App-Session": linked.sessionToken } });
  assert.equal(state.status, 200);
  assert.equal((await state.json()).ok, true);
  assert.equal(server.linkMiniAppCode(link.code, 424242), false);
  server.close();
});