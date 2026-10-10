import { SpanSchema, cleanSpans, type Span } from "@cuelith/protocol";
import { sectionId, type Section, type Song } from "../model/song.js";

// Parole formattate nei file dei canti (decisione 0023). Il testo del canto, gli accordi e
// l'ordine restano scritti come li legge qualunque programma (OpenLyrics, ChordPro). La
// formattazione di Cuelith viaggia a parte, in un blocco che gli altri programmi ignorano:
//   - ChordPro: una riga {meta: cuelith_format ...}, come gli altri dati che ChordPro non prevede;
//   - OpenLyrics: un elemento <cuelith:richtext> con un nome tutto nostro.
// Il blocco e' JSON: per ogni slide ("v1:0" = sezione v1, prima slide) le parole formattate nelle
// posizioni del testo scritto nel file e la lunghezza di quel testo, che serve a non applicarle
// a un testo cambiato nel frattempo da un altro programma.

export const FORMAT_VERSION = 1;
export const OPENLYRICS_FORMAT_NAMESPACE = "https://cuelith.lzrhive.it/ns/richtext/1";

export interface FormatExtension {
  readonly v: typeof FORMAT_VERSION;
  readonly s: Record<string, { readonly n: number; readonly spans: Span[] }>;
}

const KEY = /^[a-z]\d{1,3}:\d{1,3}$/;
const SpansSchema = SpanSchema.array();

/** Il blocco letto da un file; `undefined` se non e' fatto come lo scriviamo noi. */
function readExtension(encoded: string): FormatExtension | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(encoded);
  } catch {
    return undefined;
  }
  if (typeof raw !== "object" || raw === null) return undefined;
  const { v, s } = raw as { v?: unknown; s?: unknown };
  if (v !== FORMAT_VERSION || typeof s !== "object" || s === null) return undefined;
  const entries: FormatExtension["s"] = {};
  for (const [key, entry] of Object.entries(s)) {
    if (!KEY.test(key) || typeof entry !== "object" || entry === null) continue;
    const { n, spans } = entry as { n?: unknown; spans?: unknown };
    const parsed = SpansSchema.safeParse(spans);
    if (typeof n === "number" && Number.isInteger(n) && parsed.success) {
      entries[key] = { n, spans: parsed.data };
    }
  }
  return { v: FORMAT_VERSION, s: entries };
}

const keyOf = (section: Pick<Section, "kind" | "number">, index: number): string =>
  `${sectionId(section)}:${String(index)}`;

/** Le parole formattate del canto, pronte da scrivere; niente se non ce ne sono. */
export function formatExtensionOf(song: Song): FormatExtension | undefined {
  const entries: FormatExtension["s"] = {};
  for (const section of song.sections) {
    section.slides.forEach((slide, index) => {
      const spans = cleanSpans(slide, section.spans?.[index]);
      if (spans.length > 0) entries[keyOf(section, index)] = { n: slide.length, spans };
    });
  }
  return Object.keys(entries).length === 0 ? undefined : { v: FORMAT_VERSION, s: entries };
}

/** Il blocco come testo (una riga, senza a capo): `undefined` se il canto non ha formattazione. */
export function encodeFormat(song: Song): string | undefined {
  const extension = formatExtensionOf(song);
  return extension === undefined ? undefined : JSON.stringify(extension);
}

/**
 * Rimette le parole formattate nel canto letto da un file. Un blocco rovinato, di una versione che
 * non conosciamo, o riferito a un testo diverso da quello del file, non fa mai errore: quella
 * slide resta senza formattazione.
 */
export function applyFormat(song: Song, encoded: string | undefined): Song {
  if (encoded === undefined || encoded.trim() === "") return song;
  const parsed = readExtension(encoded);
  if (parsed === undefined) return song;
  const sections = song.sections.map((section) => {
    const spans: (readonly Span[])[] = section.slides.map((slide, index) => {
      const entry = parsed.s[keyOf(section, index)];
      if (entry === undefined || entry.n !== slide.length) return [];
      return cleanSpans(slide, entry.spans);
    });
    return spans.some((own) => own.length > 0) ? { ...section, spans } : section;
  });
  return sections.some((section, index) => section !== song.sections[index])
    ? { ...song, sections }
    : song;
}
