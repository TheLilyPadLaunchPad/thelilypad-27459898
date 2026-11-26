import { useEffect, useRef } from 'react';
import frogAsset from '@/assets/waitroom-ascii-frog.png.asset.json';

/**
 * Animated hex-digit "ASCII art" backdrop for the wait room.
 * Colours come from the theme tokens, so it follows light and dark themes.
 */

const CELL = 12; // px per grid cell
const COVERAGE = 0.93; // share of cells drawn
const CONTRAST = 1.15;
const EDGE_EMPHASIS = 0.4;
const TINT_OPACITY = 0.45;
const FLICKER_DEPTH = 0.6;
const FRAME_MS = 70;
const HEX = '0123456789ABCDEF';

type Rgb = [number, number, number];

function readToken(name: string, fallback: Rgb): Rgb {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const parts = raw.split(/[\s,/]+/).map((part) => parseFloat(part));
  if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) return fallback;
  const [h, s, l] = [parts[0], parts[1] / 100, parts[2] / 100];
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return [channel(0), channel(8), channel(4)];
}

const overlay = (base: number, top: number) =>
  base < 128 ? (2 * base * top) / 255 : 255 - (2 * (255 - base) * (255 - top)) / 255;

/** Stable 0..1 value per cell, so the same cells stay empty between frames. */
const cellHash = (x: number, y: number) => {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

const rgba = (c: Rgb, alpha: number) => `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;

export function AsciiBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const glyphs = document.createElement('canvas');
    const glyphCtx = glyphs.getContext('2d')!;
    const fringe = document.createElement('canvas');
    const fringeCtx = fringe.getContext('2d')!;
    const sampler = document.createElement('canvas');
    const samplerCtx = sampler.getContext('2d', { willReadFrequently: true })!;
    const grainTile = document.createElement('canvas');

    let width = 0;
    let height = 0;
    let scale = 1;
    let cols = 0;
    let rows = 0;
    let colors: string[] = [];
    let alphas = new Float32Array(0);
    let flicker = new Float32Array(0);
    let chars = new Uint8Array(0);
    let subject = new Uint8Array(0);
    let ink: Rgb = [0, 0, 0];
    let grain: CanvasPattern | null = null;
    let frame = 0;
    let last = 0;
    let disposed = false;

    const image = new Image();
    image.crossOrigin = 'anonymous';

    const buildGrain = () => {
      grainTile.width = grainTile.height = 128;
      const g = grainTile.getContext('2d')!;
      const data = g.createImageData(128, 128);
      for (let i = 0; i < data.data.length; i += 4) {
        const on = Math.random() < 0.5;
        data.data[i] = ink[0];
        data.data[i + 1] = ink[1];
        data.data[i + 2] = ink[2];
        data.data[i + 3] = on ? Math.random() * 60 : 0;
      }
      g.putImageData(data, 0, 0);
      grain = ctx.createPattern(grainTile, 'repeat');
    };

    const rebuild = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      scale = Math.min(window.devicePixelRatio || 1, 1.5);
      for (const c of [canvas, glyphs, fringe]) {
        c.width = Math.round(width * scale);
        c.height = Math.round(height * scale);
      }
      cols = Math.ceil(width / CELL);
      rows = Math.ceil(height / CELL);
      const count = cols * rows;

      const background = readToken('--background', [247, 245, 240]);
      const primary = readToken('--primary', [46, 184, 138]);
      const tint = readToken('--ascii-tint', [0, 255, 102]);
      ink = readToken('--foreground', [27, 50, 42]);
      const darkTheme = background[0] + background[1] + background[2] < 384;
      buildGrain();

      // Sample the picture once per cell.
      sampler.width = cols;
      sampler.height = rows;
      samplerCtx.clearRect(0, 0, cols, rows);
      if (image.complete && image.naturalWidth) {
        const fit = Math.min((rows * 0.94) / image.naturalHeight, (cols * 0.9) / image.naturalWidth);
        const w = image.naturalWidth * fit;
        const h = image.naturalHeight * fit;
        samplerCtx.imageSmoothingQuality = 'high';
        samplerCtx.drawImage(image, (cols - w) / 2, (rows - h) / 2 + rows * 0.02, w, h);
      }
      let pixels: Uint8ClampedArray;
      try {
        pixels = samplerCtx.getImageData(0, 0, cols, rows).data;
      } catch {
        pixels = new Uint8ClampedArray(count * 4);
      }

      const lum = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const a = pixels[i * 4 + 3] / 255;
        const l = (0.299 * pixels[i * 4] + 0.587 * pixels[i * 4 + 1] + 0.114 * pixels[i * 4 + 2]) / 255;
        lum[i] = Math.max(0, Math.min(1, (l - 0.5) * CONTRAST + 0.5)) * a + (1 - a);
      }

      colors = new Array(count);
      alphas = new Float32Array(count);
      flicker = new Float32Array(count).fill(1);
      chars = new Uint8Array(count);
      subject = new Uint8Array(count);

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          const a = pixels[i * 4 + 3] / 255;
          const at = (dx: number, dy: number) =>
            lum[Math.max(0, Math.min(rows - 1, y + dy)) * cols + Math.max(0, Math.min(cols - 1, x + dx))];
          const gx = at(1, -1) + 2 * at(1, 0) + at(1, 1) - at(-1, -1) - 2 * at(-1, 0) - at(-1, 1);
          const gy = at(-1, 1) + 2 * at(0, 1) + at(1, 1) - at(-1, -1) - 2 * at(0, -1) - at(1, -1);
          const edge = Math.min(1, Math.hypot(gx, gy));

          if (cellHash(x, y) > COVERAGE) {
            alphas[i] = 0;
            colors[i] = '';
            continue;
          }

          if (a > 0.35) {
            const mix = (base: number, top: number) =>
              Math.round(base + (overlay(base, top) - base) * TINT_OPACITY);
            const c: Rgb = [
              mix(pixels[i * 4], tint[0]),
              mix(pixels[i * 4 + 1], tint[1]),
              mix(pixels[i * 4 + 2], tint[2]),
            ];
            const weight = darkTheme ? lum[i] : 1 - lum[i];
            colors[i] = `rgb(${c[0]},${c[1]},${c[2]})`;
            alphas[i] = Math.min(1, 0.5 + 0.3 * weight + EDGE_EMPHASIS * edge);
            subject[i] = 1;
            chars[i] = Math.min(15, Math.floor((1 - lum[i]) * 16));
          } else {
            colors[i] = `rgb(${primary[0]},${primary[1]},${primary[2]})`;
            alphas[i] = 0.16 + EDGE_EMPHASIS * edge * 0.6;
            chars[i] = Math.floor(Math.random() * 16);
          }
        }
      }
    };

    const draw = (animate: boolean) => {
      const count = cols * rows;
      glyphCtx.setTransform(scale, 0, 0, scale, 0, 0);
      glyphCtx.clearRect(0, 0, width, height);
      glyphCtx.font = `700 ${CELL - 1}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      glyphCtx.textAlign = 'center';
      glyphCtx.textBaseline = 'middle';

      for (let i = 0; i < count; i++) {
        if (!alphas[i]) continue;
        if (animate) {
          if (Math.random() < 0.09) flicker[i] = 1 - Math.random() * FLICKER_DEPTH;
          else flicker[i] += (1 - flicker[i]) * 0.25;
          if (Math.random() < (subject[i] ? 0.02 : 0.05)) chars[i] = Math.floor(Math.random() * 16);
        }
        glyphCtx.globalAlpha = alphas[i] * flicker[i];
        glyphCtx.fillStyle = colors[i];
        glyphCtx.fillText(HEX[chars[i]], (i % cols) * CELL + CELL / 2, Math.floor(i / cols) * CELL + CELL / 2);
      }
      glyphCtx.globalAlpha = 1;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;

      // Chromatic fringe: red and blue copies nudged sideways.
      const shift = 1.6 * scale;
      for (const [color, dx] of [['rgb(255,40,80)', -shift], ['rgb(40,120,255)', shift]] as const) {
        fringeCtx.globalCompositeOperation = 'source-over';
        fringeCtx.clearRect(0, 0, fringe.width, fringe.height);
        fringeCtx.drawImage(glyphs, 0, 0);
        fringeCtx.globalCompositeOperation = 'source-in';
        fringeCtx.fillStyle = color;
        fringeCtx.fillRect(0, 0, fringe.width, fringe.height);
        ctx.globalAlpha = 0.28;
        ctx.drawImage(fringe, dx, 0);
      }

      // Bloom: a soft, enlarged copy under the sharp glyphs.
      fringeCtx.globalCompositeOperation = 'source-over';
      fringeCtx.clearRect(0, 0, fringe.width, fringe.height);
      const bw = Math.ceil(canvas.width / 6);
      const bh = Math.ceil(canvas.height / 6);
      fringeCtx.drawImage(glyphs, 0, 0, bw, bh);
      ctx.globalAlpha = 0.45;
      ctx.drawImage(fringe, 0, 0, bw, bh, 0, 0, canvas.width, canvas.height);

      ctx.globalAlpha = 1;
      ctx.drawImage(glyphs, 0, 0);

      // Glitch: now and then a few bands slip sideways.
      if (animate && Math.random() < 0.07) {
        const bands = 1 + Math.floor(Math.random() * 3);
        for (let b = 0; b < bands; b++) {
          const y = Math.floor(Math.random() * canvas.height);
          const h = Math.floor((6 + Math.random() * 26) * scale);
          const dx = Math.round((Math.random() - 0.5) * 36 * scale);
          ctx.drawImage(canvas, 0, y, canvas.width, h, dx, y, canvas.width, h);
        }
      }

      ctx.setTransform(scale, 0, 0, scale, 0, 0);

      // Scan lines.
      ctx.fillStyle = rgba(ink, 0.07);
      for (let y = 0; y < height; y += 3) ctx.fillRect(0, y, width, 1);

      // Film grain.
      if (grain) {
        const ox = Math.floor(Math.random() * 128);
        const oy = Math.floor(Math.random() * 128);
        ctx.save();
        ctx.translate(-ox, -oy);
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = grain;
        ctx.fillRect(0, 0, width + 128, height + 128);
        ctx.restore();
      }

      // Vignette.
      const radius = Math.hypot(width, height) / 2;
      const vignette = ctx.createRadialGradient(width / 2, height / 2, radius * 0.45, width / 2, height / 2, radius);
      vignette.addColorStop(0, rgba(ink, 0));
      vignette.addColorStop(1, rgba(ink, 0.19));
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
    };

    const tick = (now: number) => {
      if (disposed) return;
      frame = requestAnimationFrame(tick);
      if (document.hidden || now - last < FRAME_MS) return;
      last = now;
      draw(true);
    };

    const start = () => {
      if (disposed) return;
      rebuild();
      draw(false);
      cancelAnimationFrame(frame);
      if (!reducedMotion) frame = requestAnimationFrame(tick);
    };

    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(start, 150);
    };

    image.onload = start;
    image.onerror = start;
    image.src = frogAsset.url;
    start();
    window.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
    />
  );
}
