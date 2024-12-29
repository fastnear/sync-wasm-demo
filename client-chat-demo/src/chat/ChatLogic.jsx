const WS_URL = "wss://wss.sync.fastnear.com";

export class ChatLogic {
  constructor({ onMessage, channelId, heartbeatMs }) {
    this.onMessage = onMessage;
    this.ws = new WebSocket(WS_URL);
    this.heartbeatInterval = null;
    this.ws.addEventListener("message", (data) => {
      console.log("Received message:", data);
      try {
        const message = JSON.parse(data.data);
        // this.messages.push(message);
        this.onMessage?.(message);
      } catch (e) {
        console.error("Failed to parse message:", data, e);
      }
    });
    this.ws.addEventListener("open", () => {
      this.ws.send(
        JSON.stringify({
          action: "join",
          channelId,
        }),
      );
      if (heartbeatMs) {
        this.heartbeatInterval = setInterval(() => {
          this.ws.send(
            JSON.stringify({
              action: "heartbeat",
              periodMs: heartbeatMs,
            }),
          );
        }, heartbeatMs);
      }
    });
  }

  addMessage(message) {
    this.ws.send(
      JSON.stringify({
        action: "message",
        message,
      }),
    );
  }

  close() {
    this.heartbeatInterval && clearInterval(this.heartbeatInterval);
    this.ws.close();
    this.ws = null;
  }
}
