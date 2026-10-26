import { useEffect, useRef, useState } from "react";
import type { DocumentOut } from "@idea-agro/api-client";
import { Download, FileImage, FileSpreadsheet, FileText, Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { iconSize } from "@/design/tokens";
import { intlLocale, type Locale } from "@/i18n/core";
import type { createAppTranslator } from "@/components/explorer/lib/i18n";

type Props = {
  t: ReturnType<typeof createAppTranslator>["t"];
  locale: Locale;
  zoneId: string;
  /** Members reach the zone through a project; only its owner attaches and deletes. */
  project?: string;
  own: boolean;
};

const api = () => Promise.all([import("@/lib/account"), import("@idea-agro/api-client")]);

/** What the API takes; the picker offers only these. */
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.xlsx,.xls,.ods,.docx,.odt";
/** The API's limit per file: a larger one is refused before it travels. */
const MAX_BYTES = 10_000_000;

function Glyph({ type }: { type: string }) {
  const Icon = type.startsWith("image/") ? FileImage : /sheet|excel|csv/.test(type) ? FileSpreadsheet : FileText;
  return <Icon size={iconSize.md} aria-hidden="true" className="shrink-0 text-ink-subtle" />;
}

/** Files kept with a saved zone, such as soil studies: its owner attaches them, its projects' members read them. */
export default function ZoneDocuments({ t, locale, zoneId, project, own }: Props) {
  const [documents, setDocuments] = useState<DocumentOut[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [news, setNews] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const attachButton = useRef<HTMLButtonElement>(null);
  const { ask, dialog } = useConfirm(t("zone.documents.cancel"));
  // The library route answers only the owner; members reach the zone through the project.
  const viaProject = !own && project ? project : null;

  useEffect(() => {
    void api()
      .then(([{ privately }, client]) =>
        privately((init) =>
          viaProject
            ? client.listProjectZoneDocuments(viaProject, zoneId, init)
            : client.listSavedZoneDocuments(zoneId, init),
        ),
      )
      .then((response) => setDocuments(response.status === 200 ? response.data : null))
      .catch(() => setDocuments(null));
  }, [zoneId, viaProject]);

  if (!documents || (!own && !documents.length)) return null;

  const size = (bytes: number) =>
    new Intl.NumberFormat(intlLocale[locale], {
      style: "unit",
      unit: bytes < 1e6 ? "kilobyte" : "megabyte",
      maximumFractionDigits: 1,
    }).format(bytes < 1e6 ? Math.max(bytes / 1e3, 0.1) : bytes / 1e6);
  const when = (value: string) =>
    new Intl.DateTimeFormat(intlLocale[locale], { dateStyle: "medium" }).format(new Date(value));

  const upload = async (file: File) => {
    setProblem(null);
    setNews("");
    if (file.size > MAX_BYTES) return setProblem(t("zone.documents.tooLarge"));
    if (!file.size) return setProblem(t("zone.documents.emptyFile"));
    setBusy(true);
    try {
      const [{ privately }, client] = await api();
      const response = await privately((init) => client.attachSavedZoneDocument(zoneId, { file }, init));
      if (response.status === 201) {
        const added = response.data;
        setDocuments((now) => [...(now ?? []), added]);
        setNews(t("zone.documents.attached", { name: added.name }));
      } else
        setProblem(
          response.status === 413
            ? t("zone.documents.tooLarge")
            : response.status === 415
              ? t("zone.documents.unsupported")
              : response.status === 409
                ? t("zone.documents.full")
                : response.status === 422
                  ? t("zone.documents.badName")
                  : t("zone.documents.failed"),
        );
    } catch {
      setProblem(t("zone.documents.failed"));
    }
    setBusy(false);
  };

  const download = async (document: DocumentOut) => {
    setProblem(null);
    try {
      const [{ privately }, client] = await api();
      const path = viaProject
        ? client.getGetProjectZoneDocumentUrl(viaProject, zoneId, document.id)
        : client.getGetSavedZoneDocumentUrl(zoneId, document.id);
      const response = await privately((init) => fetch(client.apiUrl(path), init));
      if (!response.ok) return setProblem(t("zone.documents.failed"));
      const url = URL.createObjectURL(await response.blob());
      Object.assign(window.document.createElement("a"), { href: url, download: document.name }).click();
      // Some browsers start the download after the click returns: the address waits a moment.
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setProblem(t("zone.documents.failed"));
    }
  };

  const remove = async (document: DocumentOut) => {
    const yes = await ask({
      title: t("zone.documents.confirmTitle"),
      body: t("zone.documents.confirmBody", { name: document.name }),
      confirm: t("zone.documents.delete"),
      tone: "danger",
    });
    if (!yes) return;
    setProblem(null);
    try {
      const [{ privately }, client] = await api();
      const response = await privately((init) => client.deleteSavedZoneDocument(zoneId, document.id, init));
      if (response.status !== 204) return setProblem(t("zone.documents.failed"));
      setDocuments((now) => (now ?? []).filter((d) => d.id !== document.id));
      // Its row is gone: focus waits on the button that adds documents, once the list has changed.
      requestAnimationFrame(() => attachButton.current?.focus());
    } catch {
      setProblem(t("zone.documents.failed"));
    }
  };

  return (
    <section aria-labelledby="zone-documents" className="mt-6 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="zone-documents" className="font-medium text-ink">
          {t("zone.documents.title")}
          {documents.length > 0 && <span className="ml-1 text-ink-subtle">({documents.length})</span>}
        </h2>
        {own && (
          <>
            <input
              ref={picker}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void upload(file);
              }}
            />
            <Button
              ref={attachButton}
              size="sm"
              variant="outline"
              // Disabled, the button would drop the focus it has while the file uploads.
              aria-disabled={busy}
              onClick={() => !busy && picker.current?.click()}
            >
              <Paperclip size={iconSize.sm} aria-hidden="true" />
              {busy ? t("zone.documents.uploading") : t("zone.documents.attach")}
            </Button>
          </>
        )}
      </div>
      {documents.length === 0 ? (
        <p className="mt-2 max-w-prose text-ink-muted">{t("zone.documents.empty")}</p>
      ) : (
        <ul className="mt-3 grid divide-y divide-line">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2">
              <Glyph type={d.media_type} />
              <div className="min-w-0 grow">
                <p className="truncate text-ink">{d.name}</p>
                <p className="text-xs text-ink-subtle">
                  {[size(d.size), when(d.uploaded_at), d.uploaded_by].filter(Boolean).join(" · ")}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t("zone.documents.download", { name: d.name })}
                onClick={() => void download(d)}
              >
                <Download size={iconSize.sm} aria-hidden="true" />
              </Button>
              {own && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("zone.documents.deleteNamed", { name: d.name })}
                  onClick={() => void remove(d)}
                >
                  <Trash2 size={iconSize.sm} aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p role="alert" className="mt-2 text-danger empty:hidden">
        {problem ?? ""}
      </p>
      <p role="status" className="sr-only">
        {news}
      </p>
      {dialog}
    </section>
  );
}
