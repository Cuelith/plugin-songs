import { AUTHOR_ROLES, newId, type Item } from "@cuelith/protocol";
import { useEffect, useState, type ReactNode } from "react";
import { toChordPro, toOpenLyrics } from "../formats/index.js";
import {
  checkSong,
  emptySong,
  itemToSong,
  normalizeSong,
  parseOrder,
  projectionOrder,
  SECTION_KINDS,
  SECTION_LABEL,
  sectionId,
  songToItem,
  SLIDE_BREAK,
  splitSlides,
  stripChords,
  type ItemBase,
  type SongIssue,
} from "../model/song.js";
import { readContext } from "./context.js";
import {
  addSection,
  changeKind,
  fromSong,
  moveSection,
  newKey,
  toSong,
  type EditState,
} from "./editState.js";
import { errorKey, usePanel, useT } from "./panel.js";

declare const __SONGS_VERSION__: string;

type Loading =
  | { readonly state: "loading" }
  | { readonly state: "ready"; readonly edit: EditState; readonly base: ItemBase | undefined };

/**
 * Pannello centrale "Editor canti": titolo e autori
 * obbligatori, sezioni tipizzate e numerate, ordine di proiezione, crediti,
 * esportazione in OpenLyrics e ChordPro.
 */
export function EditorPanel() {
  const panel = usePanel();
  const t = useT();
  const [context] = useState(() => readContext(panel.context));
  const [loading, setLoading] = useState<Loading>({ state: "loading" });
  const [dirty, setDirty] = useState(false);
  const [issues, setIssues] = useState<readonly SongIssue[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fromShow = (): Loading | undefined => {
      const item =
        context.showItemId === undefined ? undefined : panel.state.show.items[context.showItemId];
      if (item === undefined) return undefined;
      // Copia nello show senza originale in archivio (es. show di un altro
      // computer): si salva nell'archivio con l'id da cui era stata copiata.
      const { libraryRef, ...rest } = item;
      return {
        state: "ready",
        edit: fromSong(itemToSong(item)),
        base: { ...rest, id: libraryRef?.itemId ?? newId() },
      };
    };
    const load = async (): Promise<Loading> => {
      if (context.libraryItemId !== undefined) {
        try {
          const { item } = await panel.call("library.getItem", { id: context.libraryItemId });
          return { state: "ready", edit: fromSong(itemToSong(item)), base: item };
        } catch (error) {
          const show = fromShow();
          if (show !== undefined) return show;
          throw error;
        }
      }
      return (
        fromShow() ?? {
          state: "ready",
          edit: fromSong(context.draft ?? emptySong()),
          base: undefined,
        }
      );
    };
    load()
      .then((result) => {
        if (!cancelled) setLoading(result);
      })
      .catch((error: unknown) => {
        const { key, params } = errorKey(error);
        void panel.notify(key, params);
        void panel.close();
      });
    return () => {
      cancelled = true;
    };
  }, [panel, context]);

  if (loading.state === "loading") {
    return <p className="s-empty">{t("cuelith.songs.editor.loading")}</p>;
  }
  const { edit, base } = loading;
  const isNew = base === undefined;
  const fromPlaylist = context.showItemId !== undefined;

  const update = (next: EditState) => {
    setLoading({ state: "ready", edit: next, base });
    setDirty(true);
    if (issues.length > 0) setIssues(checkSong(toSong(next)));
  };
  const set = <K extends keyof EditState>(key: K, value: EditState[K]) => {
    update({ ...edit, [key]: value });
  };

  /** Il canto pronto da salvare o esportare; undefined (e problemi mostrati) se manca qualcosa. */
  const ready = () => {
    const song = toSong(edit);
    const found = checkSong(song);
    setIssues(found);
    return found.length === 0 ? normalizeSong(song) : undefined;
  };

  const save = async (addToPlaylist: boolean) => {
    const song = ready();
    if (song === undefined || saving) return;
    setSaving(true);
    try {
      const item: Item = songToItem(song, base);
      await panel.call("library.saveItem", {
        item,
        ...(isNew && context.libraryId !== undefined ? { libraryId: context.libraryId } : {}),
      });
      setLoading({ state: "ready", edit: fromSong(song), base: item });
      setDirty(false);
      if (context.showItemId !== undefined) {
        const copy = panel.state.show.items[context.showItemId];
        if (copy?.libraryRef?.itemId === item.id) {
          await panel.call("item.refreshFromLibrary", { id: context.showItemId });
        } else {
          await panel.notify("cuelith.songs.notice.savedNotLinked");
        }
      }
      if (addToPlaylist) await panel.call("playlist.addFromLibrary", { itemId: item.id });
      await panel.notify(
        addToPlaylist ? "cuelith.songs.notice.savedAdded" : "cuelith.songs.notice.saved",
        { title: song.title },
      );
    } catch (error) {
      const { key, params } = errorKey(error);
      await panel.notify(key, params);
    } finally {
      setSaving(false);
    }
  };

  const exportAs = (format: "openlyrics" | "chordpro") => {
    const song = ready();
    if (song === undefined) return;
    const name = song.title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "canto";
    const promise =
      format === "openlyrics"
        ? panel.saveFile(
            `${name}.xml`,
            toOpenLyrics(song, { version: __SONGS_VERSION__ }),
            "application/xml",
          )
        : panel.saveFile(`${name}.cho`, toChordPro(song), "text/plain");
    promise.catch(() => undefined);
  };

  const close = () => {
    if (dirty) setConfirmClose(true);
    else void panel.close();
  };

  const sectionIds = edit.sections.map(sectionId);
  const order = parseOrder(edit.order);
  const shownOrder = projectionOrder({ sections: edit.sections, order });
  // Cosa vede il pubblico: le slide nell'ordine di proiezione, senza accordi.
  const previewSlides = shownOrder.flatMap((id, position) => {
    const section = edit.sections.find((s) => sectionId(s) === id);
    if (section === undefined) return [];
    return splitSlides(section.text).map((text, index) => ({
      key: `${String(position)}-${String(index)}`,
      id,
      kind: section.kind,
      text: stripChords(text),
    }));
  });
  const jumpTo = (key: number) => {
    document.getElementById(`s-section-${String(key)}`)?.scrollIntoView({ block: "nearest" });
  };

  // Niente <form>: nei pannelli isolati (sandbox senza allow-forms) l'invio e' bloccato.
  return (
    <div
      role="form"
      className="s-editor"
      aria-label={t("cuelith.songs.panel.editor")}
      onKeyDown={(event) => {
        // Ctrl+S salva, come negli altri programmi.
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          void save(false);
        }
      }}
    >
      <header className="s-toolbar">
        <div className="s-grow s-ellipsis">
          <span className="cl-label">
            {isNew ? t("cuelith.songs.editor.new") : t("cuelith.songs.editor.edit")}
          </span>
          {dirty && <span className="s-dirty">{t("cuelith.songs.editor.unsaved")}</span>}
        </div>
        <button
          type="button"
          className="cl-btn s-small"
          onClick={() => {
            exportAs("openlyrics");
          }}
        >
          {t("cuelith.songs.action.exportOpenLyrics")}
        </button>
        <button
          type="button"
          className="cl-btn s-small"
          onClick={() => {
            exportAs("chordpro");
          }}
        >
          {t("cuelith.songs.action.exportChordPro")}
        </button>
        <button type="button" className="cl-btn" onClick={close}>
          {t("cuelith.songs.action.close")}
        </button>
        {!fromPlaylist && (
          <button
            type="button"
            className="cl-btn"
            disabled={saving}
            onClick={() => {
              void save(true);
            }}
          >
            {t("cuelith.songs.action.saveAdd")}
          </button>
        )}
        <button
          type="button"
          className="cl-btn cl-btn--cue"
          disabled={saving}
          onClick={() => {
            void save(false);
          }}
        >
          {t("cuelith.songs.action.save")}
        </button>
      </header>

      {confirmClose && (
        <div
          className="s-confirm"
          role="alertdialog"
          aria-label={t("cuelith.songs.editor.discardTitle")}
        >
          <span className="s-grow">{t("cuelith.songs.editor.discard")}</span>
          <button
            type="button"
            className="cl-btn"
            onClick={() => {
              setConfirmClose(false);
            }}
          >
            {t("cuelith.songs.action.keepEditing")}
          </button>
          <button type="button" className="cl-btn cl-btn--live" onClick={() => void panel.close()}>
            {t("cuelith.songs.action.discard")}
          </button>
        </div>
      )}

      {issues.length > 0 && (
        <ul className="s-issues" role="alert">
          {issues.map((issue) => (
            <li key={`${issue.key}${JSON.stringify(issue.params ?? {})}`}>
              {t(issue.key, issue.params)}
            </li>
          ))}
        </ul>
      )}

      <div className="s-columns">
        <div className="s-main">
          <Field label={t("cuelith.songs.field.title")} required>
            <input
              className="cl-input s-title"
              value={edit.title}
              autoFocus={isNew}
              onChange={(e) => {
                set("title", e.target.value);
              }}
            />
          </Field>
          <fieldset className="s-group">
            <legend className="cl-label">
              {t("cuelith.songs.field.authors")} <span className="s-required">*</span>
            </legend>
            {edit.authors.map((author, index) => (
              <div key={author.key} className="s-row">
                <input
                  className="cl-input s-grow"
                  value={author.name}
                  aria-label={t("cuelith.songs.field.authorName", { n: String(index + 1) })}
                  placeholder={t("cuelith.songs.field.authorPlaceholder")}
                  onChange={(e) => {
                    set(
                      "authors",
                      edit.authors.map((a) =>
                        a.key === author.key ? { ...a, name: e.target.value } : a,
                      ),
                    );
                  }}
                />
                <select
                  className="cl-input"
                  value={author.role}
                  aria-label={t("cuelith.songs.field.authorRole", { n: String(index + 1) })}
                  onChange={(e) => {
                    const role = AUTHOR_ROLES.find((r) => r === e.target.value) ?? "artist";
                    set(
                      "authors",
                      edit.authors.map((a) => (a.key === author.key ? { ...a, role } : a)),
                    );
                  }}
                >
                  {AUTHOR_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {t(`cuelith.songs.role.${role}`)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="cl-btn s-small"
                  aria-label={t("cuelith.songs.action.removeAuthor", { n: String(index + 1) })}
                  disabled={edit.authors.length === 1}
                  onClick={() => {
                    set(
                      "authors",
                      edit.authors.filter((a) => a.key !== author.key),
                    );
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            <div className="s-row s-wrap">
              <button
                type="button"
                className="cl-btn s-small"
                onClick={() => {
                  set("authors", [...edit.authors, { key: newKey(), name: "", role: "artist" }]);
                }}
              >
                {t("cuelith.songs.action.addAuthor")}
              </button>
              {/* Quando l'autore non si conosce: meglio di un segno qualsiasi nei crediti. */}
              <button
                type="button"
                className="cl-btn s-small"
                onClick={() => {
                  const name = t("cuelith.songs.author.unknown");
                  const empty = edit.authors.find((a) => a.name.trim() === "");
                  set(
                    "authors",
                    empty === undefined
                      ? [...edit.authors, { key: newKey(), name, role: "artist" }]
                      : edit.authors.map((a) => (a.key === empty.key ? { ...a, name } : a)),
                  );
                }}
              >
                {t("cuelith.songs.action.unknownAuthor")}
              </button>
            </div>
          </fieldset>

          <fieldset className="s-group">
            <legend
              className="cl-label"
              title={t("cuelith.songs.field.sectionsHint", { mark: SLIDE_BREAK })}
            >
              {t("cuelith.songs.field.sections")} <span className="s-required">*</span>
            </legend>
            <nav className="s-jump" aria-label={t("cuelith.songs.editor.jump")}>
              {edit.sections.map((section) => (
                <button
                  key={section.key}
                  type="button"
                  className="s-jump-chip"
                  data-kind={section.kind}
                  onClick={() => {
                    jumpTo(section.key);
                  }}
                >
                  {sectionId(section).toUpperCase()}
                </button>
              ))}
            </nav>
            {edit.sections.map((section, index) => {
              const id = sectionId(section);
              const duplicate = sectionIds.indexOf(id) !== index;
              return (
                <div
                  key={section.key}
                  id={`s-section-${String(section.key)}`}
                  className="s-section"
                  data-section={id}
                  data-kind={section.kind}
                >
                  <div className="s-row">
                    <span className={`s-badge${duplicate ? " s-badge--error" : ""}`}>
                      {id.toUpperCase()}
                    </span>
                    <select
                      className="cl-input"
                      value={section.kind}
                      aria-label={t("cuelith.songs.field.sectionKind", {
                        section: id.toUpperCase(),
                      })}
                      onChange={(e) => {
                        const kind = SECTION_KINDS.find((k) => k === e.target.value) ?? "verse";
                        update(changeKind(edit, section.key, kind));
                      }}
                    >
                      {SECTION_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {SECTION_LABEL[kind]}
                        </option>
                      ))}
                    </select>
                    <input
                      className="cl-input s-number-input"
                      type="number"
                      min={1}
                      max={99}
                      value={section.number}
                      aria-label={t("cuelith.songs.field.sectionNumber", {
                        section: id.toUpperCase(),
                      })}
                      onChange={(e) => {
                        const number = Math.min(
                          99,
                          Math.max(1, Math.trunc(Number(e.target.value)) || 1),
                        );
                        set(
                          "sections",
                          edit.sections.map((s) => (s.key === section.key ? { ...s, number } : s)),
                        );
                      }}
                    />
                    <span className="s-grow" />
                    <span className="s-slides">
                      {t("cuelith.songs.editor.slides", {
                        count: splitSlides(section.text).filter((x) => x !== "").length,
                      })}
                    </span>
                    <button
                      type="button"
                      className="cl-btn s-small"
                      aria-label={t("cuelith.songs.action.moveUp", { section: id.toUpperCase() })}
                      disabled={index === 0}
                      onClick={() => {
                        update(moveSection(edit, section.key, -1));
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="cl-btn s-small"
                      aria-label={t("cuelith.songs.action.moveDown", { section: id.toUpperCase() })}
                      disabled={index === edit.sections.length - 1}
                      onClick={() => {
                        update(moveSection(edit, section.key, 1));
                      }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="cl-btn s-small"
                      aria-label={t("cuelith.songs.action.removeSection", {
                        section: id.toUpperCase(),
                      })}
                      disabled={edit.sections.length === 1}
                      onClick={() => {
                        set(
                          "sections",
                          edit.sections.filter((s) => s.key !== section.key),
                        );
                      }}
                    >
                      ×
                    </button>
                  </div>
                  <textarea
                    className="cl-input s-text"
                    value={section.text}
                    rows={Math.min(14, Math.max(4, section.text.split("\n").length + 1))}
                    aria-label={t("cuelith.songs.field.sectionText", { section: id.toUpperCase() })}
                    spellCheck={false}
                    onChange={(e) => {
                      set(
                        "sections",
                        edit.sections.map((s) =>
                          s.key === section.key ? { ...s, text: e.target.value } : s,
                        ),
                      );
                    }}
                  />
                </div>
              );
            })}
            <div className="s-row s-wrap">
              {SECTION_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className="cl-btn s-small"
                  onClick={() => {
                    update(addSection(edit, kind));
                  }}
                >
                  + {SECTION_LABEL[kind]}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <aside className="s-side">
          <fieldset className="s-group">
            <legend className="cl-label">{t("cuelith.songs.field.order")}</legend>
            <input
              className="cl-input s-mono"
              value={edit.order}
              aria-label={t("cuelith.songs.field.order")}
              placeholder={t("cuelith.songs.field.orderPlaceholder")}
              onChange={(e) => {
                set("order", e.target.value.toUpperCase());
              }}
            />
            <div className="s-row s-wrap" aria-label={t("cuelith.songs.field.orderAdd")}>
              {[...new Set(sectionIds)].map((id) => (
                <button
                  key={id}
                  type="button"
                  className="cl-btn s-small s-mono"
                  aria-label={t("cuelith.songs.action.orderAppend", { section: id.toUpperCase() })}
                  onClick={() => {
                    set("order", `${edit.order.trim()} ${id.toUpperCase()}`.trim());
                  }}
                >
                  {id.toUpperCase()}
                </button>
              ))}
              <button
                type="button"
                className="cl-btn s-small"
                disabled={edit.order.trim() === ""}
                onClick={() => {
                  set("order", "");
                }}
              >
                {t("cuelith.songs.action.orderAuto")}
              </button>
            </div>
            <p className="s-hint" data-testid="song-order">
              {t("cuelith.songs.field.orderResult")}{" "}
              <span className="s-mono">{shownOrder.map((id) => id.toUpperCase()).join(" → ")}</span>
            </p>
          </fieldset>

          <section className="s-group s-preview" aria-label={t("cuelith.songs.editor.preview")}>
            <h3 className="cl-label">{t("cuelith.songs.editor.preview")}</h3>
            {previewSlides.every((slide) => slide.text === "") ? (
              <p className="s-hint">{t("cuelith.songs.editor.previewEmpty")}</p>
            ) : (
              <ol className="s-slide-list">
                {previewSlides.map((slide) => (
                  <li
                    key={slide.key}
                    className="s-slide"
                    data-section={slide.id}
                    data-kind={slide.kind}
                  >
                    <span className="s-badge s-badge--mini">{slide.id.toUpperCase()}</span>
                    <span className="s-slide-text">{slide.text}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <details className="s-group s-details">
            <summary className="cl-label">{t("cuelith.songs.field.credits")}</summary>
            <Field label={t("cuelith.songs.field.copyright")}>
              <input
                className="cl-input"
                value={edit.copyright}
                onChange={(e) => {
                  set("copyright", e.target.value);
                }}
              />
            </Field>
            <Field label={t("cuelith.songs.field.publisher")}>
              <input
                className="cl-input"
                value={edit.publisher}
                onChange={(e) => {
                  set("publisher", e.target.value);
                }}
              />
            </Field>
            <div className="s-row">
              <Field label={t("cuelith.songs.field.year")}>
                <input
                  className="cl-input"
                  inputMode="numeric"
                  value={edit.year}
                  onChange={(e) => {
                    set("year", e.target.value);
                  }}
                />
              </Field>
              <Field label={t("cuelith.songs.field.ccli")}>
                <input
                  className="cl-input"
                  inputMode="numeric"
                  value={edit.ccli}
                  onChange={(e) => {
                    set("ccli", e.target.value);
                  }}
                />
              </Field>
            </div>
            <Field label={t("cuelith.songs.field.creditsShow")}>
              <select
                className="cl-input"
                value={edit.creditsShow}
                onChange={(e) => {
                  const value = e.target.value;
                  set("creditsShow", value === "none" || value === "first" ? value : "last");
                }}
              >
                <option value="last">{t("cuelith.songs.creditsShow.last")}</option>
                <option value="first">{t("cuelith.songs.creditsShow.first")}</option>
                <option value="none">{t("cuelith.songs.creditsShow.none")}</option>
              </select>
            </Field>
          </details>

          <details className="s-group s-details">
            <summary className="cl-label">{t("cuelith.songs.field.details")}</summary>
            <Field
              label={t("cuelith.songs.field.altTitles")}
              hint={t("cuelith.songs.field.altTitlesHint")}
            >
              <input
                className="cl-input"
                value={edit.altTitles}
                onChange={(e) => {
                  set("altTitles", e.target.value);
                }}
              />
            </Field>

            <div className="s-row">
              <Field label={t("cuelith.songs.field.key")}>
                <input
                  className="cl-input"
                  value={edit.key}
                  onChange={(e) => {
                    set("key", e.target.value);
                  }}
                />
              </Field>
              <Field label={t("cuelith.songs.field.tempo")}>
                <input
                  className="cl-input"
                  inputMode="decimal"
                  value={edit.tempo}
                  onChange={(e) => {
                    set("tempo", e.target.value);
                  }}
                />
              </Field>
            </div>
            <Field label={t("cuelith.songs.field.tags")} hint={t("cuelith.songs.field.tagsHint")}>
              <input
                className="cl-input"
                value={edit.tags}
                onChange={(e) => {
                  set("tags", e.target.value);
                }}
              />
            </Field>
            <span className="cl-label">{t("cuelith.songs.field.songbooks")}</span>
            {edit.songbooks.map((book, index) => (
              <div key={book.key} className="s-row">
                <input
                  className="cl-input s-grow"
                  value={book.name}
                  aria-label={t("cuelith.songs.field.songbookName", { n: String(index + 1) })}
                  placeholder={t("cuelith.songs.field.songbookPlaceholder")}
                  onChange={(e) => {
                    set(
                      "songbooks",
                      edit.songbooks.map((b) =>
                        b.key === book.key ? { ...b, name: e.target.value } : b,
                      ),
                    );
                  }}
                />
                <input
                  className="cl-input s-number-input"
                  value={book.entry}
                  aria-label={t("cuelith.songs.field.songbookEntry", { n: String(index + 1) })}
                  placeholder="#"
                  onChange={(e) => {
                    set(
                      "songbooks",
                      edit.songbooks.map((b) =>
                        b.key === book.key ? { ...b, entry: e.target.value } : b,
                      ),
                    );
                  }}
                />
                <button
                  type="button"
                  className="cl-btn s-small"
                  aria-label={t("cuelith.songs.action.removeSongbook", { n: String(index + 1) })}
                  onClick={() => {
                    set(
                      "songbooks",
                      edit.songbooks.filter((b) => b.key !== book.key),
                    );
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="cl-btn s-small s-self-start"
              onClick={() => {
                set("songbooks", [...edit.songbooks, { key: newKey(), name: "", entry: "" }]);
              }}
            >
              {t("cuelith.songs.action.addSongbook")}
            </button>
            <Field label={t("cuelith.songs.field.comment")}>
              <textarea
                className="cl-input s-text"
                rows={3}
                value={edit.comment}
                onChange={(e) => {
                  set("comment", e.target.value);
                }}
              />
            </Field>
          </details>
        </aside>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  required = false,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    // La spiegazione resta al passaggio del mouse: niente scritte fisse nell'interfaccia.
    <label className="s-field" title={hint}>
      <span className="cl-label">
        {label} {required && <span className="s-required">*</span>}
      </span>
      {children}
    </label>
  );
}
