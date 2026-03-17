// grain.worker.ts
// Runs the grain + cloud canvas animation entirely off the main thread
// via OffscreenCanvas.  The main thread transfers canvas control once on
// mount and posts a 'resize' message whenever the viewport changes.

// ── Tuning constants (must match GrainBackground.tsx) ─────────────────────────
const CLOUD_S     = 1000;
const CLOUD_FPS   = 8;
const CLOUD_MAX_A = 1;

const GRAIN_S     = 1000;
const GRAIN_FPS   = 20;
const GRAIN_MAX_A = 7;
const GRAIN_DEN   = 0.38;
const PERSIST     = 0.22;

const GR = 230, GG = 225, GB = 248;
const GTSQ = GRAIN_S * GRAIN_S;

// ── Cloud tile builder ─────────────────────────────────────────────────────────
function buildCloudTile(): Uint8ClampedArray {
  const S = CLOUD_S;
  let src = new Float32Array(S * S);
  let dst = new Float32Array(S * S);
  for (let i = 0; i < src.length; i++) src[i] = Math.random();

  const r = 10;
  for (let pass = 0; pass < 4; pass++) {
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

// ── State ──────────────────────────────────────────────────────────────────────
let grainCanvas: OffscreenCanvas | null = null;
let cloudCanvas: OffscreenCanvas | null = null;
let grainCtx: OffscreenCanvasRenderingContext2D | null = null;
let cloudCtx: OffscreenCanvasRenderingContext2D | null = null;

let grainBuf: Uint8ClampedArray | null = null;
let grainImgData: ImageData | null = null;
let grainOffscreen: OffscreenCanvas | null = null;
let grainOffCtx: OffscreenCanvasRenderingContext2D | null = null;

let cloudOffscreen: OffscreenCanvas | null = null;
let cloudOffCtx: OffscreenCanvasRenderingContext2D | null = null;

let ox = 0, oy = 0;
let lastCloud = 0;
let intervalId: ReturnType<typeof setInterval> | null = null;

const gi = 1000 / GRAIN_FPS;
const ci = 1000 / CLOUD_FPS;

// ── Init helpers ───────────────────────────────────────────────────────────────
function initGrain() {
  grainBuf = new Uint8ClampedArray(new ArrayBuffer(GTSQ * 4));
  for (let i = 0; i < GTSQ; i++) {
    grainBuf[i * 4]     = GR;
    grainBuf[i * 4 + 1] = GG;
    grainBuf[i * 4 + 2] = GB;
    grainBuf[i * 4 + 3] = Math.random() < GRAIN_DEN
      ? Math.floor(Math.random() * GRAIN_MAX_A) : 0;
  }
  grainImgData = new ImageData(grainBuf, GRAIN_S, GRAIN_S);
  grainOffscreen = new OffscreenCanvas(GRAIN_S, GRAIN_S);
  grainOffCtx = grainOffscreen.getContext('2d');
}

function initCloud() {
  const cloudBuf = buildCloudTile();
  const cloudImgData = new ImageData(cloudBuf, CLOUD_S, CLOUD_S);
  cloudOffscreen = new OffscreenCanvas(CLOUD_S, CLOUD_S);
  cloudOffCtx = cloudOffscreen.getContext('2d');
  cloudOffCtx!.putImageData(cloudImgData, 0, 0);
}

// ── Draw functions ─────────────────────────────────────────────────────────────
function drawGrain() {
  if (!grainCtx || !grainBuf || !grainImgData || !grainOffCtx || !grainCanvas || !grainOffscreen) return;
  for (let i = 0; i < GTSQ; i++) {
    if (Math.random() >= PERSIST) {
      grainBuf[i * 4 + 3] = Math.random() < GRAIN_DEN
        ? Math.floor(Math.random() * GRAIN_MAX_A) : 0;
    }
  }
  grainOffCtx.putImageData(grainImgData, 0, 0);
  const W = grainCanvas.width, H = grainCanvas.height;
  grainCtx.clearRect(0, 0, W, H);
  for (let y = 0; y < H; y += GRAIN_S)
    for (let x = 0; x < W; x += GRAIN_S)
      grainCtx.drawImage(grainOffscreen, x, y);
}

function drawCloud() {
  if (!cloudCtx || !cloudOffscreen || !cloudCanvas) return;
  ox = (ox + 0.38) % CLOUD_S;
  oy = (oy + 0.19) % CLOUD_S;
  const sx = Math.floor(ox), sy = Math.floor(oy);
  const W = cloudCanvas.width, H = cloudCanvas.height;
  cloudCtx.clearRect(0, 0, W, H);
  for (let y = -sy; y < H; y += CLOUD_S)
    for (let x = -sx; x < W; x += CLOUD_S)
      cloudCtx.drawImage(cloudOffscreen, x, y);
}

// ── Message handler ────────────────────────────────────────────────────────────
self.onmessage = (e: MessageEvent) => {
  const { type } = e.data;

  if (type === 'init') {
    grainCanvas = e.data.grain as OffscreenCanvas;
    cloudCanvas = e.data.cloud as OffscreenCanvas;
    grainCanvas.width  = cloudCanvas.width  = e.data.width;
    grainCanvas.height = cloudCanvas.height = e.data.height;

    grainCtx = grainCanvas.getContext('2d');
    cloudCtx = cloudCanvas.getContext('2d');

    initGrain();
    initCloud();

    drawGrain();
    drawCloud();

    if (intervalId !== null) clearInterval(intervalId);
    intervalId = setInterval(() => {
      const now = performance.now();
      drawGrain();
      if (now - lastCloud >= ci) { lastCloud = now; drawCloud(); }
    }, gi);
  }

  if (type === 'resize') {
    if (grainCanvas) { grainCanvas.width = e.data.width; grainCanvas.height = e.data.height; }
    if (cloudCanvas) { cloudCanvas.width = e.data.width; cloudCanvas.height = e.data.height; }
    drawGrain();
    drawCloud();
  }
};
