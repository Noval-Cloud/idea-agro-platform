import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ZoneGeometry } from "./data";

/** A zone of the reader's own, drawn or uploaded. */
export type MyZone = {
  key: string;
  name: string;
  source: "drawn" | "uploaded";
  /** The file it came from, for an uploaded zone. */
  file?: string;
  areaKm2: number;
  geometry: ZoneGeometry;
};

type MyZones = {
  /** Zones kept in this browser: drawn or uploaded while signed out, or whose save failed. */
  local: MyZone[];
  /** Zones in the account, as last loaded from it. */
  saved: MyZone[];
  /** The zone selected on the map, kept across refreshes and screens. */
  selected: string | null;
  addLocal: (zones: MyZone[]) => void;
  removeLocal: (keys: string[]) => void;
  setSaved: (zones: MyZone[]) => void;
  select: (key: string | null) => void;
};

/**
 * The reader's zones, kept in the browser. Only those not yet in the account are stored: the account's are
 * loaded from it each time, so the next person on this browser never sees them.
 */
export const useMyZones = create<MyZones>()(
  persist(
    (set) => ({
      local: [],
      saved: [],
      selected: null,
      addLocal: (zones) =>
        set((s) => ({ local: [...s.local.filter((z) => !zones.some((n) => n.key === z.key)), ...zones] })),
      removeLocal: (keys) => set((s) => ({ local: s.local.filter((z) => !keys.includes(z.key)) })),
      setSaved: (saved) => set({ saved }),
      select: (selected) => set({ selected }),
    }),
    {
      name: "ia-my-zones",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ local: s.local, selected: s.selected }),
    },
  ),
);

/** A zone of the reader's by its key, kept here or loaded from the account. */
export function findMyZone(key: string): MyZone | null {
  const { local, saved } = useMyZones.getState();
  return local.find((z) => z.key === key) ?? saved.find((z) => z.key === key) ?? null;
}

/** The next free "Zona N" number among the reader's zones. */
export function nextZoneNumber(): number {
  const { local, saved } = useMyZones.getState();
  return local.length + saved.length + 1;
}
