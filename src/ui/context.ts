import { AUTHOR_ROLES, IdSchema } from "@cuelith/protocol";
import { SECTION_KINDS, type Song } from "../model/song.js";

/** Quello che riceve l'editor quando si apre. */
export interface EditorContext {
  /** Canto dell'archivio da modificare. */
  readonly libraryItemId?: string;
  /** Copia nello show da aggiornare dopo il salvataggio (la passa la postazione). */
  readonly showItemId?: string;
  /** Canto importato da completare (non ancora salvato). */
  readonly draft?: Song;
  /** Libreria in cui mettere un canto nuovo. */
  readonly libraryId?: string;
}

const isId = (value: unknown): value is string => IdSchema.safeParse(value).success;
const isString = (value: unknown): value is string => typeof value === "string";
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isString);

/** Il contesto arriva da fuori (la postazione o l'altro pannello): si controlla. */
export function readContext(value: unknown): EditorContext {
  if (typeof value !== "object" || value === null) return {};
  const raw = value as Record<string, unknown>;
  return {
    ...(isId(raw.libraryItemId) ? { libraryItemId: raw.libraryItemId } : {}),
    ...(isId(raw.showItemId) ? { showItemId: raw.showItemId } : {}),
    ...(isId(raw.libraryId) ? { libraryId: raw.libraryId } : {}),
    ...(isSong(raw.draft) ? { draft: raw.draft } : {}),
  };
}

function isSong(value: unknown): value is Song {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    isString(s.title) &&
    isStringArray(s.altTitles) &&
    isStringArray(s.tags) &&
    isStringArray(s.order) &&
    Array.isArray(s.authors) &&
    s.authors.every(
      (a: unknown) =>
        typeof a === "object" &&
        a !== null &&
        isString((a as Record<string, unknown>).name) &&
        (AUTHOR_ROLES as readonly unknown[]).includes((a as Record<string, unknown>).role),
    ) &&
    Array.isArray(s.songbooks) &&
    Array.isArray(s.sections) &&
    s.sections.every((section: unknown) => {
      if (typeof section !== "object" || section === null) return false;
      const x = section as Record<string, unknown>;
      return (
        (SECTION_KINDS as readonly unknown[]).includes(x.kind) &&
        typeof x.number === "number" &&
        isStringArray(x.slides)
      );
    }) &&
    (s.creditsShow === "none" || s.creditsShow === "first" || s.creditsShow === "last")
  );
}
