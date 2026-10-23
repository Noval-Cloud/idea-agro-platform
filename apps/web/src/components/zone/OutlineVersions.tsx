import { useEffect, useState } from "react";
import type { OutlineVersionOut } from "@idea-agro/api-client";
import { Button } from "@/components/ui/button";
import { intlLocale, type Locale } from "@/i18n/core";
import type { createAppTranslator } from "@/components/explorer/lib/i18n";

type Props = {
  t: ReturnType<typeof createAppTranslator>["t"];
  locale: Locale;
  zoneId: string;
};

const api = () => Promise.all([import("@/lib/account"), import("@idea-agro/api-client")]);

/** For the zone's owner: every version of its outline, any of which can come back. */
export default function OutlineVersions({ t, locale, zoneId }: Props) {
  const [versions, setVersions] = useState<OutlineVersionOut[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void api()
      .then(([{ privately }, client]) => privately((init) => client.listSavedZoneVersions(zoneId, init)))
      .then((response) => setVersions(response.status === 200 ? response.data : null))
      .catch(() => setVersions(null));
  }, [zoneId]);

  // A single version has no history to show.
  if (!versions || versions.length < 2) return null;

  const hectares = (value: number) =>
    new Intl.NumberFormat(intlLocale[locale], { maximumFractionDigits: 1 }).format(value);
  const when = (value: string) =>
    new Intl.DateTimeFormat(intlLocale[locale], { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

  const restore = async (version: number) => {
    if (!window.confirm(t("zone.versions.confirmRestore", { number: version }))) return;
    setFailed(false);
    try {
      const [{ privately }, client] = await api();
      const response = await privately((init) => client.restoreSavedZoneVersion(zoneId, version, init));
      // The page shows the outline it loaded: it loads again to show the restored one.
      if (response.status === 200) location.reload();
      else setFailed(true);
    } catch {
      setFailed(true);
    }
  };

  return (
    <details className="mt-6 text-sm">
      <summary className="cursor-pointer text-ink">
        {t("zone.versions.title")} <span className="text-ink-subtle">({versions.length})</span>
      </summary>
      <p className="mt-2 max-w-prose text-ink-muted">{t("zone.versions.intro")}</p>
      <ol className="mt-3 grid divide-y divide-line">
        {versions.map((v) => (
          <li key={v.version} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
            <div className="min-w-0 grow">
              <p className="text-ink">
                {t("zone.versions.version", { number: v.version })}
                {v.current && <span className="ml-2 text-ink-subtle">· {t("zone.versions.current")}</span>}
              </p>
              <p className="text-xs text-ink-subtle">
                {[
                  t("zone.versions.by", { name: v.by_name || t("zone.versions.someone"), date: when(v.created_at) }),
                  `${hectares(v.area_ha)} ha`,
                  v.restored_from ? t("zone.versions.restoredFrom", { number: v.restored_from }) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            {!v.current && (
              <Button size="sm" variant="outline" onClick={() => void restore(v.version)}>
                {t("zone.versions.restore")}
              </Button>
            )}
          </li>
        ))}
      </ol>
      {failed && (
        <p role="alert" className="mt-2 text-danger">
          {t("zone.versions.failed")}
        </p>
      )}
    </details>
  );
}
