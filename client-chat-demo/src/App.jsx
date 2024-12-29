import "./App.css";
import PhysicsSimulation from "./engine/PhysicsSimulation.jsx";
import React, { useState } from "react";

function App() {
  const [channelId, setChannelId] = useState("global-demo");
  const [start, setStart] = useState(false);
  return (
    <>
      {!start ? (
        <div className="card" key="select-channel">
          <h1>Pick channel to start</h1>
          <label htmlFor="channelId">Channel ID:</label>
          <input
            type="text"
            name="channelId"
            placeholder="Channel ID"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
          />
          <button onClick={() => channelId && setStart(true)}>Start</button>
        </div>
      ) : (
        <div key="sim">
          <PhysicsSimulation channelId={channelId} />
        </div>
      )}
    </>
  );
}

export default App;
