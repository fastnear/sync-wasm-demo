import React, { useCallback, useEffect, useState } from "react";
import { ChatLogic } from "./ChatLogic";

const CHANNEL_ID = "chat-demo";

export function Chat(props) {
  const [messages, setMessages] = useState([]);
  const [chatLogic, setChatLogic] = useState(null);
  const [currentMessage, setCurrentMessage] = useState("");

  useEffect(() => {
    const chatLogic = new ChatLogic({
      channelId: CHANNEL_ID,
      onMessage: (message) => {
        setMessages((messages) => [...messages, message]);
      },
    });
    setChatLogic(chatLogic);
    return () => {
      chatLogic.close();
      setChatLogic(null);
    };
  }, []);

  const addMessage = useCallback(
    (message) => {
      chatLogic.addMessage(message);
    },
    [chatLogic],
  );

  return (
    <div style={{ border: "solid 1px", textAlign: "start" }}>
      <div>
        <div style={{ fontWeight: "bold" }}>Messages:</div>
        <div>
          {messages.map((message, i) => {
            return (
              <div key={i} style={{ overflow: "hidden", whiteSpace: "nowrap" }}>
                {JSON.stringify(message)}
              </div>
            );
          })}
        </div>
        <hr />
        <div>
          <input
            type="text"
            placeholder="Type a message"
            value={currentMessage}
            onChange={(e) => setCurrentMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setCurrentMessage("");
                addMessage(currentMessage);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
