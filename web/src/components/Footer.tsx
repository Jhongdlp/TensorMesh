import { useEffect, useRef } from "react";
import { type Lang } from "../i18n";
import { LANDING_COPY } from "../i18n/landing";

interface FooterProps {
  lang: Lang;
  onGoToTop?: () => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
}

export default function Footer({ lang, onGoToTop }: FooterProps) {
  const t = LANDING_COPY[lang];
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mousePos = useRef<{ x: number; y: number; active: boolean; targetX: number; targetY: number }>({
    x: 0,
    y: 0,
    active: false,
    targetX: 0,
    targetY: 0,
  });

  // Canvas interactivo y dinámico de píxeles B&W de alta energía
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: false });
    if (!ctx) return;

    let animId = 0;
    const CELL = 12; // Tamaño de celda en la rejilla de píxeles
    let width = 0;
    let height = 0;
    let cols = 0;
    let rows = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.floor(rect.width);
      height = Math.floor(rect.height);
      canvas.width = width;
      canvas.height = height;
      cols = Math.ceil(width / CELL);
      rows = Math.ceil(height / CELL);
    };

    resize();
    window.addEventListener("resize", resize);

    // 8 centros gravitacionales para mayor dinamismo y presencia visual
    const blobs = [
      { x: 0.15, y: 0.35, speedX: 0.7, speedY: 0.9, radius: 0.22, phase: 0 },
      { x: 0.82, y: 0.40, speedX: -0.8, speedY: 0.6, radius: 0.20, phase: 1.4 },
      { x: 0.48, y: 0.62, speedX: 0.9, speedY: -0.7, radius: 0.24, phase: 2.8 },
      { x: 0.30, y: 0.75, speedX: -0.6, speedY: -0.8, radius: 0.18, phase: 4.2 },
      { x: 0.70, y: 0.25, speedX: 0.75, speedY: -0.5, radius: 0.19, phase: 3.1 },
      { x: 0.50, y: 0.20, speedX: -0.5, speedY: 0.8, radius: 0.17, phase: 5.0 },
      { x: 0.90, y: 0.70, speedX: 0.6, speedY: 0.6, radius: 0.16, phase: 0.8 },
    ];

    // Partículas de polvo de píxeles flotantes
    const dust: Particle[] = Array.from({ length: 28 }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.0012,
      vy: (Math.random() - 0.5) * 0.0012,
      size: Math.random() > 0.6 ? 2 : 1,
      alpha: 0.2 + Math.random() * 0.5,
    }));

    let time = 0;

    const render = () => {
      time += 0.024;
      ctx.clearRect(0, 0, width, height);

      if (cols === 0 || rows === 0) {
        animId = requestAnimationFrame(render);
        return;
      }

      // Suavizar posición del ratón (interpolación lerp)
      mousePos.current.x += (mousePos.current.targetX - mousePos.current.x) * 0.1;
      mousePos.current.y += (mousePos.current.targetY - mousePos.current.y) * 0.1;

      // Calcular posiciones armónicas de los blobs
      const currentBlobs = blobs.map((b) => {
        let bx = b.x + Math.cos(time * b.speedX + b.phase) * 0.08;
        let by = b.y + Math.sin(time * b.speedY + b.phase) * 0.08;

        // Atracción intensa hacia el cursor si está activo
        if (mousePos.current.active && width > 0 && height > 0) {
          const mx = mousePos.current.x / width;
          const my = mousePos.current.y / height;
          const dmx = mx - bx;
          const dmy = my - by;
          const dist = Math.hypot(dmx, dmy);
          if (dist < 0.45) {
            const pull = (1 - dist / 0.45) * 0.15;
            bx += dmx * pull;
            by += dmy * pull;
          }
        }

        return {
          x: bx * width,
          y: by * height,
          r: b.radius * Math.min(width, height),
        };
      });

      // Muestrear campo escalar en la rejilla de píxeles
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const px = c * CELL + CELL / 2;
          const py = r * CELL + CELL / 2;

          let val = 0;
          for (let i = 0; i < currentBlobs.length; i++) {
            const b = currentBlobs[i];
            const dx = px - b.x;
            const dy = py - b.y;
            const distSq = dx * dx + dy * dy;
            if (distSq > 0.001) {
              val += (b.r * b.r) / distSq;
            }
          }

          // Onda armónica adicional para textura fluida
          const wave = Math.sin(px * 0.015 + time) * Math.cos(py * 0.02 - time * 0.8) * 0.15;
          val += wave;

          // Gradiente escalonado B&W de alto impacto
          let fill: string | null = null;
          if (val >= 3.0) {
            fill = "rgba(255, 255, 255, 0.95)"; // Núcleo blanco sólido
          } else if (val >= 2.0) {
            fill = "rgba(255, 255, 255, 0.70)"; // Anillo interior
          } else if (val >= 1.2) {
            fill = "rgba(255, 255, 255, 0.38)"; // Anillo medio
          } else if (val >= 0.6) {
            fill = "rgba(255, 255, 255, 0.14)"; // Anillo tenue
          } else if (val >= 0.38) {
            fill = "rgba(255, 255, 255, 0.04)"; // Borde exterior
          }

          if (fill) {
            ctx.fillStyle = fill;
            ctx.fillRect(c * CELL, r * CELL, CELL - 1, CELL - 1);
          }
        }
      }

      // Dibujar partículas de polvo de píxeles
      for (let i = 0; i < dust.length; i++) {
        const p = dust[i];
        p.x = (p.x + p.vx + 1) % 1;
        p.y = (p.y + p.vy + 1) % 1;

        const gx = Math.floor((p.x * width) / CELL) * CELL;
        const gy = Math.floor((p.y * height) / CELL) * CELL;

        ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
        ctx.fillRect(gx, gy, CELL - 1, CELL - 1);
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mousePos.current.targetX = e.clientX - rect.left;
      mousePos.current.targetY = e.clientY - rect.top;
      mousePos.current.active = true;
    };

    const handleMouseLeave = () => {
      mousePos.current.active = false;
    };

    const parent = canvas.parentElement;
    if (parent) {
      parent.addEventListener("mousemove", handleMouseMove);
      parent.addEventListener("mouseleave", handleMouseLeave);
    }

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      if (parent) {
        parent.removeEventListener("mousemove", handleMouseMove);
        parent.removeEventListener("mouseleave", handleMouseLeave);
      }
    };
  }, []);

  return (
    <footer className="tensor-footer-ultra" aria-label="Pie de página">
      {/* 1. Barra superior: limpia, contextual y monospaciada */}
      <div className="tf-bar-top">
        <div className="tf-meta-left">
          <span>©2026</span>
          <span className="tf-muted">TENSORMESH</span>
        </div>
        <div className="tf-meta-center">
          <span>[WEBGPU COMPUTE SHADERS]</span>
        </div>
        <div className="tf-meta-right">
          <a
            href="https://github.com/Jhongdlp/embed"
            target="_blank"
            rel="noopener noreferrer"
            className="tf-link"
          >
            SOURCE ↗
          </a>
        </div>
      </div>

      {/* 2. Hero masivo con animación de píxeles hiper-dinámica */}
      <div className="tf-hero">
        <canvas ref={canvasRef} className="tf-canvas" aria-hidden="true" />
        <h2 className="tf-title">TENSORMESH</h2>
      </div>

      {/* 3. Barra inferior de cierre: pura y minimalista */}
      <div className="tf-bar-bottom">
        <div className="tf-author">
          <span className="tf-muted">CREATED BY</span>
          <a
            href="https://jhongdlp.com"
            target="_blank"
            rel="noopener noreferrer"
            className="tf-link"
          >
            JHONGDLP ↗
          </a>
        </div>
        <div className="tf-bottom-status">
          <span className="tf-muted">100% CLIENT-SIDE GPU SHADERS</span>
        </div>
      </div>
    </footer>
  );
}
