import { useEffect, useState } from "react";
import type { SavedZoneOut } from "@idea-agro/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AccountTranslator } from "./i18n";

type Props = { t: AccountTranslator["t"]; number: AccountTranslator["number"]; zonePath: string; explorePath: string };

const card = "rounded-lg border border-line bg-surface p-6";

/** The zones saved to the account: open, rename, delete. */
export default function SavedZones({ t, number, zonePath, explorePath }: Props) {
  const [zones, setZones] = useState<SavedZoneOut[] | null | undefined>(undefined);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [failed, setFailed] = useState(false);

  const api = () => Promise.all([import("@/lib/account"), import("@idea-agro/api-client")]);

  useEffect(() => {
    void api()
      .then(([{ privately }, client]) => privately((init) => client.listSavedZones(init)))
      .then((response) => setZones(response.status === 200 ? response.data : null))
      .catch(() => setZones(null));
  }, []);

  const rename = async (id: string, name: string) => {
    const [{ privately }, client] = await api();
    const response = await privately((init) => client.renameSavedZone(id, { name }, init));
    if (response.status !== 200) return setFailed(true);
    setZones((all) => all?.map((z) => (z.id === id ? response.data : z)));
    setEditing(null);
  };

  const remove = async (zone: SavedZoneOut) => {
    if (!window.confirm(t("account.zones.confirmDelete", { name: zone.name }))) return;
    const [{ privately }, client] = await api();
    const response = await privately((init) => client.deleteSavedZone(zone.id, init));
    if (response.status !== 204) return setFailed(true);
    setZones((all) => all?.filter((z) => z.id !== zone.id));
  };

  return (
    <section id="zones" aria-labelledby="zones-title" className={card}>
      <h2 id="zones-title" className="text-lg font-medium text-ink">
        {t("account.zones.title")}
      </h2>
      {zones === undefined ? (
        <p role="status" className="mt-3 text-sm text-ink-muted">
          {t("account.loading")}
        </p>
      ) : zones === null ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {t("account.zones.failed")}
        </p>
      ) : zones.length === 0 ? (
        <p className="mt-3 max-w-prose text-sm text-ink-muted">
          {t("account.zones.empty")}{" "}
          <a href={explorePath} className="text-link underline underline-offset-(--ia-link-underline-offset)">
            {t("account.zones.toMap")}
          </a>
        </p>
      ) : (
        <ul className="mt-4 grid divide-y divide-line">
          {zones.map((zone) => (
            <li key={zone.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              {editing?.id === zone.id ? (
                <form
                  className="flex grow items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (editing.name.trim()) void rename(zone.id, editing.name.trim());
                  }}
                >
                  <Input
                    value={editing.name}
                    maxLength={120}
                    aria-label={t("account.zones.renameLabel", { name: zone.name })}
                    onChange={(event) => setEditing({ id: zone.id, name: event.currentTarget.value })}
                    autoFocus
                  />
                  <Button type="submit" size="sm">
                    {t("account.zones.save")}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    {t("account.zones.cancel")}
                  </Button>
                </form>
              ) : (
                <>
                  <div className="min-w-0 grow">
                    <a
                      href={`${zonePath}?saved=${zone.id}`}
                      className="font-medium text-link underline-offset-(--ia-link-underline-offset) hover:underline"
                    >
                      {zone.name}
                    </a>
                    <p className="text-xs text-ink-subtle">
                      {[t("account.zones.area", { value: number(zone.area_ha) }), zone.department]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ id: zone.id, name: zone.name })}>
                    {t("account.zones.rename")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void remove(zone)}>
                    {t("account.zones.delete")}
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {failed && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {t("account.zones.failed")}
        </p>
      )}
    </section>
  );
}
