import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';
// All drawing runs in a dedicated worker thread via OffscreenCanvas so the
// rAF loop never competes with React on the main thread.

// ── Styled layers ─────────────────────────────────────────────────────────────
// z-index: 0 (not -1) — avoids stacking-context edge cases with fixed elements.
// Content wrapper sits at z-index: 1 above the entire background stack.

const Root = styled.div`
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  overflow: hidden;
`;

// Surface — the real background colour lives here, not in the canvas.
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

// Atmospheric glows sit above the base but *below* the grain canvases so the
// glow looks like it lives inside the surface rather than floating on top.
const GlowLayer = styled.div`
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 75% 50% at 22% 12%, oklch(0.376 0.129 295 / 6%) 0%, transparent 65%),
    radial-gradient(ellipse 55% 55% at 78% 88%, oklch(0.279 0.075 295 / 8%) 0%, transparent 70%);
`;

// Both canvas layers are fully transparent — they only perturb luminance
// above the CSS layers below them.
const LayerCanvas = styled.canvas`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
`;

// ── Component ─────────────────────────────────────────────────────────────────

interface GrainBackgroundProps {
  children: React.ReactNode;
}

const GrainBackground: React.FC<GrainBackgroundProps> = ({ children }) => {
  const grainRef  = useRef<HTMLCanvasElement>(null);
  const cloudRef  = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const grainCv = grainRef.current;
    const cloudCv = cloudRef.current;
    if (!grainCv || !cloudCv) return;

    const worker = new Worker(
      new URL('./grain.worker.ts', import.meta.url),
      { type: 'module' },
    );
    workerRef.current = worker;

    // Transfer canvas control to the worker — after this the main thread
    // can no longer touch grainCv/cloudCv directly.
    const grainOffscreen = grainCv.transferControlToOffscreen();
    const cloudOffscreen = cloudCv.transferControlToOffscreen();

    worker.postMessage(
      { type: 'init', grain: grainOffscreen, cloud: cloudOffscreen,
        width: window.innerWidth, height: window.innerHeight },
      [grainOffscreen, cloudOffscreen],
    );

    const resize = () => {
      worker.postMessage({ type: 'resize', width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  return (
    <>
      <Root>
        <BaseLayer />
        <GlowLayer />
        {/* Layer order: base → glow → coarse cloud → fine grain */}
        <LayerCanvas ref={cloudRef} />
        <LayerCanvas ref={grainRef} />
      </Root>
      {/* Content sits above the entire background stack */}
      <div style={{ position: 'relative' }}>
        {children}
      </div>
    </>
  );
};

export default GrainBackground;
