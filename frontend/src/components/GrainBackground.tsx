import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';

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

// ── Tuning constants ──────────────────────────────────────────────────────────

// Coarse atmospheric cloud — smooth, drifting, ~two bumps visible at once
const CLOUD_S     = 1000;  // tile size in px (seamlessly tileable after blur)
const CLOUD_FPS   = 8;    // very slow — feels atmospheric, not animated
const CLOUD_MAX_A = 1;    // max alpha per pixel (≈ 2% — barely-there luminance lift)

// Fine film grain — tiny, flickering, mostly neutral
const GRAIN_S     = 1000;   // tile size  (smaller = finer grain)
const GRAIN_FPS   = 20;   // fast enough to look organic, not harsh
const GRAIN_MAX_A = 7;   // max alpha per pixel (≈ 4.7%)
const GRAIN_DEN   = 0.38; // fraction of pixels that are lit
const PERSIST     = 0.22; // fraction of grain pixels kept from previous frame

// Near-white lavender — matches the purple base so grain has no colour cast
const GR = 230, GG = 225, GB = 248;

// ── Cloud tile builder ────────────────────────────────────────────────────────
// Generates a smooth, seamlessly-tileable noise texture by applying multiple
// passes of a wrap-around box blur over random values.  Runs once at init.

function buildCloudTile(): Uint8ClampedArray {
  const S = CLOUD_S;
  let src = new Float32Array(S * S);
  let dst = new Float32Array(S * S);
  for (let i = 0; i < src.length; i++) src[i] = Math.random();

  // 4 × separable box-blur with wrap-around → Gaussian-like & seamlessly tileable
  const r = 10;
  for (let pass = 0; pass < 4; pass++) {
    // Horizontal sweep
    for (let y = 0; y < S; y++) {
      let sum = 0;
      for (let dx = -r; dx <= r; dx++) sum += src[y * S + ((dx + S) % S)];
      for (let x = 0; x < S; x++) {
        dst[y * S + x] = sum / (2 * r + 1);
        sum -= src[y * S + ((x - r     + S) % S)];
        sum += src[y * S + ((x + r + 1    ) % S)];
      }
    }
    [src, dst] = [dst, src];
    // Vertical sweep
    for (let x = 0; x < S; x++) {
      let sum = 0;
      for (let dy = -r; dy <= r; dy++) sum += src[((dy + S) % S) * S + x];
      for (let y = 0; y < S; y++) {
        dst[y * S + x] = sum / (2 * r + 1);
        sum -= src[((y - r     + S) % S) * S + x];
        sum += src[((y + r + 1    ) % S) * S + x];
      }
    }
    [src, dst] = [dst, src];
  }

  // Normalise full range → richer cloud contrast
  let lo = Infinity, hi = -Infinity;
  for (const v of src) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const range = hi - lo || 1;

  const buf = new Uint8ClampedArray(new ArrayBuffer(S * S * 4));
  for (let i = 0; i < S * S; i++) {
    const t = (src[i] - lo) / range;
    buf[i * 4]     = GR;
    buf[i * 4 + 1] = GG;
    buf[i * 4 + 2] = GB;
    buf[i * 4 + 3] = Math.floor(t * CLOUD_MAX_A);
  }
  return buf;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface GrainBackgroundProps {
  children: React.ReactNode;
}

const GrainBackground: React.FC<GrainBackgroundProps> = ({ children }) => {
  const grainRef = useRef<HTMLCanvasElement>(null);
  const cloudRef = useRef<HTMLCanvasElement>(null);
  const rafRef   = useRef<number>(0);

  useEffect(() => {
    const grainCv = grainRef.current;
    const cloudCv = cloudRef.current;
    if (!grainCv || !cloudCv) return;

    const gc = grainCv.getContext('2d');
    const cc = cloudCv.getContext('2d');
    if (!gc || !cc) return;

    const resize = () => {
      grainCv.width  = cloudCv.width  = window.innerWidth;
      grainCv.height = cloudCv.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // ── Grain tile ────────────────────────────────────────────────────────────
    // Persistent RGBA buffer.  RGB is fixed (near-white lavender); only A
    // changes each frame.  A pre-created ImageData wraps the buffer in-place
    // so putImageData never allocates.

    const GTSQ    = GRAIN_S * GRAIN_S;
    const grainBuf = new Uint8ClampedArray(new ArrayBuffer(GTSQ * 4));
    for (let i = 0; i < GTSQ; i++) {
      grainBuf[i * 4]     = GR;
      grainBuf[i * 4 + 1] = GG;
      grainBuf[i * 4 + 2] = GB;
      grainBuf[i * 4 + 3] = Math.random() < GRAIN_DEN
        ? Math.floor(Math.random() * GRAIN_MAX_A) : 0;
    }

    const grainImgData  = new ImageData(grainBuf, GRAIN_S, GRAIN_S);
    const grainOffscreen = document.createElement('canvas');
    grainOffscreen.width = grainOffscreen.height = GRAIN_S;
    const gOff = grainOffscreen.getContext('2d')!;

    const drawGrain = () => {
      // Evolve: only (1 − PERSIST) fraction of pixels get new values
      for (let i = 0; i < GTSQ; i++) {
        if (Math.random() >= PERSIST) {
          grainBuf[i * 4 + 3] = Math.random() < GRAIN_DEN
            ? Math.floor(Math.random() * GRAIN_MAX_A) : 0;
        }
      }
      gOff.putImageData(grainImgData, 0, 0);

      const W = grainCv.width, H = grainCv.height;
      gc.clearRect(0, 0, W, H);
      for (let y = 0; y < H; y += GRAIN_S)
        for (let x = 0; x < W; x += GRAIN_S)
          gc.drawImage(grainOffscreen, x, y);
    };

    // ── Cloud tile ────────────────────────────────────────────────────────────
    // Pre-built seamless noise tile drifted by a sub-pixel offset each frame.
    // The tile never changes — only the draw position advances slowly.

    const cloudBuf = buildCloudTile();
    const cloudImgData  = new ImageData(cloudBuf, CLOUD_S, CLOUD_S);
    const cloudOffscreen = document.createElement('canvas');
    cloudOffscreen.width = cloudOffscreen.height = CLOUD_S;
    const cOff = cloudOffscreen.getContext('2d')!;
    cOff.putImageData(cloudImgData, 0, 0);

    let ox = 0, oy = 0; // drift accumulator (sub-pixel)

    const drawCloud = () => {
      ox = (ox + 0.38) % CLOUD_S; // ~0.38 px/frame → very slow crawl
      oy = (oy + 0.19) % CLOUD_S;
      const sx = Math.floor(ox), sy = Math.floor(oy);

      const W = cloudCv.width, H = cloudCv.height;
      cc.clearRect(0, 0, W, H);
      // Start at negative offset so the tile edge is never visible
      for (let y = -sy; y < H; y += CLOUD_S)
        for (let x = -sx; x < W; x += CLOUD_S)
          cc.drawImage(cloudOffscreen, x, y);
    };

    // ── Animation loop ────────────────────────────────────────────────────────

    let lastGrain = 0, lastCloud = 0;
    const gi = 1000 / GRAIN_FPS, ci = 1000 / CLOUD_FPS;

    drawGrain(); drawCloud(); // first paint before first rAF

    const loop = (ts: number) => {
      rafRef.current = requestAnimationFrame(loop);
      if (ts - lastGrain >= gi) { lastGrain = ts; drawGrain(); }
      if (ts - lastCloud >= ci) { lastCloud = ts; drawCloud(); }
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
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
