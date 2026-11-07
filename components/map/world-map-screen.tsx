"use client";

import { useCallback, useMemo, useState } from "react";
import { geoCentroid } from "d3-geo";
import { Heart, Plus } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { CountryPanel } from "@/components/map/country-panel";
import { COUNTRY_STATUS } from "@/components/status-badge";
import { useAllTrips } from "@/components/trip/use-all-trips";
import { RouteGlobe, type GlobeTheme, type Place, type Region } from "@/components/ui/route-globe";
import { countries } from "@/components/ui/route-globe-utils/globe";
import { countryFromName, countryName } from "@/lib/countries";
import { homeCountry, homePassport, mapCountries, type CountryStatus } from "@/lib/trip-progress";
import { addWish, useWishlist } from "@/lib/wishlist-store";

const THEME: GlobeTheme = {
  ground: "transparent",
  land: "#7d849e",
  arc: "#5b3df5",
  glow: "rgb(91 61 245 / 0.05)",
  text: "#151a33",
  muted: "#7b8199",
};

const CAPITALS: Record<string, [number, number]> = { FR: [2.35, 48.86], GB: [-0.13, 51.5], US: [-77.04, 38.9], DE: [13.4, 52.52] };
const CITIES: [RegExp, [number, number]][] = [[/bali/i, [115.19, -8.41]]];
const ORDER: CountryStatus[] = ["home", "in_progress", "ready", "planned", "wish"];

function coordsOf(iso2: string, destination?: string | null): [number, number] | null {
  const city = destination ? CITIES.find(([re]) => re.test(destination)) : undefined;
  if (city) return city[1];
  if (CAPITALS[iso2]) return CAPITALS[iso2];
  const f = countries().find((c) => c.properties.iso2 === iso2);
  return f ? (geoCentroid(f) as [number, number]) : null;
}

export function WorldMapScreen() {
  const trips = useAllTrips();
  const wishlist = useWishlist();
  const [selected, setSelected] = useState<string | null>(null);
  const [wish, setWish] = useState("");
  const [wishError, setWishError] = useState<string | null>(null);

  const home = trips ? homeCountry(trips) : "FR";
  const world = useMemo(() => (trips ? mapCountries(trips, wishlist, home) : {}), [trips, wishlist, home]);
  const list = Object.values(world).sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));

  const regions = useMemo(
    () =>
      Object.fromEntries(
        Object.values(world).map((c) => [c.iso2, { color: COUNTRY_STATUS[c.status].color, label: COUNTRY_STATUS[c.status].label }]),
      ) as Record<string, Region>,
    [world],
  );
  const hub = useMemo<Place>(() => {
    const [lon, lat] = coordsOf(home) ?? [2.35, 48.86];
    return { name: countryName(home), lon, lat };
  }, [home]);
  const places = useMemo<Place[]>(
    () =>
      (trips ?? []).flatMap((t) => {
        const iso2 = t.request.country_iso2;
        if (!iso2 || iso2 === home) return [];
        const c = coordsOf(iso2, t.request.destination);
        if (!c) return [];
        return [{ name: t.request.destination ?? countryName(iso2), lon: c[0], lat: c[1], note: COUNTRY_STATUS[world[iso2]?.status ?? "planned"].label }];
      }),
    [trips, home, world],
  );
  const close = useCallback(() => setSelected(null), []);

  const submitWish = (e: React.FormEvent) => {
    e.preventDefault();
    const iso2 = countryFromName(wish);
    if (!iso2) return setWishError("Unknown country: try its English name.");
    setWishError(null);
    addWish(iso2);
    setWish("");
  };

  return (
    <div className="flex flex-1 flex-col pb-28 md:pb-10">
      <AppNav />
      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-5 pt-6 sm:px-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:pt-10">
        <section className="relative min-h-[500px] overflow-hidden rounded-[36px] bg-card shadow-soft sm:min-h-[560px] lg:min-h-[640px]">
          <div className="pointer-events-none absolute top-6 left-6 z-10 sm:top-8 sm:left-8">
            <p className="text-sm font-medium text-muted-foreground">From {countryName(home)}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Your world</h1>
          </div>
          {trips ? (
            <RouteGlobe
              hub={hub}
              places={places}
              regions={regions}
              onSelectCountry={setSelected}
              theme={THEME}
              className="!absolute inset-0"
            />
          ) : null}
          <div className="absolute inset-x-4 bottom-4 z-10 flex flex-wrap justify-center gap-x-4 gap-y-1.5 rounded-[20px] bg-card/85 px-5 py-2.5 text-xs font-medium shadow-soft backdrop-blur sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2">
            {ORDER.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: COUNTRY_STATUS[s].color }} />
                {COUNTRY_STATUS[s].label}
              </span>
            ))}
          </div>
        </section>

        <aside className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Countries on your map</h2>
            <p className="mt-1 text-sm text-muted-foreground">Click a coloured country on the globe, or pick one here.</p>
          </div>
          <ul className="space-y-2" aria-busy={trips === null}>
            {list.map((c) => (
              <li key={c.iso2}>
                <button
                  type="button"
                  onClick={() => setSelected(c.iso2)}
                  className="flex w-full items-center gap-4 rounded-[22px] bg-card p-3 pr-4 text-left shadow-soft transition-transform hover:-translate-y-0.5"
                >
                  <span
                    className="grid size-11 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                    style={{ background: COUNTRY_STATUS[c.status].color }}
                  >
                    {c.iso2}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{countryName(c.iso2)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {COUNTRY_STATUS[c.status].label}
                      {c.trips.length > 0 ? ` · ${c.trips.map((t) => t.request.destination ?? "Trip").join(", ")}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <section id="wishlist" className="scroll-mt-24 rounded-[28px] bg-card p-6 shadow-soft">
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <Heart className="size-4 text-attention" /> Where do you dream of going?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Add a country to your wishlist: it lights up on the globe.</p>
            <form onSubmit={submitWish} className="mt-4 flex gap-2">
              <input
                value={wish}
                onChange={(e) => setWish(e.target.value)}
                placeholder="Japan, Peru, Kenya…"
                aria-label="Add a country to your wishlist"
                className="h-11 min-w-0 flex-1 rounded-full bg-muted px-4 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
              />
              <button
                type="submit"
                disabled={!wish.trim()}
                aria-label="Add"
                className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-glow disabled:opacity-40 disabled:shadow-none"
              >
                <Plus className="size-5" />
              </button>
            </form>
            {wishError ? <p className="mt-2 text-sm text-attention-foreground">{wishError}</p> : null}
            {wishlist.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {wishlist.map((iso2) => (
                  <button
                    key={iso2}
                    type="button"
                    onClick={() => setSelected(iso2)}
                    className="rounded-full bg-attention/12 px-3 py-1.5 text-xs font-medium text-attention-foreground"
                  >
                    {countryName(iso2)}
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        </aside>
      </main>

      {selected ? (
        <CountryPanel
          iso2={selected}
          country={world[selected] ?? null}
          homeTrips={(trips ?? []).filter((t) => (t.request.origin_country ?? t.request.nationality) === home).length}
          passport={trips ? homePassport(trips, home) : null}
          onClose={close}
        />
      ) : null}
    </div>
  );
}
