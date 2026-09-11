import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const profileDefaults = {
  enabled: true,
  activeMode: true,
  chatMirror: true,
  chatMode: false,
  rustCommandPrefix: "/",
  favoriteMonument: "oil-rig",
  favoriteMonuments: ["oil-rig"],
  notificationSettings: {
    teamStatus: true,
    playerStatus: true,
    raid: true,
    storage: true,
    sunrise: true,
    sunset: true,
    rt: true,
    shop: true
  },
  rtTimers: {},
  rtSeen: {},
  rtSeenAt: {},
  seenChat: [],
  markerKeys: [],
  markerBootstrapped: false,
  serverInfo: {},
  liveMap: {
    width: null,
    height: null,
    image: null,
    monuments: []
  },
  liveTeam: [],
  liveMarkers: [],
  liveUpdatedAt: null,
  lootObservations: {},
  raidAlertActive: false,
  raidAlertStartedAt: null,
  raidAlertEntityId: null,
  lastTeam: {},
  lastGameTime: null,
  lastDeathEvent: null,
  bootstrapped: false
};

function keyFromSecret(secret) {
  return crypto.createHash("sha256").update(String(secret || "change-me")).digest();
}

function encrypt(value, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    encrypted.toString("base64")
  ].join(".");
}

function decrypt(value, secret) {
  try {
    const [iv, tag, encrypted] = String(value).split(".");
    const decipher = crypto.createDecipheriv("aes-256-gcm", keyFromSecret(secret), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64")),
      decipher.final()
    ]).toString("utf8"));
  } catch {
    return null;
  }
}

export class Store {
  constructor(dataDir, encryptionSecret) {
    this.file = path.join(dataDir, "state.json");
    this.secret = encryptionSecret;
    fs.mkdirSync(dataDir, { recursive: true });
    try {
      this.state = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch {
      this.state = { version: 2, users: {} };
    }
    this.state.version = 2;
    this.state.users ||= {};
    this.save();
  }

  save() {
    fs.writeFileSync(this.file, JSON.stringify(this.state, null, 2), { mode: 0o600 });
  }

  profile(userId) {
    const id = String(userId);
    if (!this.state.users[id]) {
      this.state.users[id] = {
        ...profileDefaults,
        notificationSettings: { ...profileDefaults.notificationSettings },
        favoriteMonuments: [...profileDefaults.favoriteMonuments],
        account: null
      };
    }
    const profile = this.state.users[id];
    let changed = false;
    for (const [key, value] of Object.entries(profileDefaults)) {
      if (profile[key] === undefined) {
        profile[key] = Array.isArray(value) ? [...value] :
          value && typeof value === "object" ? { ...value } : value;
        changed = true;
      }
    }
    if (!Array.isArray(profile.favoriteMonuments)) {
      profile.favoriteMonuments = profile.favoriteMonument ? [profile.favoriteMonument] : [];
      changed = true;
    }
    if (profile.favoriteMonument && !profile.favoriteMonuments.includes(profile.favoriteMonument)) {
      profile.favoriteMonuments.push(profile.favoriteMonument);
      changed = true;
    }
    if (profile.notificationSettings && typeof profile.notificationSettings === "object") {
      for (const [key, value] of Object.entries(profileDefaults.notificationSettings)) {
        if (profile.notificationSettings[key] === undefined) {
          profile.notificationSettings[key] = value;
          changed = true;
        }
      }
    }
    if (changed) this.save();
    return new UserStore(this, id);
  }

  getAccount(userId) {
    const profile = this.state.users[String(userId)];
    return profile?.account ? decrypt(profile.account, this.secret) : null;
  }

  setAccount(userId, account) {
    const profile = this.state.users[String(userId)] || {
      ...profileDefaults,
      notificationSettings: { ...profileDefaults.notificationSettings },
      favoriteMonuments: [...profileDefaults.favoriteMonuments]
    };
    profile.account = account ? encrypt(account, this.secret) : null;
    this.state.users[String(userId)] = profile;
    this.save();
  }

  deleteAccount(userId) {
    const profile = this.state.users[String(userId)];
    if (profile) {
      profile.account = null;
      this.save();
    }
  }

  allUserIds() {
    return Object.keys(this.state.users);
  }
}

export class UserStore {
  constructor(parent, userId) {
    this.parent = parent;
    this.userId = userId;
  }

  get state() {
    return this.parent.state.users[this.userId];
  }

  get(key) {
    return this.state[key];
  }

  set(key, value) {
    this.state[key] = value;
    this.parent.save();
    return value;
  }

  notificationEnabled(kind) {
    return this.state.notificationSettings?.[kind] !== false;
  }

  setNotification(kind, value) {
    this.state.notificationSettings ||= {};
    this.state.notificationSettings[kind] = Boolean(value);
    this.parent.save();
    return this.state.notificationSettings[kind];
  }

  update(patch) {
    Object.assign(this.state, patch);
    this.parent.save();
    return this.state;
  }

  rememberChat(key, max = 150) {
    if (this.state.seenChat.includes(key)) return false;
    this.state.seenChat = [...this.state.seenChat.slice(-(max - 1)), key];
    this.parent.save();
    return true;
  }
}