const aliases = {
  gcm_android_id: "androidId",
  android_id: "androidId",
  gcm_security_token: "securityToken",
  security_token: "securityToken",
  steam_id: "steamId",
  player_id: "steamId",
  issued_date: "issuedDate",
  expire_date: "expireDate"
};

export function parseCredentialInfo(text) {
  const input = String(text || "").replace(/\r/g, " ").trim();
  if (!/credentials\s+add/i.test(input)) return null;
  const result = {};
  const pairPattern = /([a-z][a-z0-9_]*)\s*:\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))/gi;
  for (const match of input.matchAll(pairPattern)) {
    const key = aliases[match[1].toLowerCase()];
    if (key) result[key] = match[2] ?? match[3] ?? match[4];
  }
  if (!result.androidId || !result.securityToken) return null;
  return result;
}

export function findPairing(value, seen = new Set()) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    try {
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        return findPairing(JSON.parse(trimmed), seen);
      }
    } catch {
      // Some FCM values are JSON-like strings with extra wrapper text.
    }
    const ip = trimmed.match(/(?:^|["'\s])ip["']?\s*[:=]\s*["']?([^"',\s}]+)/i)?.[1];
    const port = trimmed.match(/(?:^|["'\s])port["']?\s*[:=]\s*["']?(\d+)/i)?.[1];
    const playerId = trimmed.match(/playerId["']?\s*[:=]\s*["']?(\d+)/i)?.[1];
    const playerToken = trimmed.match(/playerToken["']?\s*[:=]\s*["']?([^"',\s}]+)/i)?.[1];
    if (ip && port && playerId && playerToken) return { server: ip, port: Number(port), steamId: playerId, playerToken };
    return null;
  }
  if (typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  const server = value.ip || value.server || value.host;
  const port = value.port || value.appPort || value.app_port;
  const steamId = value.playerId || value.player_id || value.steamId;
  const playerToken = value.playerToken || value.player_token;
  if (server && port && steamId && playerToken) {
    return { server: String(server), port: Number(port), steamId: String(steamId), playerToken: String(playerToken), entityId: value.entityId, entityType: value.entityType };
  }
  for (const child of Object.values(value)) {
    const found = findPairing(child, seen);
    if (found) return found;
  }
  return null;
}