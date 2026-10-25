import { useEffect, useRef, useState, type RefObject } from "react";
import type { Manifest, ZoneGeometry } from "@/components/explorer/lib/data";
import { ringsOf } from "@/components/explorer/lib/geo";
import Locator from "@/components/zone/Locator";

const mercator = (lat: number) => (Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180) / Math.PI;

/** A zone's outline drawn to fit its box, in the maps' Web Mercator, so it reads as it does on the map. */
export function ZoneShape({ geometry }: { geometry: ZoneGeometry }) {
  const rings = ringsOf(geometry).map((ring) => ring.map(([lng, lat]) => [lng, -mercator(lat)] as const));
  const xs = rings.flat().map((p) => p[0]);
  const ys = rings.flat().map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = Math.max(x1 - x0, y1 - y0) * 0.12 || 0.001;
  const d = rings.map((ring) => `M${ring.map(([x, y]) => `${x},${y}`).join("L")}Z`).join("");
  return (
    <svg
      viewBox={`${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`}
      preserveAspectRatio="xMidYMid meet"
      className="size-full"
      aria-hidden="true"
    >
      <path
        d={d}
        fillRule="evenodd"
        className="fill-action/20 stroke-action"
        style={{ strokeWidth: "calc(var(--ia-viz-mark-outline-width) * 1.5px)", strokeLinejoin: "round" }}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Whether an element is on screen or about to be; once seen, it stays true. */
export function useSeen(ref: RefObject<Element | null>): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || seen) return;
    const observer = new IntersectionObserver(([entry]) => entry?.isIntersecting && setSeen(true), {
      rootMargin: "200px",
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, seen]);
  return seen;
}

const outlines = new Map<string, Promise<ZoneGeometry | null>>();

/** A saved zone's outline, fetched once it is seen; a new version fetches again. No id, nothing to fetch. */
export function useSavedZoneOutline(
  id: string | null,
  version: number,
  project?: string,
): [RefObject<HTMLDivElement | null>, ZoneGeometry | null] {
  const box = useRef<HTMLDivElement>(null);
  const seen = useSeen(box);
  const [geometry, setGeometry] = useState<ZoneGeometry | null>(null);
  useEffect(() => {
    if (!seen || !id) return;
    const key = `${id}:${version}`;
    if (!outlines.has(key))
      outlines.set(
        key,
        Promise.all([import("@/lib/account"), import("@idea-agro/api-client")])
          .then(([{ privately }, client]) =>
            privately((init) =>
              project ? client.getProjectZoneGeometry(project, id, init) : client.getSavedZoneGeometry(id, init),
            ),
          )
          .then((response) => (response.status === 200 ? (response.data as ZoneGeometry) : null))
          .catch(() => null)
          // A failure is not remembered: the next look tries again.
          .then((found) => (found ? found : (outlines.delete(key), null))),
      );
    let live = true;
    void outlines.get(key)?.then((found) => live && setGeometry(found));
    return () => {
      live = false;
    };
  }, [seen, id, version, project]);
  return [box, geometry];
}

type Thumbnailed = { id: string; version: number; area_ha: number; bbox: number[] };

/**
 * A saved zone's picture for a card: its outline with the country beside it, or, for a point, the country with
 * the point on it. The outline loads once the card is on screen.
 */
export function ZoneThumbnail({
  zone,
  manifest,
  project,
}: {
  zone: Thumbnailed;
  manifest: Manifest | null;
  project?: string;
}) {
  const point = zone.area_ha === 0;
  const [box, geometry] = useSavedZoneOutline(point ? null : zone.id, zone.version, project);
  const [west, south, east, north] = zone.bbox;
  const center: ZoneGeometry = { type: "Point", coordinates: [(west + east) / 2, (south + north) / 2] };
  const locator = (className: string) =>
    manifest && (
      <div className={className} style={{ aspectRatio: `${manifest.outline.width} / ${manifest.outline.height}` }}>
        <Locator manifest={manifest} geometry={geometry ?? center} />
      </div>
    );
  return (
    <div ref={box} className="relative aspect-[16/10] overflow-hidden bg-surface-sunken">
      {point ? (
        <div className="absolute inset-0 flex justify-center p-3">{locator("h-full")}</div>
      ) : (
        <>
          <div className="absolute inset-0 p-5 pr-14">
            {geometry ? (
              <ZoneShape geometry={geometry} />
            ) : (
              <div className="size-full animate-pulse rounded-md bg-surface-muted" />
            )}
          </div>
          {locator("absolute right-3 bottom-3 w-9")}
        </>
      )}
    </div>
  );
}
