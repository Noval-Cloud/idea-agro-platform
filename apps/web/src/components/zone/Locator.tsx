import type { Manifest, ZoneGeometry } from "@/components/explorer/lib/data";
import { ringsOf } from "@/components/explorer/lib/geo";

const stroke = (mark: string) => ({ strokeWidth: `calc(var(--ia-viz-mark-${mark}) * 1px)` });

/** The country with the zone on it, in the rasters' Web Mercator frame. */
export default function Locator({ manifest, geometry }: { manifest: Manifest; geometry: ZoneGeometry }) {
  const { width, height, d } = manifest.outline;
  const [W, S, E, N] = manifest.bounds;
  const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const px = ([lng, lat]: [number, number]) => [
    ((lng - W) / (E - W)) * width,
    ((merc(N) - merc(lat)) / (merc(N) - merc(S))) * height,
  ];
  const rings = ringsOf(geometry);
  const path = rings
    .map(
      (r) =>
        `M${r
          .map((p) =>
            px(p)
              .map((v) => v.toFixed(1))
              .join(","),
          )
          .join("L")}Z`,
    )
    .join("");
  // A point is its own center; an area's is the mean of its corners.
  const points = geometry.type === "Point" ? [px(geometry.coordinates)] : rings.flat().map(px);
  const cx = points.reduce((a, p) => a + p[0], 0) / points.length;
  const cy = points.reduce((a, p) => a + p[1], 0) / points.length;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="size-full" aria-hidden="true">
      <path
        d={d}
        className="fill-surface-muted stroke-surface-muted"
        style={stroke("outline-width")}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={path}
        className="fill-action stroke-action"
        style={stroke("outline-width")}
        vectorEffect="non-scaling-stroke"
      />
      {/* A ring finds zones too small to see at this scale. */}
      <circle
        cx={cx}
        cy={cy}
        className="fill-none stroke-action"
        style={{ ...stroke("ring-width"), r: "calc(var(--ia-viz-mark-point-radius) * 1px)" }}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
