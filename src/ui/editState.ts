import type { Author } from "@cuelith/protocol";
import {
  nextNumber,
  parseOrder,
  formatOrder,
  sectionText,
  splitSlides,
  type Section,
  type SectionKind,
  type Song,
} from "../model/song.js";

// Il canto come lo modifica l'editor: testi e numeri restano stringhe finche'
// si scrive (una riga vuota in fondo non deve sparire mentre si digita).

export interface EditSection {
  readonly key: number;
  readonly kind: SectionKind;
  readonly number: number;
  /** Slide separate dalla riga [---]. */
  readonly text: string;
}

export interface EditAuthor {
  readonly key: number;
  readonly name: string;
  readonly role: Author["role"];
}

export interface EditSongbook {
  readonly key: number;
  readonly name: string;
  readonly entry: string;
}

export interface EditState {
  readonly title: string;
  /** Separati da ";". */
  readonly altTitles: string;
  readonly authors: readonly EditAuthor[];
  readonly copyright: string;
  readonly publisher: string;
  readonly year: string;
  readonly ccli: string;
  readonly creditsShow: Song["creditsShow"];
  readonly key: string;
  readonly tempo: string;
  readonly songbooks: readonly EditSongbook[];
  /** Separati da ",". */
  readonly tags: string;
  readonly comment: string;
  readonly sections: readonly EditSection[];
  /** Come la scrive l'operatore: "V1 C1 V2 C1". */
  readonly order: string;
}

let nextKey = 1;
export const newKey = (): number => nextKey++;

export function fromSong(song: Song): EditState {
  return {
    title: song.title,
    altTitles: song.altTitles.join("; "),
    authors:
      song.authors.length === 0
        ? [{ key: newKey(), name: "", role: "artist" }]
        : song.authors.map((a) => ({ key: newKey(), name: a.name, role: a.role })),
    copyright: song.copyright ?? "",
    publisher: song.publisher ?? "",
    year: song.year === undefined ? "" : String(song.year),
    ccli: song.ccli ?? "",
    creditsShow: song.creditsShow,
    key: song.key ?? "",
    tempo: song.tempo === undefined ? "" : String(song.tempo),
    songbooks: song.songbooks.map((b) => ({ key: newKey(), name: b.name, entry: b.entry ?? "" })),
    tags: song.tags.join(", "),
    comment: song.comment ?? "",
    sections: song.sections.map((s) => ({
      key: newKey(),
      kind: s.kind,
      number: s.number,
      text: sectionText(s),
    })),
    order: formatOrder(song.order),
  };
}

/** { chiave: valore } solo se il valore non e' vuoto. */
function pick<K extends string>(key: K, value: string): Partial<Record<K, string>> {
  return value.trim() === "" ? {} : ({ [key]: value.trim() } as Record<K, string>);
}

export function toSong(state: EditState): Song {
  const year = state.year.trim() === "" ? undefined : Number(state.year.trim());
  const tempo = Number.parseFloat(state.tempo.replace(",", "."));
  const sections: Section[] = state.sections.map((s) => ({
    kind: s.kind,
    number: s.number,
    slides: splitSlides(s.text),
  }));
  return {
    title: state.title,
    altTitles: state.altTitles.split(";"),
    authors: state.authors.map((a) => ({ name: a.name, role: a.role })),
    ...pick("copyright", state.copyright),
    ...pick("publisher", state.publisher),
    ...(year === undefined ? {} : { year }),
    ...pick("ccli", state.ccli),
    creditsShow: state.creditsShow,
    ...pick("key", state.key),
    ...(Number.isFinite(tempo) && tempo > 0 ? { tempo } : {}),
    songbooks: state.songbooks.map((b) => ({
      name: b.name,
      ...(b.entry.trim() === "" ? {} : { entry: b.entry }),
    })),
    ...pick("comment", state.comment),
    tags: state.tags.split(","),
    sections,
    order: parseOrder(state.order),
  };
}

/** Nuova sezione del tipo scelto, col primo numero libero. */
export function addSection(state: EditState, kind: SectionKind): EditState {
  const number = nextNumber(state.sections, kind);
  return { ...state, sections: [...state.sections, { key: newKey(), kind, number, text: "" }] };
}

/** Cambia il tipo di una sezione: prende il primo numero libero del nuovo tipo. */
export function changeKind(state: EditState, key: number, kind: SectionKind): EditState {
  const others = state.sections.filter((s) => s.key !== key);
  return {
    ...state,
    sections: state.sections.map((s) =>
      s.key === key ? { ...s, kind, number: nextNumber(others, kind) } : s,
    ),
  };
}

export function moveSection(state: EditState, key: number, delta: -1 | 1): EditState {
  const index = state.sections.findIndex((s) => s.key === key);
  const target = index + delta;
  if (index === -1 || target < 0 || target >= state.sections.length) return state;
  const sections = [...state.sections];
  const [moved] = sections.splice(index, 1);
  if (moved !== undefined) sections.splice(target, 0, moved);
  return { ...state, sections };
}
