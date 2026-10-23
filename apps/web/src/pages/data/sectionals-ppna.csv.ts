import type { APIRoute } from "astro";
import { sectionals, sectionalPeriod } from "@/data/geo";
import { compositeDate } from "@/data/series";

/** Grass productivity of the latest 16-day period, as a download: one row per police district. */
// Bands are named b<year>-<day of year> in Earth Engine; the file carries the calendar date.
const [bandYear, bandDay] = sectionalPeriod.band.slice(1).split("-").map(Number);
const periodStart = compositeDate(bandYear, bandDay).toISOString().slice(0, 10);

export const GET: APIRoute = () => {
  const header = [
    "district_id",
    "department",
    "district_number",
    "period_start",
    "ppna_kg_dm_ha_16_days",
    "historical_mean_kg_dm_ha",
    "anomaly",
  ];
  const rows = sectionals.map((s) =>
    [
      s.id,
      s.department,
      s.number,
      periodStart,
      s.now ?? "",
      s.average ?? "",
      s.anomaly === null ? "" : s.anomaly.toFixed(4),
    ]
      .map((v) => (typeof v === "string" && v.includes(",") ? `"${v}"` : String(v)))
      .join(","),
  );
  return new Response([header.join(","), ...rows].join("\n") + "\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8" },
  });
};
