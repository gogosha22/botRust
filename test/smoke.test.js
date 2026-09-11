import test from "node:test";
import assert from "node:assert/strict";
import { findMonument, formatMonument, RT_CATALOG, markerSquare } from "../src/rt-catalog.js";
import { markerKey, normalizeChat, normalizeMarkers, normalizeServerInfo, normalizeTime, normalizeTeam } from "../src/rust-client.js";
import { findPairing, parseCredentialInfo } from "../src/credentials.js";
import { decayEstimate, findDecayMaterial, formatDuration, parseDecayCommand } from "../src/decay.js";

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