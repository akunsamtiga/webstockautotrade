'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useDarkMode } from '@/lib/DarkModeContext';

interface ChartCardProps {
  assetSymbol?: string;
  height?: number;
}

interface PricePoint {
  time: number;
  price: number;
}

const generateRealisticPrice = (prev: number, vol = 0.0003) => {
  const drift = (Math.random() - 0.48) * vol;
  const shock = (Math.random() - 0.5) * vol * 2;
  return prev + prev * (drift + shock);
};

/**
 * Catmull-Rom → cubic Bézier (centripetal, α=0.5)
 * Produces perfectly smooth curves through every data point.
 */
function catmullToBezier(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
) {
  const alpha = 0.5;
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2) || 1e-4;
  const t01 = dist(p0, p1) ** alpha;
  const t12 = dist(p1, p2) ** alpha;
  const t23 = dist(p2, p3) ** alpha;
  const m1x = p2.x - p1.x + t12 * ((p1.x - p0.x) / t01 - (p2.x - p0.x) / (t01 + t12));
  const m1y = p2.y - p1.y + t12 * ((p1.y - p0.y) / t01 - (p2.y - p0.y) / (t01 + t12));
  const m2x = p2.x - p1.x + t12 * ((p3.x - p2.x) / t23 - (p3.x - p1.x) / (t12 + t23));
  const m2y = p2.y - p1.y + t12 * ((p3.y - p2.y) / t23 - (p3.y - p1.y) / (t12 + t23));
  return {
    cp1x: p1.x + m1x / 3,
    cp1y: p1.y + m1y / 3,
    cp2x: p2.x - m2x / 3,
    cp2y: p2.y - m2y / 3,
  };
}

function drawCatmullPath(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  if (pts.length < 2) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const { cp1x, cp1y, cp2x, cp2y } = catmullToBezier(p0, p1, p2, p3);
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
}

export const ChartCard: React.FC<ChartCardProps> = ({ assetSymbol, height = 400 }) => {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>(0);

  // All chart state in refs — zero React re-renders from data ticks
  const dataRef          = useRef<PricePoint[]>([]);
  const prevPriceRef     = useRef<number>(0);
  const targetPriceRef   = useRef<number>(0);
  const baselinePriceRef = useRef<number>(0);
  const priceChangeRef   = useRef<number>(0);
  const lastUpdateRef    = useRef<number>(performance.now());
  const initializedRef   = useRef<boolean>(false);
  const isDarkRef        = useRef<boolean>(true);
  const deviceRef        = useRef<'mobile' | 'tablet' | 'desktop'>('desktop');

  const [deviceType, setDeviceType] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  const { isDarkMode } = useDarkMode();

  useEffect(() => { isDarkRef.current = isDarkMode; }, [isDarkMode]);
  useEffect(() => { deviceRef.current = deviceType; }, [deviceType]);

  // Screen-size detector
  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      setDeviceType(w < 640 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop');
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Init data once
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const now = Date.now();
    let price = 45000 + Math.random() * 5000;
    const pts: PricePoint[] = [];
    for (let i = 80; i >= 0; i--) {
      price = generateRealisticPrice(price, 0.0005);
      pts.push({ time: now - i * 1000, price });
    }
    dataRef.current        = pts;
    baselinePriceRef.current = pts[0].price;
    prevPriceRef.current   = price;
    targetPriceRef.current = price;
    lastUpdateRef.current  = performance.now();
  }, []);

  // Data tick — updates refs only, never triggers React re-render
  useEffect(() => {
    const id = setInterval(() => {
      const pts = dataRef.current;
      if (!pts.length) return;
      const last     = pts[pts.length - 1];
      const newPrice = generateRealisticPrice(last.price, 0.0003);
      const next     = [...pts, { time: Date.now(), price: newPrice }];
      if (next.length > 120) next.shift();
      dataRef.current        = next;
      prevPriceRef.current   = last.price;
      targetPriceRef.current = newPrice;
      priceChangeRef.current = ((newPrice - baselinePriceRef.current) / baselinePriceRef.current) * 100;
      lastUpdateRef.current  = performance.now();
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ─── Draw (called every frame) ─────────────────────────────────────────────
  const draw = (ts: number) => {
    const canvas = canvasRef.current;
    const pts    = dataRef.current;
    if (!canvas || pts.length < 4) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr   = window.devicePixelRatio || 1;
    const W     = canvas.width  / dpr;
    const H     = canvas.height / dpr;
    const dark  = isDarkRef.current;
    const dev   = deviceRef.current;
    const isMob = dev === 'mobile';
    const isPos = priceChangeRef.current >= 0;

    const accentRGB = isPos ? '16,185,129' : '239,68,68';
    const lineCol   = isPos ? '#10B981' : '#EF4444';
    const bg        = dark ? '#161616' : '#F8F9FA';

    // Padding layout
    // Mobile: r=48 for price badge, b=18 for time labels, t=20 for % pill
    const P = isMob
      ? { l: 6,  r: 48, t: 10, b: 18 }
      : dev === 'tablet'
      ? { l: 54, r: 14, t: 12, b: 28 }
      : { l: 64, r: 78, t: 14, b: 32 };

    const CW = W - P.l - P.r;
    const CH = H - P.t - P.b;
    if (CW <= 0 || CH <= 0) return;

    // ── Smooth interpolation of live price ──────────────────────────────────
    // ease-out cubic over 1 000 ms — chart glides to next price continuously
    const elapsed   = Math.min((ts - lastUpdateRef.current) / 1000, 1);
    const eased     = 1 - (1 - elapsed) ** 3;
    const livePrice = prevPriceRef.current + (targetPriceRef.current - prevPriceRef.current) * eased;

    const visible = pts.slice(-60);
    const display = [
      ...visible.slice(0, -1),
      { ...visible[visible.length - 1], price: livePrice },
    ];

    // Price scale with comfortable padding
    const prices = display.map(p => p.price);
    const minP   = Math.min(...prices);
    const maxP   = Math.max(...prices);
    const range  = maxP - minP || 1;
    const yPad   = range * 0.22;
    const yMin   = minP - yPad;
    const yMax   = maxP + yPad;
    const yRange = yMax - yMin;

    const gx    = (i: number) => P.l + (i / (display.length - 1)) * CW;
    const gy    = (p: number) => P.t + CH - ((p - yMin) / yRange) * CH;
    const pts2d = display.map((p, i) => ({ x: gx(i), y: gy(p.price) }));

    // ── Background ───────────────────────────────────────────────────────────
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // ── Grid ─────────────────────────────────────────────────────────────────
    const gridRows    = isMob ? 3 : 4;
    const gridCols    = isMob ? 4 : 4;   // vertical lines on mobile too
    const gridRowsSub = isMob ? 0 : 1;   // minor horizontal sub-divisions (desktop only)

    ctx.save();

    // ── Border / frame around chart area ────────────────────────────────────
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.18)';
    ctx.lineWidth   = 0.7;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.rect(P.l, P.t, CW, CH);
    ctx.stroke();

    // ── Minor horizontal lines (between major rows, desktop only) ───────────
    if (gridRowsSub > 0) {
      ctx.strokeStyle = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
      ctx.lineWidth   = 0.5;
      ctx.setLineDash([2, 8]);
      for (let i = 0; i < gridRows; i++) {
        for (let s = 1; s <= gridRowsSub; s++) {
          const y = P.t + (CH / gridRows) * i + (CH / gridRows / (gridRowsSub + 1)) * s;
          ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(P.l + CW, y); ctx.stroke();
        }
      }
    }

    // ── Major horizontal lines ────────────────────────────────────────────────
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.13)' : 'rgba(0,0,0,0.13)';
    ctx.lineWidth   = 0.6;
    ctx.setLineDash([4, 6]);
    for (let i = 1; i < gridRows; i++) {
      const y = P.t + (CH / gridRows) * i;
      ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(P.l + CW, y); ctx.stroke();
    }

    // ── Vertical lines ────────────────────────────────────────────────────────
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.10)';
    ctx.lineWidth   = 0.5;
    ctx.setLineDash([3, 7]);
    for (let i = 1; i < gridCols; i++) {
      const x = P.l + (CW / gridCols) * i;
      ctx.beginPath(); ctx.moveTo(x, P.t); ctx.lineTo(x, P.t + CH); ctx.stroke();
    }

    // ── Tick marks on left axis (Y) ───────────────────────────────────────────
    ctx.setLineDash([]);
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)';
    ctx.lineWidth   = 0.8;
    for (let i = 0; i <= gridRows; i++) {
      const y     = P.t + (CH / gridRows) * i;
      const tickW = isMob ? 4 : 5;
      ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(P.l + tickW, y); ctx.stroke();
    }

    // ── Tick marks on bottom axis (X) ────────────────────────────────────────
    for (let i = 0; i <= gridCols; i++) {
      const x     = P.l + (CW / gridCols) * i;
      const tickH = isMob ? 4 : 5;
      ctx.beginPath(); ctx.moveTo(x, P.t + CH); ctx.lineTo(x, P.t + CH + tickH); ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.restore();

    // ── Axis labels ──────────────────────────────────────────────────────────
    if (isMob) {
      // ── Mobile: Y-axis price labels (right side, 3 levels) ──────────────
      ctx.save();
      ctx.font         = `500 7px 'SF Mono','Menlo',ui-monospace,monospace`;
      ctx.fillStyle    = dark ? 'rgba(186,193,203,0.45)' : 'rgba(107,114,128,0.65)';
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'middle';
      const labelX = W - P.r + 4;
      for (let i = 0; i <= gridRows; i++) {
        const p = yMax - (yRange / gridRows) * i;
        const y = P.t + (CH / gridRows) * i;
        // Skip label if too close to live dot (will be covered by badge)
        const lyCurrent = pts2d[pts2d.length - 1].y;
        if (Math.abs(y - lyCurrent) < 11) continue;
        ctx.fillText(`${Math.round(p / 1000)}k`, labelX, y);
      }
      ctx.restore();

      // ── Mobile: time labels at each vertical grid line ──────────────────
      ctx.save();
      ctx.font         = `500 7px 'SF Mono','Menlo',ui-monospace,monospace`;
      ctx.textBaseline = 'bottom';
      const timeY = H - 2;
      for (let i = 0; i <= gridCols; i++) {
        const x   = P.l + (CW / gridCols) * i;
        const idx = Math.floor((i / gridCols) * (display.length - 1));
        const d   = new Date(display[idx].time);
        const lbl = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        if (i === gridCols) {
          // Last tick = "NOW" in accent color, right-aligned
          ctx.fillStyle = `rgba(${accentRGB},0.60)`;
          ctx.textAlign = 'right';
          ctx.fillText('NOW', x, timeY);
        } else if (i === 0) {
          ctx.fillStyle = dark ? 'rgba(186,193,203,0.38)' : 'rgba(107,114,128,0.55)';
          ctx.textAlign = 'left';
          ctx.fillText(lbl, x, timeY);
        } else {
          ctx.fillStyle = dark ? 'rgba(186,193,203,0.32)' : 'rgba(107,114,128,0.45)';
          ctx.textAlign = 'center';
          ctx.fillText(lbl, x, timeY);
        }
      }
      ctx.restore();
    } else if (!isMob) {
      ctx.save();
      ctx.font         = `500 8.5px 'SF Mono','Menlo',ui-monospace,monospace`;
      ctx.fillStyle    = dark ? 'rgba(186,193,203,0.52)' : 'rgba(107,114,128,0.72)';
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'middle';
      for (let i = 0; i <= gridRows; i++) {
        const p = yMax - (yRange / gridRows) * i;
        const y = P.t + (CH / gridRows) * i;
        ctx.fillText(`$${Math.round(p).toLocaleString()}`, P.l - 6, y);
      }
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      for (let i = 0; i <= gridCols; i++) {
        const idx = Math.floor((i / gridCols) * (display.length - 1));
        const d   = new Date(display[idx].time);
        const lbl = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        ctx.fillText(lbl, P.l + (CW / gridCols) * i, H - P.b + 5);
      }
      ctx.restore();
    }

    // ── Area fill ────────────────────────────────────────────────────────────
    const areaGrad = ctx.createLinearGradient(0, P.t, 0, H - P.b);
    areaGrad.addColorStop(0,    `rgba(${accentRGB},0.20)`);
    areaGrad.addColorStop(0.5,  `rgba(${accentRGB},0.07)`);
    areaGrad.addColorStop(1,    `rgba(${accentRGB},0.00)`);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts2d[0].x, H - P.b);
    ctx.lineTo(pts2d[0].x, pts2d[0].y);
    drawCatmullPath(ctx, pts2d);
    ctx.lineTo(pts2d[pts2d.length - 1].x, H - P.b);
    ctx.closePath();
    ctx.fillStyle = areaGrad;
    ctx.fill();
    ctx.restore();

    // ── Glow pass (wide soft halo) ───────────────────────────────────────────
    ctx.save();
    ctx.shadowColor = lineCol;
    ctx.shadowBlur  = isMob ? 6 : 16;
    ctx.strokeStyle = `rgba(${accentRGB},0.25)`;
    ctx.lineWidth   = isMob ? 5 : 9;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); drawCatmullPath(ctx, pts2d); ctx.stroke();
    ctx.restore();

    // ── Main line ─────────────────────────────────────────────────────────────
    ctx.save();
    ctx.shadowColor = lineCol;
    ctx.shadowBlur  = isMob ? 3 : 8;
    ctx.strokeStyle = lineCol;
    ctx.lineWidth   = isMob ? 1.5 : 2;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); drawCatmullPath(ctx, pts2d); ctx.stroke();
    ctx.restore();

    // ── Dashed price-level line ───────────────────────────────────────────────
    const lx = pts2d[pts2d.length - 1].x;
    const ly = pts2d[pts2d.length - 1].y;
    ctx.save();
    ctx.strokeStyle = `rgba(${accentRGB},${dark ? '0.18' : '0.26'})`;
    ctx.lineWidth   = 0.6;
    ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(P.l, ly); ctx.lineTo(W - P.r, ly); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // ── Animated live dot ────────────────────────────────────────────────────
    const pulseT = (ts % 2200) / 2200;
    const pulseR = (isMob ? 4 : 6) + pulseT * 10;
    const pulseA = (1 - pulseT) * 0.32;
    ctx.save();
    // Expanding ring
    ctx.beginPath();
    ctx.arc(lx, ly, pulseR, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${accentRGB},${pulseA.toFixed(3)})`;
    ctx.fill();
    // Soft halo
    ctx.beginPath();
    ctx.arc(lx, ly, isMob ? 5.5 : 7.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${accentRGB},0.16)`;
    ctx.fill();
    // Solid dot
    ctx.beginPath();
    ctx.arc(lx, ly, isMob ? 3 : 4, 0, Math.PI * 2);
    ctx.fillStyle   = lineCol;
    ctx.shadowColor = lineCol;
    ctx.shadowBlur  = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
    // White centre
    ctx.beginPath();
    ctx.arc(lx, ly, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.restore();

    // ── Price badge (right-side) — desktop full badge, mobile compact ────────
    {
      if (isMob) {
        // Compact badge inside right padding, drawn on top of live dot
        const priceStrM = `${Math.round(livePrice / 1000)}k`;
        ctx.save();
        ctx.font      = `700 8px 'SF Mono','Menlo',ui-monospace,monospace`;
        const twM     = ctx.measureText(priceStrM).width;
        const bwM     = twM + 9;
        const bhM     = 15;
        const bxM     = W - P.r + 3;
        const rawByM  = ly - bhM / 2;
        const byM     = Math.max(P.t, Math.min(H - P.b - bhM, rawByM));
        // Connector dashed tick
        ctx.strokeStyle  = `rgba(${accentRGB},0.35)`;
        ctx.lineWidth    = 0.5;
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(bxM - 1, byM + bhM / 2);
        ctx.stroke();
        ctx.setLineDash([]);
        // Badge fill + border
        ctx.fillStyle    = isPos ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.18)';
        ctx.strokeStyle  = `rgba(${accentRGB},0.60)`;
        ctx.lineWidth    = 0.7;
        ctx.shadowColor  = lineCol;
        ctx.shadowBlur   = 5;
        ctx.beginPath(); ctx.roundRect(bxM, byM, bwM, bhM, 4); ctx.fill(); ctx.stroke();
        ctx.shadowBlur   = 0;
        ctx.fillStyle    = lineCol;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(priceStrM, bxM + bwM / 2, byM + bhM / 2);
        ctx.restore();
      } else {
        // Full desktop badge
        const priceStr = `$${Math.round(livePrice).toLocaleString()}`;
        ctx.save();
        ctx.font = `700 9.5px 'SF Mono','Menlo',ui-monospace,monospace`;
        const tw = ctx.measureText(priceStr).width;
        const bw = tw + 16;
        const bh = 19;
        const bx = W - P.r + 8;
        const rawBy = ly - bh / 2;
        const by = Math.max(P.t, Math.min(H - P.b - bh, rawBy));
        // Connector
        ctx.strokeStyle = `rgba(${accentRGB},0.30)`;
        ctx.lineWidth   = 0.5;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(lx + 5, ly);
        ctx.lineTo(bx, by + bh / 2);
        ctx.stroke();
        ctx.setLineDash([]);
        // Badge
        ctx.fillStyle   = isPos ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)';
        ctx.strokeStyle = `rgba(${accentRGB},0.55)`;
        ctx.lineWidth   = 0.8;
        ctx.shadowColor = lineCol;
        ctx.shadowBlur  = 6;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 5);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle    = lineCol;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(priceStr, bx + bw / 2, by + bh / 2);
        ctx.restore();
      }
    }
  };

  // ─── Animation loop ────────────────────────────────────────────────────────
  useEffect(() => {
    const loop = (ts: number) => {
      draw(ts);
      animationRef.current = requestAnimationFrame(loop);
    };
    animationRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceType, isDarkMode]);

  // ─── ResizeObserver (resets ctx transform to avoid scale accumulation) ─────
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const updateSize = (entries?: ResizeObserverEntry[]) => {
      const canvas     = canvasRef.current;
      const container  = containerRef.current;
      if (!canvas || !container) return;
      const dpr = window.devicePixelRatio || 1;
      const entry = entries?.[0];
      const W = entry ? entry.contentRect.width  : container.getBoundingClientRect().width;
      const H = entry ? entry.contentRect.height : container.getBoundingClientRect().height;
      if (W <= 0 || H <= 0) return;
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width  = W + 'px';
      canvas.style.height = H + 'px';
      const ctx = canvas.getContext('2d');
      if (ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr); }
    };
    const ro = new ResizeObserver(e => updateSize(e));
    ro.observe(containerRef.current);
    const tid = setTimeout(() => updateSize(), 50);
    return () => { ro.disconnect(); clearTimeout(tid); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, deviceType]);

  const bg = isDarkMode ? '#161616' : '#F8F9FA';

  // Mobile: absolute fill (parent must be position:relative) — reliable across all browsers.
  // Tablet/Desktop: keep width/height:100% with explicit minHeight fallback.
  const isMob = deviceType === 'mobile';
  const containerStyle: React.CSSProperties = isMob
    ? {
        background: bg,
        borderRadius: 10,
        overflow: 'hidden',
        position: 'absolute',
        inset: 0,
        transition: 'background 0.3s',
        border: isDarkMode
          ? '1px solid rgba(125,211,252,0.40)'
          : '1px solid #9CA3AF',
      }
    : {
        background: bg,
        borderRadius: 10,
        overflow: 'hidden',
        width: '100%',
        height: '100%',
        minHeight: deviceType === 'tablet' ? 300 : height,
        position: 'relative',
        transition: 'background 0.3s',
        border: isDarkMode
          ? '1px solid rgba(125,211,252,0.40)'
          : '1px solid #9CA3AF',
      };

  return (
    <div
      ref={containerRef}
      style={containerStyle}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', touchAction: 'none', width: '100%', height: '100%' }}
      />
    </div>
  );
};