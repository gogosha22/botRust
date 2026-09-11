import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { findPairing } from "./credentials.js";

const require = createRequire(import.meta.url);

export class FcmPairingListener extends EventEmitter {
  constructor(credentials) {
    super();
    this.credentials = credentials;
    this.client = null;
  }

  async start() {
    const PushReceiverClient = require("@liamcottle/push-receiver/src/client");
    this.client = new PushReceiverClient(
      this.credentials.androidId,
      this.credentials.securityToken,
      []
    );
    this.client.on("ON_DATA_RECEIVED", (data) => {
      const pairing = findPairing(data);
      if (pairing) this.emit("pairing", pairing);
      else this.emit("notification", data);
    });
    await this.client.connect();
  }

  stop() {
    if (this.client?.destroy) this.client.destroy();
    if (this.client?.disconnect) this.client.disconnect();
    this.client = null;
  }
}