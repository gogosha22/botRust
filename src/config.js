import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const splitIds = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Number(item))
    .filter(Number.isSafeInteger);

export function loadConfig(env = process.env) {
  const replitDomain = String(env.REPLIT_DEV_DOMAIN || env.REPLIT_DOMAINS || "")
    .split(",")
    .map((value) => value.trim())
    .find(Boolean);
  return {
    botToken: env.BOT_TOKEN?.trim(),
    pollIntervalMs: Math.max(1000, Number(env.POLL_INTERVAL_MS || 3000)),
    mapPollIntervalMs: Math.max(250, Number(env.MAP_POLL_INTERVAL_MS || 1000)),
    webAppPort: Math.max(1, Number(env.WEB_APP_PORT || env.PORT || 8787)),
    webAppUrl: env.WEB_APP_URL?.trim() || (replitDomain ? `https://${replitDomain}/mini-app` : ""),
    timezone: env.TIMEZONE || "Europe/Moscow",
    simulationMode: String(env.SIMULATION_MODE).toLowerCase() === "true",
    dataDir: path.resolve(env.DATA_DIR || "./data"),
    lootMultiplier: Math.max(0.01, Number(env.RUST_LOOT_MULTIPLIER || 2)),
    respawnMultiplier: Math.max(0.01, Number(env.RUST_RESPAWN_MULTIPLIER || 2)),
    raidAlertIntervalMs: Math.max(10000, Number(env.RAID_ALERT_INTERVAL_MS || 30000)),
    decayMultiplier: Math.max(0.01, Number(env.RUST_DECAY_MULTIPLIER || 1)),
    defaultSmartAlarmIds: splitIds(env.RUST_SMART_ALARM_IDS),
    defaultStorageMonitorIds: splitIds(env.RUST_STORAGE_MONITOR_IDS)
  };
}

export function validateConfig(config) {
  const errors = [];
  if (!config.botToken || config.botToken.includes("replace_me")) errors.push("BOT_TOKEN");
  return errors;
}

export function ensureDataDir(config) {
  fs.mkdirSync(config.dataDir, { recursive: true });
}