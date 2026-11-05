import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, MoreHorizontal } from "lucide-react";
import type { PluralText, SiteTextOut, TextValue, TextVersionOut } from "@idea-agro/api-client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { markdown } from "@/i18n/markdown";
import { cn } from "@/lib/utils";
import type { AccountKey, AccountTranslator } from "./i18n";

/* The editor of one of the site's texts, and what the Content section's pages share. */

export const api = () => Promise.all([import("@/lib/account"), import("@idea-agro/api-client")]);
export const languages = ["es", "en", "pt"] as const;
export type Language = (typeof languages)[number];
export type Values = Record<Language, TextValue>;

export const field =
  "w-full min-w-0 rounded-sm border border-input bg-surface px-3 py-2 text-base text-ink transition-colors duration-(--ia-motion-fast) hover:border-ink-subtle focus-visible:border-focus aria-invalid:border-danger";

export const isPlural = (value: TextValue | undefined): value is PluralText =>
  typeof value === "object" && value !== null;
const same = (a: TextValue | undefined, b: TextValue | undefined) => JSON.stringify(a) === JSON.stringify(b);
const placeholders = (text: string) => new Set(text.match(/\{\w+\}/g) ?? []);
const words = (value: TextValue) => (isPlural(value) ? [value.one, value.other] : [value]);
export const preview = (value: TextValue | undefined) =>
  value === undefined ? "" : isPlural(value) ? value.other : value;

/** What is wrong with a text against its default: empty, or placeholders added or missing. */
function problem(value: TextValue, fallback: TextValue): { kind: "empty" | "missing" | "extra"; names: string } | null {
  const pairs =
    isPlural(value) && isPlural(fallback)
      ? [value.one, value.other].map((v, i) => [v, words(fallback)[i]])
      : [[preview(value), preview(fallback)]];
  for (const [given, expected] of pairs) {
    if (!given.trim()) return { kind: "empty", names: "" };
    const have = placeholders(given);
    const want = placeholders(expected);
    const missing = [...want].filter((p) => !have.has(p));
    if (missing.length) return { kind: "missing", names: missing.join(" ") };
    const extra = [...have].filter((p) => !want.has(p));
    if (extra.length) return { kind: "extra", names: extra.join(" ") };
  }
  return null;
}

export function Badge({ children, tone = "edited" }: { children: string; tone?: "edited" | "draft" | "off" }) {
  return (
    <span
      className={cn(
        "rounded-pill px-2 py-0.5 text-2xs font-medium",
        tone === "draft"
          ? "bg-family-soil/20 text-ink"
          : tone === "off"
            ? "border border-line-strong text-ink-muted"
            : "bg-action-soft text-ink",
      )}
    >
      {children}
    </span>
  );
}

/** Asks before a reload or closing the tab loses unsaved changes; `release` lets the page reload on purpose. */
export function useLeaveGuard(dirty: boolean) {
  const released = useRef(false);
  useEffect(() => {
    if (!dirty) return;
    const ask = (event: BeforeUnloadEvent) => {
      if (!released.current) event.preventDefault();
    };
    addEventListener("beforeunload", ask);
    return () => removeEventListener("beforeunload", ask);
  }, [dirty]);
  return () => {
    released.current = true;
  };
}

export type Run = (
  client: Awaited<ReturnType<typeof api>>[1],
  init: RequestInit,
) => Promise<{ status: number; data: unknown }>;

/** One private call; an answer other than 200 is an error. */
export async function run<T>(call: Run): Promise<T> {
  const [{ privately }, client] = await api();
  const response = await privately((init) => call(client, init));
  if (response.status !== 200) throw new Error(String(response.status));
  return response.data as T;
}

/**
 * One text in a side panel, edited in its three languages: published at once or kept as a draft, with its
 * history. `label` names it where the page knows a better name than its key.
 */
export function TextPanel({
  textKey,
  label,
  translator,
  onChanged,
  onClose,
}: {
  textKey: string;
  label?: string;
  translator: AccountTranslator;
  onChanged: () => void;
  onClose: () => void;
}) {
  const { t, moment } = translator;
  const [text, setText] = useState<SiteTextOut | null>(null);
  const [values, setValues] = useState<Values | null>(null);
  const [failed, setFailed] = useState(false);
  // The action on its way: `publish`, `draft`, `discard`, `default` or `restore:<version>`.
  const [busy, setBusy] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);
  const toast = useToast();
  const [versions, setVersions] = useState<TextVersionOut[] | null>(null);
  const [previewing, setPreviewing] = useState<Language[]>([]);
  const [confirming, setConfirming] = useState(false);
  const leave = useConfirm(t("account.content.keepEditing"));

  // A waiting draft is where the editor goes on from: the form starts from it, else from what the site shows.
  const base = (found: SiteTextOut) =>
    Object.fromEntries(languages.map((l) => [l, found.draft?.[l] ?? found.current[l]])) as Values;
  const show = (found: SiteTextOut) => {
    setText(found);
    setValues(base(found));
  };

  useEffect(() => {
    run<SiteTextOut>((client, init) => client.getText(textKey, init))
      .then(show)
      .catch(() => setFailed(true));
  }, [textKey]);

  const ready = text && values;
  const problems = ready
    ? (Object.fromEntries(languages.map((l) => [l, problem(values[l], text.default[l] as TextValue)])) as Record<
        Language,
        ReturnType<typeof problem>
      >)
    : null;
  const differing = (from: Partial<Values>) =>
    values
      ? (Object.fromEntries(
          languages.filter((l) => !same(values[l], from[l])).map((l) => [l, values[l]]),
        ) as Partial<Values>)
      : {};
  // What the site would change, and what the editor changed since opening the text (or its draft).
  const toPublish = text ? differing(text.current as Partial<Values>) : {};
  const edited = text ? differing(base(text)) : {};
  const valid = problems !== null && languages.every((l) => !problems[l]);
  const untouched = Object.keys(edited).length === 0;
  // An untouched draft is published as it is; otherwise the form is what gets published.
  const canPublish = valid && (untouched && text?.draft ? true : Object.keys(toPublish).length > 0);
  useLeaveGuard(!untouched);

  const close = async () => {
    if (!untouched) {
      const discard = await leave.ask({
        title: t("account.content.leaveTitle"),
        body: t("account.content.leaveBody"),
        confirm: t("account.content.leave"),
      });
      if (!discard) return;
    }
    onClose();
  };

  const act = async (action: string, call: Run, done: AccountKey) => {
    setBusy(action);
    setRefused(false);
    try {
      show(await run<SiteTextOut>(call));
      // An open history shows the change just made.
      if (versions !== null) loadVersions();
      toast(t(done));
      onChanged();
    } catch {
      setRefused(true);
    } finally {
      setBusy(null);
    }
  };
  const publish = () =>
    untouched && text?.draft
      ? act("publish", (client, init) => client.publishText(textKey, init), "account.content.published")
      : act(
          "publish",
          (client, init) => client.putText(textKey, { texts: toPublish, publish: true }, init),
          "account.content.published",
        );
  const saveDraft = () =>
    act(
      "draft",
      (client, init) => client.putText(textKey, { texts: edited, publish: false }, init),
      "account.content.drafted",
    );
  const loadVersions = () =>
    void run<TextVersionOut[]>((client, init) => client.listVersions(textKey, init))
      .then(setVersions)
      .catch(() => setVersions([]));

  const footer = ready && (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <p role="status" className="mr-auto min-w-0 text-sm text-danger">
        {refused ? t("account.content.saveFailed") : ""}
      </p>
      {(text.draft || Object.keys(text.published).length > 0) && (
        <DropdownMenu>
          {/* The menu's actions spin on its button. */}
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("account.content.moreActions")}
              busy={busy === "discard" || busy === "default"}
              disabled={busy !== null}
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {text.draft && (
              <DropdownMenuItem
                onSelect={() =>
                  void act("discard", (client, init) => client.discardDraft(textKey, init), "account.content.discarded")
                }
              >
                {t("account.content.discardDraft")}
              </DropdownMenuItem>
            )}
            {Object.keys(text.published).length > 0 && (
              <DropdownMenuItem onSelect={() => setConfirming(true)}>{t("account.content.toDefault")}</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Button
        variant="outline"
        busy={busy === "draft"}
        disabled={busy !== null || !valid || untouched}
        onClick={() => void saveDraft()}
      >
        {t("account.content.saveDraft")}
      </Button>
      <Button busy={busy === "publish"} disabled={busy !== null || !canPublish} onClick={() => void publish()}>
        {t("account.content.publish")}
      </Button>
    </div>
  );

  return (
    <Sheet
      open
      onClose={() => void close()}
      busy={busy !== null}
      title={label ?? t("account.content.editText")}
      description={<code className="font-mono text-xs">{textKey}</code>}
      close={t("account.content.close")}
      footer={footer}
    >
      {failed ? (
        <p className="text-sm text-danger">{t("account.content.failed")}</p>
      ) : !ready || !problems ? (
        <p className="text-sm text-ink-muted">{t("account.loading")}</p>
      ) : (
        <div className="grid gap-6">
          <p className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            <Badge>{t(`account.content.formats.${text.format}`)}</Badge>
            {text.draft && <Badge tone="draft">{t("account.content.draft")}</Badge>}
            <span>
              {text.draft
                ? t("account.content.draftBy", {
                    name: text.draft_by?.name ?? "",
                    at: text.draft_at ? moment(text.draft_at) : "",
                  })
                : text.updated_by
                  ? t("account.content.publishedBy", {
                      name: text.updated_by.name,
                      at: text.updated_at ? moment(text.updated_at) : "",
                    })
                  : t("account.content.unchanged")}
            </span>
          </p>

          {languages.map((language) => {
            const value = values[language];
            const fallback = text.default[language] as TextValue;
            const issue = problems[language];
            const id = `text-${language}`;
            const set = (next: TextValue) => setValues({ ...values, [language]: next });
            const shown = previewing.includes(language);
            return (
              <div key={language} className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor={id} className="text-sm font-medium text-ink">
                    {t(`account.content.languages.${language}`)}
                  </label>
                  {text.format === "markdown" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-pressed={shown}
                      onClick={() =>
                        setPreviewing(shown ? previewing.filter((l) => l !== language) : [...previewing, language])
                      }
                    >
                      {shown ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                      {t("account.content.preview")}
                    </Button>
                  )}
                </div>
                {isPlural(value) && isPlural(fallback) ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(["one", "other"] as const).map((form) => (
                      <label key={form} className="grid gap-1 text-xs text-ink-muted">
                        {t(form === "one" ? "account.content.forms.singular" : "account.content.forms.plural")}
                        <Input
                          id={form === "one" ? id : undefined}
                          aria-label={`${t(`account.content.languages.${language}`)}: ${t(form === "one" ? "account.content.forms.singular" : "account.content.forms.plural")}`}
                          value={value[form]}
                          aria-invalid={issue ? true : undefined}
                          aria-describedby={`${id}-help`}
                          onChange={(event) => set({ ...value, [form]: event.target.value })}
                        />
                      </label>
                    ))}
                  </div>
                ) : shown ? (
                  <div
                    className="rich-text min-h-24 rounded-sm bg-surface-muted p-3 text-sm text-ink"
                    dangerouslySetInnerHTML={{ __html: markdown(preview(value)) }}
                  />
                ) : (
                  <textarea
                    id={id}
                    className={field}
                    rows={text.format === "markdown" ? 6 : Math.min(4, Math.ceil(preview(value).length / 60) || 1)}
                    value={preview(value)}
                    aria-invalid={issue ? true : undefined}
                    aria-describedby={`${id}-help`}
                    onChange={(event) => set(event.target.value)}
                  />
                )}
                <div id={`${id}-help`} className="grid gap-1 text-xs">
                  {issue && (
                    <p className="text-danger">{t(`account.content.problems.${issue.kind}`, { names: issue.names })}</p>
                  )}
                  {!same(value, fallback) && (
                    <p className="text-ink-subtle">
                      {t("account.content.default")}: {words(fallback).join(" / ")}
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          {text.format === "markdown" && <p className="text-xs text-ink-subtle">{t("account.content.markdownHelp")}</p>}

          <details
            className="border-t border-line pt-4 text-sm"
            onToggle={(event) =>
              (event.currentTarget as HTMLDetailsElement).open && versions === null && loadVersions()
            }
          >
            <summary className="cursor-pointer text-ink">{t("account.content.history")}</summary>
            {versions?.length === 0 && <p className="mt-2 text-ink-muted">{t("account.content.noHistory")}</p>}
            <ol className="mt-3 grid gap-3">
              {versions?.map((version) => (
                <li key={version.id} className="grid gap-1 border-l-2 border-line pl-3">
                  <p className="text-xs text-ink-muted">
                    {t(`account.content.states.${version.state}`)} · {version.by.name} · {moment(version.at)}
                  </p>
                  {languages
                    .filter((l) => version.texts[l] !== undefined)
                    .map((l) => (
                      <p key={l} className="line-clamp-2 text-ink">
                        <span className="text-ink-subtle">{l} </span>
                        {words(version.texts[l] as TextValue).join(" / ")}
                      </p>
                    ))}
                  {version.state !== "draft" && Object.keys(version.texts).length > 0 && (
                    <Button
                      variant="link"
                      size="sm"
                      className="justify-self-start px-0"
                      busy={busy === `restore:${version.id}`}
                      disabled={busy !== null}
                      onClick={() =>
                        void act(
                          `restore:${version.id}`,
                          (client, init) => client.restoreText(textKey, { version: version.id }, init),
                          "account.content.restored",
                        )
                      }
                    >
                      {t("account.content.restore")}
                    </Button>
                  )}
                </li>
              ))}
            </ol>
          </details>

          <ConfirmDialog
            open={confirming}
            tone="primary"
            title={t("account.content.toDefaultTitle")}
            body={t("account.content.toDefaultBody")}
            confirm={t("account.content.toDefault")}
            cancel={t("account.content.cancel")}
            onConfirm={() => {
              setConfirming(false);
              void act(
                "default",
                (client, init) => client.restoreText(textKey, { version: null }, init),
                "account.content.restored",
              );
            }}
            onCancel={() => setConfirming(false)}
          />
        </div>
      )}
      {leave.dialog}
    </Sheet>
  );
}
