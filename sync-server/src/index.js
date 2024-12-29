require("dotenv").config();
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { saveJson, loadJson, isString } = require("./utils");

const WebSocket = require("ws");

const MAX_HISTORY = 1000;
const MIN_HEARTBEAT_PERIOD_MS = 8;

const ResPath = process.env.RES_PATH || "res";
const WsSubsFilename = ResPath + "/ws_subs.json";

(async () => {
  if (!fs.existsSync(ResPath)) {
    fs.mkdirSync(ResPath);
  }

  const WS_PORT = process.env.WS_PORT || 7071;

  const wss = new WebSocket.Server({ port: WS_PORT });
  console.log("WebSocket server listening on http://localhost:%d/", WS_PORT);

  const wsClients = new Map();
  const channels = new Map();

  const saveWsSubs = () => {
    saveJson(
      [...wsClients.values()].map(
        ({ xForwardedFor, remoteAddress, clientId }) => ({
          xForwardedFor,
          remoteAddress,
          clientId,
        }),
      ),
      WsSubsFilename,
    );
  };

  const addHeartbeatMessage = (channel) => {
    channel.lastHeartbeat = Date.now();
    const message = {
      action: "heartbeat",
      timestamp: channel.lastHeartbeat,
      nonce: channel.nonce++,
    };
    channel.clients.forEach((ws) => {
      try {
        ws.send(
          JSON.stringify({
            type: "channel",
            data: message,
          }),
        );
      } catch (e) {
        console.log("Failed to send message to ws", e);
      }
    });
  };

  const addChannelMessage = (channel, action, data) => {
    const message = {
      action,
      data,
      timestamp: Date.now(),
      nonce: channel.nonce++,
    };
    channel.messages.push(message);
    channel.clients.forEach((ws) => {
      try {
        ws.send(
          JSON.stringify({
            type: "channel",
            data: message,
          }),
        );
      } catch (e) {
        console.log("Failed to send message to ws", e);
      }
    });
  };

  const handleJoin = (ws, req, data) => {
    const client = wsClients.get(ws);
    client.xForwardedFor = req.headers["x-forwarded-for"];
    client.remoteAddress = req.connection.remoteAddress;
    const clientId = client.clientId;
    const channelId = data.channelId;
    if (!channelId || !isString(channelId)) {
      // TODO: Send error message to ws
      throw new Error("Channel is required");
    }
    if (client.channelId) {
      // TODO: Send error message to ws
      throw new Error("Already in a channel");
    }
    client.channelId = data.channelId;
    if (!channels.has(channelId)) {
      channels.set(channelId, {
        clients: new Map(),
        messages: [],
        nonce: 1,
        lastHeartbeat: Date.now(),
      });
    }
    const channel = channels.get(channelId);
    // Try to send past history. And your ID
    try {
      let lastHeartbeat = undefined;
      if (
        channel.messages.length === 0 ||
        channel.messages[channel.messages.length - 1].nonce !==
          channel.nonce - 1
      ) {
        lastHeartbeat = {
          action: "heartbeat",
          timestamp: channel.lastHeartbeat,
          nonce: channel.nonce - 1,
        };
      }
      ws.send(
        JSON.stringify({
          type: "history",
          data: {
            messages: channel.messages.slice(-MAX_HISTORY),
            lastHeartbeat,
          },
        }),
      );
    } catch (e) {
      console.log("Failed to send past messages", e);
    }
    channel.clients.set(clientId, ws);
    addChannelMessage(channel, "connected", {
      clientId,
    });
  };

  const handleMessage = (ws, data) => {
    const client = wsClients.get(ws);
    const clientId = client.clientId;
    const channelId = client.channelId;
    if (!channelId) {
      // TODO: Send error message to ws
      throw new Error("Not in a channel");
    }
    const channel = channels.get(channelId);
    addChannelMessage(channel, "message", {
      clientId,
      message: data.message,
    });
  };

  const handleHeartbeat = (ws, data) => {
    const client = wsClients.get(ws);
    const channelId = client.channelId;
    if (!channelId) {
      // TODO: Send error message to ws
      throw new Error("Not in a channel");
    }
    const channel = channels.get(channelId);
    const now = Date.now();
    const heartbeatPeriodMs = Math.max(
      parseInt(data.periodMs, 10) || 0,
      MIN_HEARTBEAT_PERIOD_MS,
    );
    const durationMs = now - channel.lastHeartbeat;
    if (durationMs >= heartbeatPeriodMs) {
      addHeartbeatMessage(channel);
    }
  };

  const handleDisconnect = (ws, clientId) => {
    const client = wsClients.get(ws);
    if (client.channelId) {
      const channel = channels.get(client.channelId);
      if (channel) {
        channel.clients.delete(clientId);
        addChannelMessage(channel, "disconnected", {
          clientId,
        });
      }
    }
    wsClients.delete(ws);

    saveWsSubs();
  };

  wss.on("connection", (ws, req) => {
    const clientId = uuidv4();
    console.log("WS Connection open", clientId);
    ws.on("error", console.error);

    wsClients.set(ws, {
      clientId,
      channel: null,
    });

    ws.on("close", () => {
      console.log("connection closed", clientId);
      handleDisconnect(ws, clientId);
    });

    ws.on("message", (dataString) => {
      try {
        const data = JSON.parse(dataString);
        switch (data.action) {
          case "join":
            handleJoin(ws, req, data);
            break;
          case "message":
            handleMessage(ws, data);
            break;
          case "heartbeat":
            handleHeartbeat(ws, data);
            break;
          default:
            throw new Error("Invalid action");
        }
      } catch (e) {
        console.log("Bad message", e);
      }
    });

    try {
      ws.send(
        JSON.stringify({
          type: "welcome",
          data: {
            clientId,
          },
        }),
      );
    } catch (e) {
      console.log("Failed to send welcome message", e);
    }
  });
})();
