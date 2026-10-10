import {
  newId,
  SpanSchema,
  type Attachment,
  type Author,
  type Credits,
  type Item,
  type Slide,
  type Span,
} from "@cuelith/protocol";
import { stripChordsRich } from "./rich.js";
import { SLIDE_BREAK, stripChords, trimLines } from "./text.js";

export { SLIDE_BREAK, stripChords, trimLines };

/** Tipo di elemento dei canti (id del modulo + id locale del tipo). */
export const SONG_TYPE = "cuelith.songs.song";
/** Spazio dei dati del modulo dentro `item.meta`. */
export const META_KEY = "cuelith.songs";

/**
 * Tipi di sezione, come in OpenLyrics: la lettera e' anche il tasto
 * che in diretta porta alla sezione (V C P B I E O).
 */
export const SECTION_KINDS = [
  "verse",
  "chorus",
  "pre-chorus",
  "bridge",
  "intro",
  "ending",
  "other",
] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

export const SECTION_LETTER: Readonly<Record<SectionKind, string>> = {
  verse: "v",
  chorus: "c",
  "pre-chorus": "p",
  bridge: "b",
  intro: "i",
  ending: "e",
  other: "o",
};

/**
 * Nomi delle sezioni: sempre questi, in ogni lingua dell'interfaccia (scelta
 * del fondatore). Non passano dai cataloghi delle traduzioni.
 */
export const SECTION_LABEL: Readonly<Record<SectionKind, string>> = {
  verse: "Verse",
  chorus: "Chorus",
  "pre-chorus": "Pre-Chorus",
  bridge: "Bridge",
  intro: "Intro",
  ending: "Ending",
  other: "Others",
};

const KIND_OF_LETTER = new Map(
  Object.entries(SECTION_LETTER).map(([kind, letter]) => [letter, kind as SectionKind]),
);

export interface Section {
  readonly kind: SectionKind;
  /** Numero della sezione nel suo tipo (strofa 1, strofa 2...). */
  readonly number: number;
  /**
   * Testo di ogni slide della sezione, righe separate da "\n". Gli accordi
   * stanno tra quadre dentro il testo, come in ChordPro: "[G]Santo, [D]santo".
   */
  readonly slides: readonly string[];
  /**
   * Parole formattate di ogni slide (protocollo 1.21), nelle posizioni del testo qui sopra
   * (accordi compresi); una voce per slide, vuota se la slide non ha formattazione.
   */
  readonly spans?: readonly (readonly Span[])[];
}

export interface Songbook {
  readonly name: string;
  readonly entry?: string;
}

export interface Song {
  readonly title: string;
  readonly altTitles: readonly string[];
  readonly authors: readonly Author[];
  readonly copyright?: string;
  readonly publisher?: string;
  readonly year?: number;
  readonly ccli?: string;
  /** Dove le uscite mostrano i crediti. */
  readonly creditsShow: Credits["show"];
  /** Tonalita', es. "G" o "Em". */
  readonly key?: string;
  /** Battiti al minuto. */
  readonly tempo?: number;
  readonly songbooks: readonly Songbook[];
  readonly comment?: string;
  readonly tags: readonly string[];
  readonly sections: readonly Section[];
  /** Ordine di proiezione, es. ["v1","c1","v2","c1"]; vuoto = ordine delle sezioni. */
  readonly order: readonly string[];
}

export function emptySong(): Song {
  return {
    title: "",
    altTitles: [],
    authors: [],
    creditsShow: "last",
    songbooks: [],
    tags: [],
    sections: [{ kind: "verse", number: 1, slides: [""] }],
    order: [],
  };
}

/** Nome breve della sezione, es. "v1", "c2": e' anche il gruppo delle slide. */
export function sectionId(section: Pick<Section, "kind" | "number">): string {
  return `${SECTION_LETTER[section.kind]}${section.number}`;
}

/** "v1" -> { kind: "verse", number: 1 }; "c" vale "c1". */
export function parseSectionId(id: string): { kind: SectionKind; number: number } | undefined {
  const match = /^([vcpbieo])(\d{0,3})$/i.exec(id.trim());
  if (match === null) return undefined;
  const [, letter = "", digits = ""] = match;
  const kind = KIND_OF_LETTER.get(letter.toLowerCase());
  if (kind === undefined) return undefined;
  const number = digits === "" ? 1 : Number(digits);
  return number < 1 ? undefined : { kind, number };
}

/** Testo dell'ordine scritto dall'operatore: "V1 C1 V2 C1" -> ["v1","c1","v2","c1"]. */
export function parseOrder(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .filter((part) => part !== "")
    .map((part) => {
      const parsed = parseSectionId(part);
      return parsed === undefined ? part.toLowerCase() : sectionId(parsed);
    });
}

export function formatOrder(order: readonly string[]): string {
  return order.map((id) => id.toUpperCase()).join(" ");
}

/** Il primo numero libero per un tipo di sezione. */
export function nextNumber(
  sections: readonly Pick<Section, "kind" | "number">[],
  kind: SectionKind,
): number {
  const used = new Set(sections.filter((s) => s.kind === kind).map((s) => s.number));
  let number = 1;
  while (used.has(number)) number++;
  return number;
}

/** Il testo della sezione nell'editor: slide separate dalla riga [---]. */
export function sectionText(section: Pick<Section, "slides">): string {
  return section.slides.join(`\n${SLIDE_BREAK}\n`);
}

export function splitSlides(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n?^[ \t]*\[-{3,}\][ \t]*$\n?/m)
    .map((slide) => trimLines(slide));
}

export function hasChords(text: string): boolean {
  return /\[[^\]\n]+\]/.test(text);
}

// ---------- Controlli ----------

export interface SongIssue {
  /** Chiave di traduzione del modulo. */
  readonly key: string;
  readonly params?: Readonly<Record<string, string>>;
}

/** Quello che manca perche' il canto si possa salvare (decisione 0002). */
export function checkSong(song: Song): SongIssue[] {
  const issues: SongIssue[] = [];
  if (song.title.trim() === "") issues.push({ key: "cuelith.songs.error.titleRequired" });
  if (!song.authors.some((a) => a.name.trim() !== "")) {
    issues.push({ key: "cuelith.songs.error.authorRequired" });
  }
  const filled = song.sections.filter((s) => s.slides.some((slide) => slide.trim() !== ""));
  if (filled.length === 0) issues.push({ key: "cuelith.songs.error.textRequired" });

  const seen = new Set<string>();
  for (const section of song.sections) {
    const id = sectionId(section);
    if (seen.has(id)) {
      issues.push({
        key: "cuelith.songs.error.duplicateSection",
        params: { section: id.toUpperCase() },
      });
    }
    seen.add(id);
  }
  for (const id of new Set(song.order)) {
    if (!seen.has(id)) {
      issues.push({
        key: "cuelith.songs.error.orderUnknown",
        params: { section: id.toUpperCase() },
      });
    }
  }
  if (song.ccli !== undefined && !/^\d{1,10}$/.test(song.ccli)) {
    issues.push({ key: "cuelith.songs.error.ccliInvalid" });
  }
  if (
    song.year !== undefined &&
    (!Number.isInteger(song.year) || song.year < 1000 || song.year > 9999)
  ) {
    issues.push({ key: "cuelith.songs.error.yearInvalid" });
  }
  return issues;
}

/** Sezioni senza testo tolte e ordine ripulito: cosi' si salva. */
export function normalizeSong(song: Song): Song {
  const sections = song.sections
    .map((s) => {
      // Le slide vuote spariscono e con loro le loro parole formattate.
      const kept = s.slides.map((slide, index) => ({ slide: trimLines(slide), index }));
      const filled = kept.filter((entry) => entry.slide !== "");
      const own =
        s.spans === undefined ? undefined : filled.map((entry) => s.spans?.[entry.index] ?? []);
      const { spans: _old, ...rest } = s;
      return {
        ...rest,
        slides: filled.map((entry) => entry.slide),
        ...(own !== undefined && own.some((spans) => spans.length > 0) ? { spans: own } : {}),
      };
    })
    .filter((s) => s.slides.length > 0);
  const ids = new Set(sections.map(sectionId));
  const order = song.order.filter((id) => ids.has(id));
  const natural = sections.map(sectionId);
  const sameAsNatural =
    order.length === natural.length && order.every((id, i) => id === natural[i]);
  return {
    ...song,
    title: song.title.trim(),
    altTitles: song.altTitles.map((t) => t.trim()).filter((t) => t !== ""),
    authors: song.authors.map((a) => ({ ...a, name: a.name.trim() })).filter((a) => a.name !== ""),
    tags: [...new Set(song.tags.map((t) => t.trim()).filter((t) => t !== ""))],
    songbooks: song.songbooks
      .map((b) => ({ name: b.name.trim(), ...(b.entry?.trim() ? { entry: b.entry.trim() } : {}) }))
      .filter((b) => b.name !== ""),
    sections,
    order: sameAsNatural ? [] : order,
  };
}

// ---------- Elemento dello show / dell'archivio ----------

interface SongMeta {
  /**
   * Parole formattate di ogni slide nelle posizioni dell'editor (con gli accordi), per gruppo e
   * numero di slide ("v1:0"): serve a ritrovarle quando si riapre il canto.
   */
  spans?: Record<string, Span[]>;
  key?: string;
  tempo?: number;
  songbooks?: Songbook[];
  comment?: string;
}

/** Quello che l'elemento porta con se' e il canto non modifica. */
export type ItemBase = Pick<Item, "id"> &
  Partial<Pick<Item, "attachments" | "derivedFrom" | "meta" | "slides">>;

/**
 * Canto -> elemento: una slide per ogni parte di sezione, col gruppo = nome
 * della sezione ("v1"); l'ordine di proiezione diventa l'arrangiamento. Le
 * slide che esistevano gia' tengono il loro id (il cursore in diretta resta
 * dov'e').
 */
export function songToItem(input: Song, base?: ItemBase): Item {
  const song = normalizeSong(input);
  const oldIds = new Map<string, string[]>();
  for (const slide of base?.slides ?? []) {
    if (slide.group === undefined) continue;
    oldIds.set(slide.group, [...(oldIds.get(slide.group) ?? []), slide.id]);
  }
  const editorSpans: Record<string, Span[]> = {};
  const slides: Slide[] = song.sections.flatMap((section) => {
    const group = sectionId(section);
    const ids = oldIds.get(group) ?? [];
    return section.slides.map((text, i) => {
      const own = section.spans?.[i] ?? [];
      if (own.length > 0) editorSpans[`${group}:${String(i)}`] = [...own];
      // Sulla slide proiettata le parole formattate stanno dove sono finite senza gli accordi.
      const shown = stripChordsRich(own.length === 0 ? { text } : { text, spans: own });
      return {
        id: ids[i] ?? newId(),
        group,
        fields: {
          text: {
            kind: "text" as const,
            value: shown.text,
            ...(shown.spans === undefined || shown.spans.length === 0
              ? {}
              : { spans: [...shown.spans] }),
          },
          ...(hasChords(text) ? { chords: { kind: "chords" as const, value: text } } : {}),
        },
      };
    });
  });

  const meta: SongMeta = {
    ...(Object.keys(editorSpans).length === 0 ? {} : { spans: editorSpans }),
    ...(song.key === undefined ? {} : { key: song.key }),
    ...(song.tempo === undefined ? {} : { tempo: song.tempo }),
    ...(song.songbooks.length === 0 ? {} : { songbooks: [...song.songbooks] }),
    ...(song.comment === undefined || song.comment.trim() === ""
      ? {}
      : { comment: song.comment.trim() }),
  };
  const credits: Credits = {
    authors: [...song.authors],
    ...(song.altTitles.length === 0 ? {} : { altTitles: [...song.altTitles] }),
    ...(song.copyright?.trim() ? { copyright: song.copyright.trim() } : {}),
    ...(song.publisher?.trim() ? { publisher: song.publisher.trim() } : {}),
    ...(song.year === undefined ? {} : { year: song.year }),
    ...(song.ccli?.trim() ? { ccli: song.ccli.trim() } : {}),
    show: song.creditsShow,
  };
  const attachments: Attachment[] | undefined = base?.attachments;
  return {
    id: base?.id ?? newId(),
    type: SONG_TYPE,
    title: song.title,
    slides,
    ...(song.order.length === 0 ? {} : { arrangement: [...song.order] }),
    meta: { ...(base?.meta ?? {}), [META_KEY]: meta },
    credits,
    ...(song.tags.length === 0 ? {} : { tags: [...song.tags] }),
    ...(attachments === undefined ? {} : { attachments }),
    ...(base?.derivedFrom === undefined ? {} : { derivedFrom: base.derivedFrom }),
  };
}

/** Elemento -> canto (anche un testo semplice, per trasformarlo in canto). */
export function itemToSong(item: Item): Song {
  const meta = readMeta(item.meta[META_KEY]);
  const sections: Section[] = [];
  const byGroup = new Map<string, { slides: string[]; spans: Span[][] }>();
  for (const slide of item.slides) {
    const text = slide.fields.chords?.value ?? slide.fields.text?.value ?? "";
    const parsed = slide.group === undefined ? undefined : parseSectionId(slide.group);
    // Una slide senza sezione riconoscibile (es. da un testo semplice) diventa una strofa.
    const group = parsed === undefined ? `v${nextNumber(sections, "verse")}` : sectionId(parsed);
    let entry = byGroup.get(group);
    if (entry === undefined) {
      entry = { slides: [], spans: [] };
      byGroup.set(group, entry);
      const target = parseSectionId(group) ?? { kind: "verse" as const, number: 1 };
      sections.push({ ...target, slides: entry.slides });
    }
    // Le parole formattate: con gli accordi stanno nei dati del canto (posizioni dell'editor),
    // senza accordi sono quelle del testo proiettato.
    const field = slide.fields.text;
    const projected = field?.kind === "text" ? (field.spans ?? []) : [];
    const own =
      slide.fields.chords === undefined
        ? projected
        : (meta.spans?.[`${group}:${String(entry.slides.length)}`] ?? []);
    entry.slides.push(text);
    entry.spans.push([...own]);
  }
  const credits = item.credits;
  const ids = new Set(sections.map(sectionId));
  return {
    title: item.title,
    altTitles: credits?.altTitles ?? [],
    authors: credits?.authors ?? [],
    ...(credits?.copyright === undefined ? {} : { copyright: credits.copyright }),
    ...(credits?.publisher === undefined ? {} : { publisher: credits.publisher }),
    ...(credits?.year === undefined ? {} : { year: credits.year }),
    ...(credits?.ccli === undefined ? {} : { ccli: credits.ccli }),
    creditsShow: credits?.show ?? "last",
    ...(({ spans: _spans, ...rest }) => rest)(meta),
    songbooks: meta.songbooks ?? [],
    tags: item.tags ?? [],
    sections:
      sections.length === 0
        ? emptySong().sections
        : sections.map((section) => {
            const spans = byGroup.get(sectionId(section))?.spans;
            return spans?.some((own) => own.length > 0) === true ? { ...section, spans } : section;
          }),
    order: (item.arrangement ?? []).filter((id) => ids.has(id)),
  };
}

function readMeta(value: unknown): SongMeta {
  if (typeof value !== "object" || value === null) return {};
  const raw = value as Record<string, unknown>;
  const meta: SongMeta = {};
  if (typeof raw.key === "string") meta.key = raw.key;
  if (typeof raw.tempo === "number") meta.tempo = raw.tempo;
  if (typeof raw.comment === "string") meta.comment = raw.comment;
  if (typeof raw.spans === "object" && raw.spans !== null) {
    const spans: Record<string, Span[]> = {};
    for (const [key, list] of Object.entries(raw.spans)) {
      const parsed = SpanSchema.array().safeParse(list);
      if (parsed.success) spans[key] = parsed.data;
    }
    meta.spans = spans;
  }
  if (Array.isArray(raw.songbooks)) {
    meta.songbooks = raw.songbooks.flatMap((b: unknown) => {
      if (typeof b !== "object" || b === null) return [];
      const { name, entry } = b as Record<string, unknown>;
      if (typeof name !== "string") return [];
      return [{ name, ...(typeof entry === "string" ? { entry } : {}) }];
    });
  }
  return meta;
}

/** L'ordine in cui si proietta: quello scritto o, se vuoto, quello delle sezioni. */
export function projectionOrder(song: {
  readonly sections: readonly Pick<Section, "kind" | "number">[];
  readonly order: readonly string[];
}): string[] {
  return song.order.length > 0 ? [...song.order] : song.sections.map(sectionId);
}
