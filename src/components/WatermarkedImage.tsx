'use client';

import { useEffect, useRef, useState } from 'react';

export interface WatermarkedImageProps {
  src: string;
  alt: string;
  className?: string;
  fit?: 'cover' | 'contain';
  fitBackground?: 'white' | 'ink';
}

const WATERMARK_TEXT = '© Glassart & Design';

const FIT_BACKGROUND_COLORS: Record<'white' | 'ink', string> = {
  white: '#ffffff',
  ink: '#060607',
};

export function WatermarkedImage({ src, alt, className, fit = 'cover', fitBackground = 'white' }: WatermarkedImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasReady, setCanvasReady] = useState(false);

  useEffect(() => {
    setCanvasReady(false);
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      // No canvas support: keep showing the <img> + CSS overlay fallback below.
      return;
    }

    let cancelled = false;

    function draw(image: HTMLImageElement) {
      if (cancelled || !container) return;
      const { width, height } = container.getBoundingClientRect();
      const w = Math.max(width, 1);
      const h = Math.max(height, 1);
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (fit === 'contain') {
        ctx!.fillStyle = FIT_BACKGROUND_COLORS[fitBackground];
        ctx!.fillRect(0, 0, w, h);
      }

      const scale =
        fit === 'contain'
          ? Math.min(w / image.naturalWidth, h / image.naturalHeight) || 1
          : Math.max(w / image.naturalWidth, h / image.naturalHeight) || 1;
      const drawWidth = image.naturalWidth * scale;
      const drawHeight = image.naturalHeight * scale;
      ctx!.drawImage(image, (w - drawWidth) / 2, (h - drawHeight) / 2, drawWidth, drawHeight);

      ctx!.save();
      ctx!.translate(w / 2, h / 2);
      ctx!.rotate((-30 * Math.PI) / 180);
      ctx!.font = '700 11px Montserrat, sans-serif';
      ctx!.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx!.textAlign = 'center';
      ctx!.textBaseline = 'middle';
      const tileW = Math.max(w, h) * 0.5;
      const tileH = tileW * 0.55;
      const cols = Math.ceil((w * 1.8) / tileW) || 1;
      const rows = Math.ceil((h * 1.8) / tileH) || 1;
      for (let r = -rows; r <= rows; r++) {
        for (let c = -cols; c <= cols; c++) {
          ctx!.fillText(WATERMARK_TEXT, c * tileW, r * tileH);
        }
      }
      ctx!.restore();

      setCanvasReady(true);
    }

    const image = new window.Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => draw(image);
    image.onerror = () => setCanvasReady(false);
    image.src = src;

    let resizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        if (image.complete && image.naturalWidth > 0) {
          draw(image);
        }
      });
      resizeObserver.observe(container);
    }

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
    };
  }, [src, fit, fitBackground]);

  return (
    <div ref={containerRef} data-testid="watermarked-image" className={`relative overflow-hidden ${className ?? ''}`}>
      <canvas
        ref={canvasRef}
        data-testid="watermark-canvas"
        role={canvasReady ? 'img' : undefined}
        aria-label={canvasReady ? alt : undefined}
        aria-hidden={canvasReady ? undefined : 'true'}
        className={`h-full w-full ${canvasReady ? '' : 'hidden'}`}
      />
      {!canvasReady && (
        <>
          <img src={src} alt={alt} className={`h-full w-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`} />
          <div
            data-testid="watermark-overlay"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex select-none flex-wrap content-center justify-center gap-4 overflow-hidden text-[0.65rem] font-head uppercase tracking-widest text-white/40 [transform:rotate(-30deg)_scale(1.4)]"
          >
            {Array.from({ length: 12 }).map((_, index) => (
              <span key={index}>{WATERMARK_TEXT}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
