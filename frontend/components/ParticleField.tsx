"use client";

import { useEffect, useRef } from "react";

export type ParticleFieldState = "idle" | "active" | "consensus";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

// Deliberately restrained -- "very subtle geometric ambient, prefer clean
// over noisy" per the editorial redesign direction. A dense, bright
// particle field reads as crypto-neon; a handful of quiet, slow-moving
// points is closer to the calm-power mood this system is going for.
const STATE_CONFIG: Record<ParticleFieldState, { count: number; speed: number; linkDistance: number; opacity: number }> = {
  idle: { count: 18, speed: 0.04, linkDistance: 110, opacity: 0.12 },
  active: { count: 24, speed: 0.07, linkDistance: 130, opacity: 0.16 },
  consensus: { count: 28, speed: 0.1, linkDistance: 150, opacity: 0.22 },
};

export function ParticleField({ state = "idle" }: { state?: ParticleFieldState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let animationFrame = 0;
    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;

    function resize() {
      if (!canvas) return;
      const parent = canvas.parentElement;
      width = parent?.clientWidth ?? window.innerWidth;
      height = parent?.clientHeight ?? window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);

      const config = STATE_CONFIG[stateRef.current];
      particlesRef.current = Array.from({ length: config.count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * config.speed,
        vy: (Math.random() - 0.5) * config.speed,
        radius: Math.random() * 1.4 + 0.4,
      }));
    }

    resize();
    window.addEventListener("resize", resize);

    function tick() {
      if (!ctx) return;
      const config = STATE_CONFIG[stateRef.current];
      ctx.clearRect(0, 0, width, height);

      const particles = particlesRef.current;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(23, 23, 28, ${config.opacity})`;
        ctx.fill();
      }

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < config.linkDistance) {
            const lineOpacity = (1 - dist / config.linkDistance) * config.opacity * 0.4;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(23, 23, 28, ${lineOpacity})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      animationFrame = requestAnimationFrame(tick);
    }

    tick();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-700"
    />
  );
}
