const CLOUDS = [
  { top: "8%", scale: 1.25, drift: "190s", delay: "-40s", opacity: 0.95 },
  { top: "22%", scale: 0.7, drift: "150s", delay: "-110s", opacity: 0.8 },
  { top: "48%", scale: 1.6, drift: "240s", delay: "-170s", opacity: 0.9 },
  { top: "66%", scale: 0.9, drift: "170s", delay: "-20s", opacity: 0.75 },
  { top: "82%", scale: 1.35, drift: "210s", delay: "-95s", opacity: 0.9 },
  { top: "36%", scale: 0.55, drift: "130s", delay: "-60s", opacity: 0.6 },
];

const PUFFS = [
  { left: 0, top: 46, w: 120, h: 64 },
  { left: 52, top: 18, w: 110, h: 90 },
  { left: 120, top: 0, w: 130, h: 120 },
  { left: 200, top: 30, w: 110, h: 84 },
  { left: 40, top: 60, w: 240, h: 56 },
];

function stars(count: number) {
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: count }, () => ({
    cx: rand() * 100,
    cy: rand() * 100,
    r: 0.3 + rand() * 0.7,
    o: 0.4 + rand() * 0.5,
  }));
}

const STARS = stars(170);

export function SkyScene() {
  return (
    <div className="sky-layer" aria-hidden>
      <div className="sky-day" />
      <div className="sky-night" />
      <svg className="sky-stars" width="100%" height="100%">
        {STARS.map((s, i) => (
          <circle key={i} cx={`${s.cx}%`} cy={`${s.cy}%`} r={s.r} fill="#fff" opacity={s.o} />
        ))}
      </svg>
      <div className="sky-moon" />
      {CLOUDS.map((c, i) => (
        <div
          key={i}
          className="cloud"
          style={{ top: c.top, left: 0, opacity: c.opacity, ["--drift" as string]: c.drift, ["--delay" as string]: c.delay }}
        >
          <div style={{ position: "relative", width: 330, height: 130, transform: `scale(${c.scale})`, transformOrigin: "left top" }}>
            {PUFFS.map((p, j) => (
              <span key={j} style={{ left: p.left, top: p.top, width: p.w, height: p.h }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
