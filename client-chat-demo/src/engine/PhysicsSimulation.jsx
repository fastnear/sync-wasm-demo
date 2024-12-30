import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRapierWorld } from "./useRapierWorld";
import { ChatLogic } from "../chat/ChatLogic.jsx";

const MS_PER_STEP = 16;
const MAX_STEPS_PER_FRAME = 300;
const ADD_BODY_POS_SCALE = 100000;
const HEARTBEAT_MS = MS_PER_STEP * 5;
const CATCH_UP_MS = HEARTBEAT_MS * 2;
const SIMULATION_SLEEP_MS = 15 * 1000;
const WORLD_SCALE = 25;

const PhysicsSimulation = (props) => {
  const channelId = props.channelId;
  const canvasRef = useRef(null);
  const groundBodies = useRef([]);
  const bodiesRef = useRef([]);
  const frameIdRef = useRef(null);
  const [bodyCount, setBodyCount] = useState(0);
  const [simulationBehindSec, setSimulationBehindSec] = useState("loading");
  const staticState = useMemo(
    () => ({
      actions: [],
      syncTimestamp: 0,
      worldTimestamp: 0,
      renderTimestamp: 0,
      messageTimestamp: 0,
      actionTimestamp: 0,
    }),
    [],
  );

  const [chatLogic, setChatLogic] = useState(null);

  const { isLoaded, worldRef, createGroundBodies, createDynamicBody } =
    useRapierWorld();

  // Convert between screen and physics coordinates
  const toPhysics = (px, py, canvas) => {
    const centerX = canvas.width / 2;
    const centerY = canvas.height;
    const scale = window.devicePixelRatio || 1;
    const metersPerPixel = 1 / WORLD_SCALE / scale;

    return {
      x: (px - centerX) * metersPerPixel,
      y: -(py - centerY) * metersPerPixel,
    };
  };

  const toPixels = (x) => x * WORLD_SCALE;

  const isLive =
    simulationBehindSec === "live" || simulationBehindSec === "sleeping";

  // Handle canvas clicks
  const handleCanvasClick = (event) => {
    if (!canvasRef.current || !isLive) {
      return;
    }

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;

    // Get click position in canvas coordinates
    const px = (event.clientX - rect.left) * scale;
    const py = (event.clientY - rect.top) * scale;

    // Convert to physics coordinates
    const physicsPos = toPhysics(px, py, canvas);

    chatLogic.addMessage({
      action: "addBody",
      x: Math.round(physicsPos.x * ADD_BODY_POS_SCALE),
      y: Math.round(physicsPos.y * ADD_BODY_POS_SCALE),
      color: `hsl(${Math.random() * 360}, 80%, 60%)`,
    });
  };

  // Animation function to render the scene
  const render = useCallback(() => {
    if (!canvasRef.current || !worldRef.current) {
      return;
    }

    const renderTimestamp = Date.now();

    if (staticState.worldTimestamp) {
      if (!staticState.renderTimestamp) {
        staticState.renderTimestamp = renderTimestamp;
      }
      // Can be negative if clocks are not in sync
      const renderDt = renderTimestamp - staticState.renderTimestamp;
      const serverLatency =
        staticState.messageTimestamp - staticState.syncTimestamp;
      // Simulate physics
      if (renderDt >= MS_PER_STEP) {
        staticState.renderTimestamp += MS_PER_STEP;
        for (let i = 0; i < MAX_STEPS_PER_FRAME; ++i) {
          if (
            staticState.actionTimestamp + SIMULATION_SLEEP_MS <=
            staticState.worldTimestamp
          ) {
            // advance to next action or break
            if (staticState.actions.length > 0) {
              staticState.worldTimestamp = staticState.actions[0].timestamp;
            } else {
              setSimulationBehindSec("sleeping");
              break;
            }
          }
          const physicsDt =
            staticState.syncTimestamp - staticState.worldTimestamp;
          const renderDelay =
            renderTimestamp - staticState.worldTimestamp - serverLatency;
          if (physicsDt < MS_PER_STEP || (i && renderDelay < CATCH_UP_MS)) {
            break;
          }
          if (renderDelay >= CATCH_UP_MS * 2) {
            setSimulationBehindSec(
              `catching up ${(physicsDt / 1000).toFixed(3)} sec`,
            );
          } else {
            setSimulationBehindSec("live");
          }
          while (
            staticState.actions.length > 0 &&
            staticState.worldTimestamp >= staticState.actions[0].timestamp
          ) {
            const message = staticState.actions.shift();
            const action = message.data.message;
            if (action.action === "addBody") {
              staticState.actionTimestamp = message.timestamp;
              const x = action.x / ADD_BODY_POS_SCALE;
              const y = action.y / ADD_BODY_POS_SCALE;
              const color = action.color;
              const body = createDynamicBody(x, y);
              if (body) {
                bodiesRef.current.push({
                  body,
                  color,
                });
                setBodyCount((count) => count + 1);
              }
            }
          }
          staticState.worldTimestamp += MS_PER_STEP;
          worldRef.current.step();
        }
      }
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const scale = window.devicePixelRatio || 1;
    const centerX = canvas.width / (2 * scale);
    const centerY = canvas.height / scale;

    // Clear canvas
    ctx.fillStyle = "#f0f0f0";
    ctx.fillRect(0, 0, canvas.width / scale, canvas.height / scale);

    // Draw ground
    groundBodies.current.forEach((body) => {
      const pos = body.translation();
      const rot = body.rotation();

      ctx.save();
      ctx.translate(centerX + toPixels(pos.x), centerY - toPixels(pos.y));
      ctx.rotate(-rot);

      ctx.fillStyle = "#666";
      // ctx.fillRect(
      //   centerX - toPixels(5),
      //   centerY + toPixels(0.1),
      //   toPixels(10),
      //   toPixels(0.2),
      // );
      const shape = body.shape;
      const width = shape.halfExtents.x * 2;
      const height = shape.halfExtents.y * 2;
      ctx.fillRect(
        -toPixels(width / 2),
        -toPixels(height / 2),
        toPixels(width),
        toPixels(height),
      );

      ctx.restore();
    });
    //
    // ctx.fillStyle = "#666";
    // ctx.fillRect(
    //   centerX - toPixels(5),
    //   centerY + toPixels(0.1),
    //   toPixels(10),
    //   toPixels(0.2),
    // );

    // Draw all bodies
    bodiesRef.current.forEach(({ body, color }) => {
      const pos = body.translation();
      const rot = body.rotation();

      ctx.save();
      ctx.translate(centerX + toPixels(pos.x), centerY - toPixels(pos.y));
      ctx.rotate(-rot);

      ctx.fillStyle = color;
      ctx.fillRect(-toPixels(0.5), -toPixels(0.5), toPixels(1), toPixels(1));

      // Direction indicator
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(toPixels(0.5), 0);
      ctx.strokeStyle = "#fff";
      ctx.stroke();

      ctx.restore();
    });
  }, [canvasRef, bodiesRef, staticState, worldRef]);

  // Set up canvas and physics objects
  useEffect(() => {
    if (!isLoaded || !canvasRef.current) {
      return;
    }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // Set canvas size with proper scaling
    const scale = window.devicePixelRatio || 1;
    canvas.width = 800 * scale;
    canvas.height = 600 * scale;
    canvas.style.width = "800px";
    canvas.style.height = "600px";
    ctx.scale(scale, scale);

    // Create ground
    groundBodies.current = createGroundBodies();

    const gameLoop = () => {
      render();
      frameIdRef.current = requestAnimationFrame(gameLoop);
    };

    frameIdRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (frameIdRef.current) {
        cancelAnimationFrame(frameIdRef.current);
      }
      bodiesRef.current = [];
      setBodyCount(0);
    };
  }, [isLoaded, canvasRef, render]);

  const processMessage = useCallback(
    (message) => {
      const timestamp = message.timestamp;
      staticState.syncTimestamp = timestamp;
      staticState.messageTimestamp = Date.now();
      if (message.action === "message") {
        if (staticState.actionTimestamp + SIMULATION_SLEEP_MS <= timestamp) {
          staticState.worldTimestamp = timestamp;
        }
        staticState.actions.push(message);
      }
    },
    [render, staticState],
  );

  useEffect(() => {
    if (!isLoaded || !canvasRef.current) {
      return;
    }

    const chatLogic = new ChatLogic({
      channelId,
      onMessage: (message) => {
        switch (message.type) {
          case "history":
            message.data.messages.forEach(processMessage);
            if (message.data.lastHeartbeat) {
              processMessage(message.data.lastHeartbeat);
            }
            setSimulationBehindSec("sleeping");
            break;
          case "channel":
            processMessage(message.data);
            break;
        }
      },
      heartbeatMs: HEARTBEAT_MS,
    });
    setChatLogic(chatLogic);
    return () => {
      chatLogic.close();
      setChatLogic(null);
    };
  }, [isLoaded, processMessage]);

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-2">Sync Physics Simulation</h1>
      {!isLoaded ? (
        <p>Loading physics engine...</p>
      ) : (
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="border border-gray-300 rounded-lg bg-gray-50 cursor-crosshair"
        />
      )}
      <p className="mb-2" style={{ color: isLive ? "#000" : "#ddd" }}>
        Click anywhere to add physics objects!
      </p>
      <p className="text-sm text-gray-600" style={{ fontFamily: "monospace" }}>
        Active objects: {bodyCount}. Simulation {simulationBehindSec}
      </p>
    </div>
  );
};

export default PhysicsSimulation;
