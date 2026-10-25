import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ActivityOut } from "@idea-agro/api-client";
import {
  FolderPlus,
  LogOut,
  MapPinMinus,
  MapPinPlus,
  Pencil,
  RotateCcw,
  Spline,
  UserCheck,
  UserCog,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented, SegmentedItem } from "@/components/ui/toggle-group";
import type { ProjectTranslator } from "./i18n";
import { useQueryState } from "@/components/lists/state";
import { api, zoneName, type ZoneNames } from "./shared";

const ranges = ["today", "week", "month", "all"] as const;
type Range = (typeof ranges)[number];

const PAGE = 30;

const icons: Record<ActivityOut["action"], ReactNode> = {
  created: <FolderPlus />,
  renamed: <Pencil />,
  described: <Pencil />,
  zone_added: <MapPinPlus />,
  zone_removed: <MapPinMinus />,
  outline_changed: <Spline />,
  outline_restored: <RotateCcw />,
  member_invited: <UserPlus />,
  member_joined: <UserCheck />,
  member_role_changed: <UserCog />,
  member_removed: <UserMinus />,
  member_left: <LogOut />,
};

/** The first moment a range covers, in the reader's own day: today since midnight, then the last 7 or 30 days. */
function since(range: Range): string | undefined {
  if (range === "all") return undefined;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (range === "week") start.setDate(start.getDate() - 6);
  if (range === "month") start.setDate(start.getDate() - 29);
  return start.toISOString();
}

type Load = { entries: ActivityOut[]; status: "loading" | "idle" | "failed"; done: boolean };

/** Who changed what and when, newest first, a page at a time as one scrolls; reloaded when the project changes. */
export function ActivityTab({
  translator,
  projectId,
  changedAt,
  names,
}: {
  translator: ProjectTranslator;
  projectId: string;
  changedAt: string;
  names: ZoneNames | null;
}) {
  const { t, parts, time, moment, day } = translator;
  const [rangeValue, setRange] = useQueryState("range", "all");
  const range: Range = ranges.includes(rangeValue as Range) ? (rangeValue as Range) : "all";
  const [load, setLoad] = useState<Load>({ entries: [], status: "loading", done: false });
  const end = useRef<HTMLDivElement>(null);
  // The request that counts: an older one finishing late is ignored.
  const current = useRef(0);

  const fetchPage = useCallback(
    async (before?: string) => {
      const request = ++current.current;
      setLoad((now) => ({ ...now, status: "loading" }));
      try {
        const [{ privately }, client] = await api();
        const response = await privately((init) =>
          client.getProjectActivity(projectId, { limit: PAGE, before, since: since(range) }, init),
        );
        if (request !== current.current) return;
        if (response.status !== 200) return setLoad((now) => ({ ...now, status: "failed" }));
        setLoad((now) => ({
          entries: before ? [...now.entries, ...response.data] : response.data,
          status: "idle",
          done: response.data.length < PAGE,
        }));
      } catch {
        if (request === current.current) setLoad((now) => ({ ...now, status: "failed" }));
      }
    },
    [projectId, range],
  );

  useEffect(() => {
    setLoad({ entries: [], status: "loading", done: false });
    void fetchPage();
  }, [fetchPage, changedAt]);

  // The next page loads when the end of the list comes into view.
  useEffect(() => {
    const element = end.current;
    if (!element || load.done || load.status !== "idle" || !load.entries.length) return;
    const last = load.entries[load.entries.length - 1].at;
    const observer = new IntersectionObserver(([entry]) => entry?.isIntersecting && void fetchPage(last), {
      rootMargin: "400px",
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [load, fetchPage]);

  const role = (value: string) =>
    value === "collaborator" || value === "viewer" ? t(`project.roles.${value}`).toLocaleLowerCase() : value;

  /** The entry's sentence, with who did it standing out. */
  const sentence = (entry: ActivityOut) => {
    const values: Record<string, string> = {
      actor: entry.actor_name || t("project.activity.someone"),
      zone: zoneName(t, names, entry.subject, entry.detail),
      subject: entry.subject,
      role: role(entry.detail),
      detail: entry.detail,
    };
    return parts(`project.activity.actions.${entry.action}`, values).map((part, index) =>
      "text" in part ? (
        <Fragment key={index}>{part.text}</Fragment>
      ) : (
        <span key={index} className={part.slot === "actor" ? "font-medium text-ink" : undefined}>
          {values[part.slot]}
        </span>
      ),
    );
  };

  /** "Today", "Yesterday" or the date, for the heading over a day's entries. */
  const heading = (at: string) => {
    const date = new Date(at);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return t("project.activity.today");
    if (date.toDateString() === yesterday.toDateString()) return t("project.activity.yesterday");
    const text = day(date);
    return text.charAt(0).toLocaleUpperCase() + text.slice(1);
  };

  const days: { key: string; label: string; entries: ActivityOut[] }[] = [];
  for (const entry of load.entries) {
    const key = new Date(entry.at).toDateString();
    const last = days[days.length - 1];
    if (last?.key === key) last.entries.push(entry);
    else days.push({ key, label: heading(entry.at), entries: [entry] });
  }

  return (
    <div className="grid gap-6 pt-6">
      <Segmented
        value={range}
        onValueChange={(value) => setRange(value as Range)}
        aria-label={t("project.activity.ranges.label")}
        className="max-w-full justify-self-start overflow-x-auto [scrollbar-width:none]"
      >
        {ranges.map((r) => (
          <SegmentedItem key={r} value={r}>
            {t(`project.activity.ranges.${r}`)}
          </SegmentedItem>
        ))}
      </Segmented>

      {load.entries.length === 0 && load.status === "idle" ? (
        <div className="grid justify-items-start gap-3 rounded-lg border border-dashed border-line-strong px-6 py-10">
          <p className="text-sm text-ink-muted">
            {range === "all" ? t("project.activity.empty") : t("project.activity.emptyRange")}
          </p>
          {range !== "all" && (
            <Button size="sm" variant="outline" onClick={() => setRange("all")}>
              {t("project.activity.wider")}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid max-w-3xl gap-6">
          {days.map((group) => (
            <section key={group.key} aria-label={group.label}>
              <h3 className="pb-2 text-xs font-medium text-ink-subtle">{group.label}</h3>
              <ol className="relative grid before:absolute before:top-4 before:bottom-4 before:left-4 before:w-px before:bg-line">
                {group.entries.map((entry, index) => (
                  <li
                    key={`${entry.at}-${index}`}
                    className="relative grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-3 py-2"
                  >
                    <span className="flex size-8 items-center justify-center rounded-full border border-line bg-surface text-ink-muted [&_svg]:size-4">
                      {icons[entry.action]}
                    </span>
                    <p className="pt-1.5 text-sm text-ink-muted">{sentence(entry)}</p>
                    <time
                      dateTime={entry.at}
                      title={moment(entry.at)}
                      className="pt-1.5 text-xs text-ink-subtle tabular-nums"
                    >
                      {time(entry.at)}
                    </time>
                  </li>
                ))}
              </ol>
            </section>
          ))}
          {/* Always there, so "loading" and "that is all" are announced when they appear. */}
          <div ref={end} role="status" className="min-h-6 text-sm text-ink-subtle">
            {load.status === "loading" ? (
              <p>{t("project.activity.loading")}</p>
            ) : load.status === "failed" ? (
              <p role="alert" className="flex items-center gap-3 text-danger">
                {t("project.activity.failed")}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void fetchPage(load.entries[load.entries.length - 1]?.at)}
                >
                  {t("project.activity.retry")}
                </Button>
              </p>
            ) : (
              load.done && load.entries.length > PAGE && <p>{t("project.activity.end")}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
