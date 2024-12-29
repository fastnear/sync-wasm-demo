import { useState, useEffect, useRef } from "react";

// Singleton instance to store the RAPIER module
let rapierInstance = null;

export const useRapierWorld = () => {
  const [isLoaded, setIsLoaded] = useState(false);
  const worldRef = useRef(null);

  // Initialize Rapier and create the world
  useEffect(() => {
    const initRapier = async () => {
      try {
        // Only load RAPIER once
        if (!rapierInstance) {
          rapierInstance = await import("@dimforge/rapier2d");
        }

        if (!worldRef.current) {
          const gravity = { x: 0.0, y: -9.81 };
          worldRef.current = new rapierInstance.World(gravity);
        }

        setIsLoaded(true);
      } catch (error) {
        console.error("Failed to initialize Rapier:", error);
      }
    };

    initRapier();

    // Cleanup function
    return () => {
      // Note: We don't destroy the rapierInstance as it's shared
    };
  }, []);

  // Create ground
  const createGroundBodies = (width = 15.0, height = 0.1) => {
    if (!worldRef.current || !rapierInstance) {
      return null;
    }

    const bodies = [];

    const groundColliderDesc = rapierInstance.ColliderDesc.cuboid(
      width,
      height,
    );
    bodies.push(
      worldRef.current.createCollider(
        groundColliderDesc.setRotation(Math.PI / 4),
      ),
    );
    bodies.push(
      worldRef.current.createCollider(
        groundColliderDesc.setRotation(-Math.PI / 4),
      ),
    );
    bodies.push(
      worldRef.current.createCollider(
        groundColliderDesc.setTranslation(15, 7).setRotation(Math.PI / 2),
      ),
    );
    bodies.push(
      worldRef.current.createCollider(
        groundColliderDesc.setTranslation(-15, 7).setRotation(Math.PI / 2),
      ),
    );

    bodies.push(
      worldRef.current.createCollider(
        rapierInstance.ColliderDesc.cuboid(100000, height),
      ),
    );
    return bodies;
  };

  // Create a dynamic body
  const createDynamicBody = (x = 0, y = 1, width = 0.5, height = 0.5) => {
    if (!worldRef.current || !rapierInstance) {
      return null;
    }

    const rigidBodyDesc = rapierInstance.RigidBodyDesc.dynamic().setTranslation(
      x,
      y,
    );
    const rigidBody = worldRef.current.createRigidBody(rigidBodyDesc);

    const colliderDesc = rapierInstance.ColliderDesc.cuboid(width, height);
    const collider = worldRef.current.createCollider(colliderDesc, rigidBody);

    return rigidBody;
  };

  // Start the physics simulation
  const startSimulation = (callback) => {
    if (!worldRef.current) {
      return;
    }

    const gameLoop = () => {
      worldRef.current.step();
      if (callback) {
        callback(worldRef.current);
      }
      frameIdRef.current = requestAnimationFrame(gameLoop);
    };

    frameIdRef.current = requestAnimationFrame(gameLoop);
  };

  // Stop the physics simulation
  const stopSimulation = () => {
    if (frameIdRef.current) {
      cancelAnimationFrame(frameIdRef.current);
      frameIdRef.current = null;
    }
  };

  return {
    isLoaded,
    worldRef,
    RAPIER: rapierInstance,
    createGroundBodies,
    createDynamicBody,
    startSimulation,
    stopSimulation,
  };
};
