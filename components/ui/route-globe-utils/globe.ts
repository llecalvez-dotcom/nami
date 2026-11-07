import { geoEquirectangular, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { numericToAlpha2 } from "i18n-iso-countries";
import world from "world-atlas/countries-110m.json";

export type Vec3 = [number, number, number];
export type CountryFeature = Feature<Geometry, { name: string; iso2: string | null }>;
export type Dot = { v: Vec3; iso2: string | null };
export type GlobeView = { cx: number; cy: number; r: number; yaw: number; tilt: number };

const RAD = Math.PI / 180;

export function toVec(lon: number, lat: number): Vec3 {
  const l = lon * RAD,
    p = lat * RAD;
  return [Math.cos(p) * Math.sin(l), Math.sin(p), Math.cos(p) * Math.cos(l)];
}

// Brings the point (lon = yaw, lat = tilt) to the centre of the view, facing the viewer (+z).
export function rotate([x, y, z]: Vec3, yaw: number, tilt: number): Vec3 {
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw);
  const x1 = x * cy - z * sy,
    z1 = x * sy + z * cy;
  const ct = Math.cos(tilt),
    st = Math.sin(tilt);
  return [x1, y * ct - z1 * st, y * st + z1 * ct];
}

export function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const d = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const w = Math.acos(d);
  if (w < 1e-6) return a;
  const s = Math.sin(w),
    ka = Math.sin((1 - t) * w) / s,
    kb = Math.sin(t * w) / s;
  return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
}

let countriesCache: CountryFeature[] | null = null;

export function countries(): CountryFeature[] {
  if (countriesCache) return countriesCache;
  const topo = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
  const fc = feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>;
  countriesCache = fc.features.map((f) => ({
    ...f,
    properties: { name: f.properties.name, iso2: f.id !== undefined ? (numericToAlpha2(String(f.id)) ?? null) : null },
  }));
  return countriesCache;
}

// Rasterises the countries once (one colour per country) and samples a Fibonacci sphere on it.
export function landDots(count: number): Dot[] {
  const list = countries();
  const W = 1440,
    H = 720;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const projection = geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]);
  const path = geoPath(projection, ctx);
  list.forEach((f, i) => {
    ctx.fillStyle = `rgb(${(i + 1) & 255}, ${((i + 1) >> 8) & 255}, 7)`;
    ctx.beginPath();
    path(f);
    ctx.fill();
  });
  const pixels = ctx.getImageData(0, 0, W, H).data;
  const dots: Dot[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * (i + 0.5)) / count;
    const ring = Math.sqrt(1 - y * y);
    const theta = golden * i;
    const v: Vec3 = [ring * Math.sin(theta), y, ring * Math.cos(theta)];
    const lat = Math.asin(y) / RAD;
    const lon = Math.atan2(v[0], v[2]) / RAD;
    const px = Math.min(W - 1, Math.floor(((lon + 180) / 360) * W));
    const py = Math.min(H - 1, Math.floor(((90 - lat) / 180) * H));
    const o = (py * W + px) * 4;
    if (pixels[o + 3] < 128 || pixels[o + 2] !== 7) continue;
    const index = pixels[o] + (pixels[o + 1] << 8) - 1;
    dots.push({ v, iso2: list[index]?.properties.iso2 ?? null });
  }
  return dots;
}

export function drawGlobe(
  ctx: CanvasRenderingContext2D,
  dots: Dot[],
  view: GlobeView,
  land: string,
  size: number,
  glow: string,
  colorOf: (iso2: string | null) => string | null = () => null,
) {
  const { cx, cy, r, yaw, tilt } = view;
  const halo = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.35);
  halo.addColorStop(0, glow);
  halo.addColorStop(1, "transparent");
  ctx.fillStyle = halo;
  ctx.fillRect(cx - r * 1.4, cy - r * 1.4, r * 2.8, r * 2.8);
  ctx.globalAlpha = 1;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  const colored: { x: number; y: number; z: number; c: string }[] = [];
  ctx.fillStyle = land;
  for (const d of dots) {
    const [x, y, z] = rotate(d.v, yaw, tilt);
    if (z <= 0.02) continue;
    const sx = cx + x * r,
      sy = cy - y * r;
    const c = colorOf(d.iso2);
    if (c) {
      colored.push({ x: sx, y: sy, z, c });
      continue;
    }
    const s = size * (0.45 + 0.55 * z);
    ctx.globalAlpha = 0.25 + 0.6 * z;
    ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
  }
  for (const d of colored) {
    const s = size * 1.35 * (0.55 + 0.45 * d.z);
    ctx.globalAlpha = 0.55 + 0.45 * d.z;
    ctx.fillStyle = d.c;
    ctx.beginPath();
    ctx.arc(d.x, d.y, s / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
