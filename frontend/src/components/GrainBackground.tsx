import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';

// ── Layer components ──────────────────────────────────────────────────────────

const Root = styled.div`
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  overflow: hidden;
`;

// Very dark plum-black — noticeably darker than before
const BaseLayer = styled.div`
  position: absolute;
  inset: 0;
  background: linear-gradient(
    170deg,
    oklch(0.13 0.034 295) 0%,
    oklch(0.10 0.022 295) 50%,
    oklch(0.08 0.014 295) 100%
  );
`;

// Subtle atmospheric glows — kept dim so content stays legible
const GlowLayer = styled.div`
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 75% 50% at 22% 12%, oklch(0.376 0.129 295 / 6%) 0%, transparent 65%),
    radial-gradient(ellipse 55% 55% at 78% 88%, oklch(0.279 0.075 295 / 8%) 0%, transparent 70%);
`;

// Canvas fills the viewport — drawn at half resolution then upscaled
// for a coarser pixel look and 4× perf gain
const StaticCanvas = styled.canvas`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
`;

// ── Trichrome palette ─────────────────────────────────────────────────────────
// Three tones — static flips each pixel among them every frame.

const DARK: [number, number, number] = [9,  8, 18];   // near-black teal-purple
const MID:  [number, number, number] = [10, 9, 18];   // dark purple
const LITE: [number, number, number] = [12, 11, 20];   // medium purple highlight
// Thresholds: 0–0.15 → LITE, 0.15–0.35 → MID, 0.35–1 → DARK
const T1 = 0.15;
const T2 = 0.35;

const STATIC_FPS = 12; // ~14 flickers/s — film-static feel, not smooth

// ── Public component ──────────────────────────────────────────────────────────

interface GrainBackgroundProps {
  children: React.ReactNode;
}

const GrainBackground: React.FC<GrainBackgroundProps> = ({ children }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1:1 resolution for fine single-pixel static
    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const interval = 1000 / STATIC_FPS;
    let lastTime = 0;

    const draw = (ts: number) => {
      animRef.current = requestAnimationFrame(draw);
      if (ts - lastTime < interval) return;
      lastTime = ts;

      const w = canvas.width;
      const h = canvas.height;
      const img = ctx.createImageData(w, h);
      const d   = img.data;

      for (let i = 0; i < d.length; i += 4) {
        const r = Math.random();
        const c = r < T1 ? LITE : r < T2 ? MID : DARK;
        d[i]     = c[0];
        d[i + 1] = c[1];
        d[i + 2] = c[2];
        d[i + 3] = 255;
      }

      ctx.putImageData(img, 0, 0);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <>
      <Root>
        <BaseLayer />
        <StaticCanvas ref={canvasRef} />
        <GlowLayer />
      </Root>

      {/* Content sits in normal flow, above the fixed background */}
      <div style={{ position: 'relative' }}>
        {children}
      </div>
    </>
  );
};

export default GrainBackground;
