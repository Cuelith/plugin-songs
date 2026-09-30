import type { Library, LibraryItemSummary } from "@cuelith/protocol";
import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  IMPORT_EXTENSIONS,
  importSongs,
  SongFormatError,
  toChordProCollection,
} from "../formats/index.js";
import {
  checkSong,
  itemToSong,
  normalizeSong,
  SONG_TYPE,
  songToItem,
  type Song,
} from "../model/song.js";
import type { EditorContext } from "./context.js";
import { errorKey, usePanel, usePanelState, useT } from "./panel.js";

/** Canti letti per volta dall'archivio durante l'esportazione. */
const PAGE = 200;

interface ImportReport {
  readonly saved: number;
  /** Canti letti a cui manca qualcosa (di solito l'autore): si completano nell'editor. */
  readonly incomplete: readonly { readonly file: string; readonly song: Song }[];
  readonly failed: readonly { readonly file: string; readonly key: string }[];
}

/**
 * Pannello laterale "Canti": cerca nell'archivio i soli canti, li mette in
 * scaletta, apre l'editor, importa file OpenLyrics, ChordPro e testo.
 */
export function SongsPanel() {
  const panel = usePanel();
  const t = useT();
  const libraryRev = usePanelState().live.libraryRev;
  const [query, setQuery] = useState("");
  const [libraryId, setLibraryId] = useState("");
  const [libraries, setLibraries] = useState<readonly Library[]>([]);
  const [items, setItems] = useState<readonly LibraryItemSummary[] | undefined>();
  const [report, setReport] = useState<ImportReport | undefined>();
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const fail = (error: unknown) => {
    const { key, params } = errorKey(error);
    void panel.notify(key, params);
  };

  useEffect(() => {
    let cancelled = false;
    panel
      .call("library.list", {})
      .then(({ libraries: list }) => {
        if (!cancelled) setLibraries(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [panel, libraryRev]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      panel
        .call("library.items", {
          type: SONG_TYPE,
          limit: 300,
          ...(query.trim() === "" ? {} : { query: query.trim() }),
          ...(libraryId === "" ? {} : { libraryId }),
        })
        .then(({ items: list }) => {
          if (!cancelled) setItems(list);
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [panel, query, libraryId, libraryRev]);

  // La libreria scelta puo' essere stata eliminata.
  const selectedLibrary = libraries.some((l) => l.id === libraryId) ? libraryId : "";

  const openEditor = (context: EditorContext) => {
    panel.openPanel("editor", context).catch(fail);
  };

  const addToPlaylist = (item: LibraryItemSummary) => {
    panel
      .call("playlist.addFromLibrary", { itemId: item.id })
      .then(() => panel.notify("cuelith.songs.notice.added", { title: item.title }))
      .catch(fail);
  };

  const importFiles = async (files: readonly File[]) => {
    if (files.length === 0) return;
    setBusy(true);
    let saved = 0;
    const incomplete: { file: string; song: Song }[] = [];
    const failed: { file: string; key: string }[] = [];
    for (const file of files) {
      try {
        // Un file puo' contenere piu' canti (es. il backup di «Esporta tutti»).
        const songs = importSongs(file.name, await file.text());
        for (const [index, { song }] of songs.entries()) {
          const where = songs.length === 1 ? file.name : `${file.name} #${index + 1}`;
          if (checkSong(song).length > 0) {
            incomplete.push({ file: where, song });
            continue;
          }
          await panel.call("library.saveItem", {
            item: songToItem(song),
            ...(selectedLibrary === "" ? {} : { libraryId: selectedLibrary }),
          });
          saved++;
        }
      } catch (error) {
        failed.push({
          file: file.name,
          key: error instanceof SongFormatError ? error.key : errorKey(error).key,
        });
      }
    }
    setBusy(false);
    setReport({ saved, incomplete, failed });
  };

  /** Backup: tutti i canti (o quelli della libreria scelta) in un file ChordPro. */
  const exportAll = async () => {
    setBusy(true);
    try {
      const songs: Song[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const { items: page } = await panel.call("library.items", {
          type: SONG_TYPE,
          limit: PAGE,
          offset,
          ...(selectedLibrary === "" ? {} : { libraryId: selectedLibrary }),
        });
        for (const summary of page) {
          const { item } = await panel.call("library.getItem", { id: summary.id });
          songs.push(normalizeSong(itemToSong(item)));
        }
        if (page.length < PAGE) break;
      }
      if (songs.length === 0) {
        await panel.notify("cuelith.songs.notice.nothingToExport");
        return;
      }
      const day = new Date().toISOString().slice(0, 10);
      await panel.saveFile(`Canti ${day}.cho`, toChordProCollection(songs), "text/plain");
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void importFiles([...event.dataTransfer.files]);
  };

  return (
    <div
      className={`s-songs${dragging ? " s-songs--drop" : ""}`}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => {
        setDragging(false);
      }}
      onDrop={onDrop}
    >
      <div className="s-row">
        <button
          type="button"
          className="cl-btn cl-btn--cue s-grow"
          onClick={() => {
            openEditor(selectedLibrary === "" ? {} : { libraryId: selectedLibrary });
          }}
        >
          {t("cuelith.songs.action.new")}
        </button>
        <button
          type="button"
          className="cl-btn"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          {busy ? t("cuelith.songs.import.busy") : t("cuelith.songs.action.import")}
        </button>
        <button
          type="button"
          className="cl-btn"
          disabled={busy}
          title={t("cuelith.songs.action.exportAllHint")}
          onClick={() => void exportAll()}
        >
          {t("cuelith.songs.action.exportAll")}
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          accept={IMPORT_EXTENSIONS.join(",")}
          data-testid="songs-import"
          onChange={(event) => {
            const files = [...(event.currentTarget.files ?? [])];
            event.currentTarget.value = "";
            void importFiles(files);
          }}
        />
      </div>

      <input
        type="search"
        className="cl-input"
        value={query}
        aria-label={t("cuelith.songs.search.label")}
        placeholder={t("cuelith.songs.search.placeholder")}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      <select
        className="cl-input"
        value={selectedLibrary}
        aria-label={t("cuelith.songs.library.label")}
        onChange={(event) => {
          setLibraryId(event.target.value);
        }}
      >
        <option value="">{t("cuelith.songs.library.all")}</option>
        {libraries.map((library) => (
          <option key={library.id} value={library.id}>
            {library.code === undefined ? library.name : `${library.code} · ${library.name}`}
          </option>
        ))}
      </select>

      {report !== undefined && (
        <ImportResult
          report={report}
          onClose={() => {
            setReport(undefined);
          }}
          onComplete={(song) => {
            setReport((current) =>
              current === undefined
                ? current
                : { ...current, incomplete: current.incomplete.filter((i) => i.song !== song) },
            );
            openEditor({
              draft: song,
              ...(selectedLibrary === "" ? {} : { libraryId: selectedLibrary }),
            });
          }}
        />
      )}

      {items === undefined ? null : items.length === 0 ? (
        <p className="s-empty">
          {query.trim() === "" && selectedLibrary === ""
            ? t("cuelith.songs.empty")
            : t("cuelith.songs.empty.search")}
        </p>
      ) : (
        <ul className="s-list" aria-label={t("cuelith.songs.list.label")}>
          {items.map((item) => (
            <li key={item.entryId ?? item.id} className="s-item">
              <button
                type="button"
                className="s-item-main"
                aria-label={t("cuelith.songs.action.editTo", { title: item.title })}
                onClick={() => {
                  openEditor({ libraryItemId: item.id });
                }}
              >
                <span className="s-item-title">
                  {item.number !== undefined && <span className="s-number">{item.number}</span>}
                  {item.title}
                </span>
                <span className="s-item-sub">
                  {[
                    item.authors.join(", "),
                    ...item.libraries
                      .filter((m) => m.libraryId !== selectedLibrary)
                      .map((m) =>
                        [m.code ?? m.name, m.number].filter((part) => part !== undefined).join(" "),
                      ),
                  ]
                    .filter((part) => part !== "")
                    .join(" · ")}
                </span>
              </button>
              <button
                type="button"
                className="cl-btn s-small"
                aria-label={t("cuelith.songs.action.addTo", { title: item.title })}
                onClick={() => {
                  addToPlaylist(item);
                }}
              >
                {t("cuelith.songs.action.add")}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="s-hint">{t("cuelith.songs.hint.keys")}</p>
    </div>
  );
}

function ImportResult({
  report,
  onClose,
  onComplete,
}: {
  report: ImportReport;
  onClose: () => void;
  onComplete: (song: Song) => void;
}) {
  const t = useT();
  return (
    <section className="s-report cl-panel" aria-label={t("cuelith.songs.import.title")}>
      <div className="s-row">
        <strong className="s-grow">
          {t("cuelith.songs.import.saved", { count: report.saved })}
        </strong>
        <button type="button" className="cl-btn s-small" onClick={onClose}>
          {t("cuelith.songs.action.close")}
        </button>
      </div>
      {report.incomplete.length > 0 && (
        <>
          <p className="s-muted">{t("cuelith.songs.import.incomplete")}</p>
          <ul className="s-plain">
            {report.incomplete.map(({ file, song }) => (
              <li key={file} className="s-row">
                <span className="s-grow s-ellipsis">{song.title || file}</span>
                <button
                  type="button"
                  className="cl-btn s-small"
                  onClick={() => {
                    onComplete(song);
                  }}
                >
                  {t("cuelith.songs.action.complete")}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {report.failed.length > 0 && (
        <ul className="s-plain s-error">
          {report.failed.map(({ file, key }) => (
            <li key={file}>
              {file}: {t(key)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
