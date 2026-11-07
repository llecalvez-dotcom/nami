"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { geoContains, geoOrthographic, geoPath } from "d3-geo";
import {
  countries,
  drawGlobe,
  landDots,
  rotate,
  slerp,
  toVec,
  type CountryFeature,
  type Dot,
  type Vec3,
} from "./route-globe-utils/globe";
import "./route-globe.css";

/**
 * Route Globe
 * A dotted globe with flight arcs from one hub. Each route lifts off the surface on a great
 * circle; a comet runs along it and the destination pulses when it lands. Drag to spin; it
 * turns slowly on its own when left alone. Countries listed in `regions` are painted in their
 * colour and can be clicked.
 */

export type Place = { name: string; lon: number; lat: number; note?: string };
export type Region = { color: string; label?: string };

export type GlobeTheme = {
  ground: string;
  land: string;
  arc: string;
  glow: string;
  text: string;
  muted: string;
};

type Props = {
  hub?: Place;
  places?: Place[];
  regions?: Record<string, Region>;
  onSelectCountry?: (iso2: string) => void;
  theme?: GlobeTheme;
  motion?: "full" | "reduced";
  className?: string;
  style?: CSSProperties;
};

const PARIS: Place = { name: "Paris", lon: 2.35, lat: 48.86 };

const NIGHT: GlobeTheme = {
  ground: "#06080d",
  land: "#9fb4d6",
  arc: "#ffb547",
  glow: "rgb(90 140 255 / 0.18)",
  text: "#eef2fb",
  muted: "#7c8aa5",
};

const RAD = Math.PI / 180;
const dotsCache = new Map<number, Dot[]>();

function dotsFor(count: number): Dot[] {
  let dots = dotsCache.get(count);
  if (!dots) {
    dots = landDots(count);
    dotsCache.set(count, dots);
  }
  return dots;
}

type Tip = { x: number; y: number; title: string; note?: string };

export function RouteGlobe({
  hub = PARIS,
  places = [],
  regions = {},
  onSelectCountry,
  theme = NIGHT,
  motion = "full",
  className = "",
  style,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ hub, places, regions, onSelectCountry });
  const redraw = useRef<() => void>(() => {});
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    live.current = { hub, places, regions, onSelectCountry };
    redraw.current();
  }, [hub, places, regions, onSelectCountry]);

  useEffect(() => {
    const el = host.current,
      cv = canvas.current;
    if (!el || !cv) return;
    const ctx = cv.getContext("2d")!;
    const reduced = motion === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dots = dotsFor(window.innerWidth < 640 ? 18000 : 30000);
    const world = countries();
    const start0 = live.current.hub;
    const st = {
      yaw: start0.lon * RAD + 0.6,
      tilt: 18 * RAD,
      vy: 0,
      vt: 0,
      drag: false,
      moved: 0,
      px: 0,
      py: 0,
      last: 0,
      idle: 0,
    };
    let W = 0,
      Hh = 0,
      dpr = 1,
      raf = 0,
      alive = true,
      visible = true;
    const t0 = performance.now();
    const pins: { p: Place; x: number; y: number; front: boolean }[] = [];

    const size = () => {
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = el.clientWidth;
      Hh = el.clientHeight;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(Hh * dpr);
    };
    const radius = () => Math.min(W, Hh) * 0.4;
    const ortho = () =>
      geoOrthographic()
        .scale(radius())
        .translate([W / 2, Hh / 2])
        .rotate([-st.yaw / RAD, -st.tilt / RAD])
        .clipAngle(90);
    const project = (v: Vec3, lift: number, r: number, cx: number, cy: number) => {
      const [x, y, z] = rotate(v, st.yaw, st.tilt);
      return { x: cx + x * r * lift, y: cy - y * r * lift, z };
    };
    const regionFeatures = () => {
      const { regions } = live.current;
      return world.filter((f) => f.properties.iso2 && regions[f.properties.iso2]);
    };
    const countryAt = (x: number, y: number): CountryFeature | null => {
      const r = radius();
      if (Math.hypot(x - W / 2, y - Hh / 2) > r) return null;
      const ll = ortho().invert?.([x, y]);
      if (!ll) return null;
      return regionFeatures().find((f) => geoContains(f, ll)) ?? null;
    };

    const draw = (now: number) => {
      const { hub, places, regions } = live.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, Hh);
      const r = radius(),
        cx = W / 2,
        cy = Hh / 2;
      drawGlobe(
        ctx,
        dots,
        { cx, cy, r, yaw: st.yaw, tilt: st.tilt },
        theme.land,
        Math.max(1.4, r / 150),
        theme.glow,
        (iso2) => (iso2 ? (regions[iso2]?.color ?? null) : null),
      );
      // painted countries: a soft fill under the coloured dots
      const path = geoPath(ortho(), ctx);
      for (const f of regionFeatures()) {
        const color = regions[f.properties.iso2!].color;
        ctx.beginPath();
        path(f);
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      const H = toVec(hub.lon, hub.lat);
      const t = (now - t0) / 1000;
      pins.length = 0;
      ctx.lineCap = "round";
      places.forEach((p, i) => {
        const v = toVec(p.lon, p.lat);
        const offset = i / Math.max(1, places.length);
        const ang = Math.acos(Math.max(-1, Math.min(1, H[0] * v[0] + H[1] * v[1] + H[2] * v[2])));
        const height = 0.06 + ang * 0.12;
        const pts: { x: number; y: number; z: number }[] = [];
        for (let k = 0; k <= 48; k++) {
          const u = k / 48;
          pts.push(project(slerp(H, v, u), 1 + Math.sin(Math.PI * u) * height, r, cx, cy));
        }
        // the arc: faint where it passes behind the globe
        ctx.strokeStyle = theme.arc;
        ctx.lineWidth = 1.1;
        for (let k = 0; k < 48; k++) {
          const a = pts[k],
            b = pts[k + 1];
          const hidden = a.z < 0 && Math.hypot(a.x - cx, a.y - cy) < r;
          ctx.globalAlpha = hidden ? 0.06 : 0.38;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        // the comet: a bright head with a fading tail, looping with its own offset
        const cycle = 3.6,
          ph = reduced ? 0.999 : (t / cycle + offset) % 1;
        const run = Math.min(1, ph / 0.7);
        const head = Math.floor(run * 48);
        for (let k = Math.max(0, head - 10); k < head; k++) {
          const a = pts[k],
            b = pts[k + 1];
          if (a.z < 0 && Math.hypot(a.x - cx, a.y - cy) < r) continue;
          ctx.globalAlpha = (1 - (head - k) / 10) * 0.95;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        const end = pts[48];
        const front = end.z > 0;
        pins.push({ p, x: end.x, y: end.y, front });
        if (front) {
          ctx.globalAlpha = 1;
          ctx.fillStyle = theme.arc;
          ctx.beginPath();
          ctx.arc(end.x, end.y, 2.6, 0, Math.PI * 2);
          ctx.fill();
          // arrival pulse
          if (ph > 0.7) {
            const k = (ph - 0.7) / 0.3;
            ctx.globalAlpha = 1 - k;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.arc(end.x, end.y, 3 + k * 16, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      });
      // the hub
      const h = project(H, 1, r, cx, cy);
      if (h.z > 0) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = theme.text;
        ctx.beginPath();
        ctx.arc(h.x, h.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 3);
        ctx.strokeStyle = theme.text;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(h.x, h.y, 9, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    const tick = (now: number) => {
      raf = 0;
      if (!alive || !visible || document.hidden) return;
      const dt = st.last ? Math.min(0.05, (now - st.last) / 1000) : 0.016;
      st.last = now;
      if (!st.drag) {
        st.yaw += st.vy * dt;
        st.tilt += st.vt * dt;
        st.vy *= Math.pow(0.05, dt);
        st.vt *= Math.pow(0.05, dt);
        if (now - st.idle > 2500) st.yaw += dt * 0.08;
        st.tilt = Math.max(-0.9, Math.min(0.9, st.tilt + (18 * RAD - st.tilt) * Math.min(1, dt * 0.4)));
      }
      draw(now);
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (reduced) return draw(performance.now());
      if (!raf && alive) {
        st.last = 0;
        raf = requestAnimationFrame(tick);
      }
    };
    const local = (e: PointerEvent) => {
      const b = cv.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    };
    const onDown = (e: PointerEvent) => {
      cv.setPointerCapture(e.pointerId);
      st.drag = true;
      st.moved = 0;
      st.px = e.clientX;
      st.py = e.clientY;
      st.vy = st.vt = 0;
      el.dataset.dragging = "";
    };
    const onMove = (e: PointerEvent) => {
      if (st.drag) {
        const r = radius();
        const dx = e.clientX - st.px,
          dy = e.clientY - st.py;
        st.moved += Math.abs(dx) + Math.abs(dy);
        st.px = e.clientX;
        st.py = e.clientY;
        st.yaw -= dx / r;
        st.tilt = Math.max(-0.9, Math.min(0.9, st.tilt + dy / r));
        st.vy = (-dx / r) * 30;
        st.vt = (dy / r) * 30;
        st.idle = performance.now();
        if (reduced) draw(performance.now());
        if (st.moved > 4) setTip(null);
        return;
      }
      const { x, y } = local(e);
      const near = pins
        .filter((p) => p.front)
        .map((p) => ({ ...p, d: Math.hypot(p.x - x, p.y - y) }))
        .sort((a, b2) => a.d - b2.d)[0];
      const country = countryAt(x, y);
      if (country) el.dataset.pointing = "";
      else delete el.dataset.pointing;
      if (near && near.d < 18) {
        setTip({ x: near.x, y: near.y, title: near.p.name, note: near.p.note });
      } else if (country) {
        const region = live.current.regions[country.properties.iso2!];
        setTip({ x, y, title: country.properties.name, note: region?.label });
      } else {
        setTip(null);
      }
    };
    const onUp = (e: PointerEvent) => {
      const wasClick = st.drag && st.moved < 5;
      st.drag = false;
      st.idle = performance.now();
      delete el.dataset.dragging;
      if (!wasClick) return;
      const { x, y } = local(e);
      const country = countryAt(x, y);
      if (country?.properties.iso2) live.current.onSelectCountry?.(country.properties.iso2);
    };
    const onCancel = () => {
      st.drag = false;
      delete el.dataset.dragging;
    };
    const onLeave = () => {
      setTip(null);
      delete el.dataset.pointing;
    };
    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", onCancel);
    cv.addEventListener("pointerleave", onLeave);
    const ro = new ResizeObserver(() => {
      size();
      draw(performance.now());
    });
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) start();
    });
    io.observe(el);
    const onVis = () => !document.hidden && start();
    document.addEventListener("visibilitychange", onVis);
    size();
    start();
    redraw.current = () => reduced && alive && draw(performance.now());
    return () => {
      alive = false;
      redraw.current = () => {};
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      cv.removeEventListener("pointerdown", onDown);
      cv.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerup", onUp);
      cv.removeEventListener("pointercancel", onCancel);
      cv.removeEventListener("pointerleave", onLeave);
    };
  }, [theme, motion]);

  return (
    <div
      ref={host}
      className={`rg ${className}`}
      style={{
        background: theme.ground,
        color: theme.text,
        ["--rg-muted" as string]: theme.muted,
        ["--rg-arc" as string]: theme.arc,
        ["--rg-ground" as string]: theme.ground,
        ...style,
      }}
    >
      <canvas
        ref={canvas}
        className="rg__canvas"
        role="img"
        aria-label={`A globe with ${places.length} routes from ${hub.name}`}
      />
      {tip && (
        <div className="rg__tip" style={{ left: tip.x, top: tip.y }} aria-hidden="true">
          <strong>{tip.title}</strong>
          {tip.note && <span>{tip.note}</span>}
        </div>
      )}
      <ul className="rg__sr">
        {places.map((p) => (
          <li key={p.name}>
            {hub.name} to {p.name}
            {p.note ? `, ${p.note}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default RouteGlobe;
