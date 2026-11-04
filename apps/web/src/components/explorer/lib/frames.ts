import { useEffect, useState } from "react";
import { indicators, type IndicatorId } from "@/data/indicators";
import { rasterUrl, type Manifest } from "./data";
import { decodeGray, paint, type GrayRaster } from "./raster";
import type { MapThemeName } from "./theme";

export type Frame = { key: string; url: string; gray: GrayRaster; lite: boolean };
export type FrameRequest = {
  indicator: IndicatorId;
  year: number | null;
  lite: boolean;
  theme: MapThemeName;
  community: number;
};

/*
 * Colored frames, cached by indicator, year, size, theme and highlighted community.
 * A small LRU keeps a time-lapse smooth without holding every year in memory.
 */
const LIMIT = 14;
const frames = new Map<string, Promise<Frame>>();

const keyOf = (r: FrameRequest) =>
  `${r.indicator}:${r.year ?? "static"}:${r.lite ? "lite" : "full"}:${r.theme}:${r.indicator === "compn" ? r.community : ""}`;

/** A binary map's first year, at each size, which later years are painted against. */
const firsts = new Map<string, Promise<GrayRaster>>();
function firstYear(indicator: IndicatorId, year: number, lite: boolean) {
  const key = `${indicator}:${year}:${lite}`;
  let first = firsts.get(key);
  if (!first) {
    first = decodeGray(rasterUrl(indicator, year, lite));
    first.catch(() => firsts.delete(key));
    firsts.set(key, first);
  }
  return first;
}

export function getFrame(manifest: Manifest, request: FrameRequest): Promise<Frame> {
  const key = keyOf(request);
  const cached = frames.get(key);
  if (cached) {
    frames.delete(key);
    frames.set(key, cached);
    return cached;
  }
  const info = manifest.indicators[request.indicator];
  // Hidden while the page was open: the API has no map for it.
  if (!info) return Promise.reject(new Error(`${request.indicator} is not in the catalog`));
  const { kind, years } = info;
  const first = kind === "binary" ? years?.[0] : undefined;
  const isFirst = first !== undefined && request.year === first;
  const gray = isFirst
    ? firstYear(request.indicator, first, request.lite)
    : decodeGray(rasterUrl(request.indicator, request.year, request.lite));
  // Without its first year, a year is still painted, only without the lost grassland.
  const since =
    first !== undefined && request.year !== null && !isFirst
      ? firstYear(request.indicator, first, request.lite).catch(() => undefined)
      : undefined;
  const frame = Promise.all([gray, since]).then(async ([gray, before]) => ({
    key,
    gray,
    lite: request.lite,
    url: await paint(gray, kind, indicators[request.indicator].family, request.theme, request.community, before),
  }));
  frame.catch(() => frames.delete(key));
  frames.set(key, frame);
  while (frames.size > LIMIT) {
    const [oldest, evicted] = frames.entries().next().value as [string, Promise<Frame>];
    frames.delete(oldest);
    void evicted.then((f) => URL.revokeObjectURL(f.url)).catch(() => undefined);
  }
  return frame;
}

/** The frame to show; keeps the previous one on screen until the next is ready, so nothing flashes. */
export function useFrame(manifest: Manifest | null, request: FrameRequest | null): Frame | null {
  const [frame, setFrame] = useState<Frame | null>(null);
  const key = request ? keyOf(request) : null;
  useEffect(() => {
    if (!manifest || !request) {
      setFrame(null);
      return;
    }
    let live = true;
    getFrame(manifest, request)
      .then((f) => live && setFrame(f))
      .catch(() => live && setFrame(null));
    return () => {
      live = false;
    };
    // The key captures every field of the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest, key]);
  return frame;
}
