import React, { useState, useEffect } from "react";
import "./GpuRoomLoader.css";

interface GpuRoomLoaderProps {
  roomName?: string;
  sublabel?: string;
  minDurationMs?: number;
}

export function GpuRoomLoader({
  roomName = "INICIALIZANDO WEBGPU",
  sublabel = "cargando tensores…",
  minDurationMs = 1650, // 2 ciclos completos armónicos de escaneo tensorial (1.65 s)
}: GpuRoomLoaderProps) {
  const [tick, setTick] = useState(0);
  const [fading, setFading] = useState(false);
  const [hidden, setHidden] = useState(false);

  // Reloj cuántico discreto de la micro-matriz (70ms por pulso)
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => (t + 1) % 24);
    }, 70);
    return () => clearInterval(timer);
  }, []);

  // Temporizador calibrado: 1.65 s de exhibición + 350 ms de disolución suave
  useEffect(() => {
    const timer = setTimeout(() => {
      setFading(true);
      const hideTimer = setTimeout(() => {
        setHidden(true);
      }, 350);
      return () => clearTimeout(hideTimer);
    }, minDurationMs);

    return () => clearTimeout(timer);
  }, [minDurationMs]);

  if (hidden) return null;

  // Micro-matriz 4 filas x 6 columnas (24 píxeles)
  const ROWS = 4;
  const COLS = 6;
  const scan = tick % (COLS + 3);

  const dots = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const isScan = c === scan;
      const isPrev = c === scan - 1;
      const isActive = Math.sin(c * 1.1 + r * 1.4 + tick * 0.35) > 0.15;
      
      let state = "";
      if (isScan) {
        state = "hot";
      } else if (isPrev || isActive) {
        state = "on";
      }
      dots.push({ r, c, state });
    }
  }

  return (
    <div
      className={`gpu-loader-backdrop ${fading ? "gpu-loader-fade-out" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="gpu-loader-pill">
        <div className="gpu-micro-grid" aria-hidden="true">
          {dots.map((d) => (
            <span
              key={`${d.r}-${d.c}`}
              className={`gpu-micro-dot ${d.state}`}
            />
          ))}
        </div>
        <div className="gpu-micro-info">
          <span className="gpu-micro-label">{roomName}</span>
          <span className="gpu-micro-sub">{sublabel}</span>
        </div>
      </div>
    </div>
  );
}

export default GpuRoomLoader;
