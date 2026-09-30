import { parseSectionId, type SectionKind } from "../model/song.js";

// Etichette con cui le sezioni compaiono nei testi (italiano e inglese, piu'
// le abbreviazioni diffuse): "Strofa 2", "Rit.", "[Chorus]", "Bridge:", "V1".

const WORDS: ReadonlyMap<string, SectionKind> = new Map([
  ...(["verse", "strofa", "str", "vs", "strophe", "estrofa"] as const).map(
    (w) => [w, "verse"] as const,
  ),
  ...(["chorus", "ritornello", "rit", "coro", "refrain", "ref", "ch", "r"] as const).map(
    (w) => [w, "chorus"] as const,
  ),
  ...(
    [
      "pre-chorus",
      "prechorus",
      "pre chorus",
      "pre-ritornello",
      "preritornello",
      "pre ritornello",
      "pre-rit",
      "pre rit",
      "pre",
      "pc",
    ] as const
  ).map((w) => [w, "pre-chorus"] as const),
  ...(["bridge", "ponte", "br"] as const).map((w) => [w, "bridge"] as const),
  ...(["intro", "introduzione"] as const).map((w) => [w, "intro"] as const),
  ...(["ending", "outro", "finale", "fine", "end", "coda"] as const).map(
    (w) => [w, "ending"] as const,
  ),
  ...(["others", "other", "altro", "interludio", "interlude", "tag"] as const).map(
    (w) => [w, "other"] as const,
  ),
]);

export interface Label {
  readonly kind: SectionKind;
  /** Numero scritto nell'etichetta; assente = il prossimo libero (o una ripetizione). */
  readonly number?: number;
}

/** Riconosce una riga-etichetta; undefined se e' una riga di testo. */
export function parseLabel(line: string): Label | undefined {
  const cleaned = line
    .trim()
    .replace(/^[[(]\s*|\s*[\])]$/g, "")
    .replace(/[:.]+$/, "")
    .trim()
    .toLowerCase();
  if (cleaned === "" || cleaned.length > 24) return undefined;
  const short = parseSectionId(cleaned);
  if (short !== undefined && /\d/.test(cleaned)) return short;
  const match = /^(.*?)[\s.]*(\d{1,3})?$/.exec(cleaned);
  if (match === null) return undefined;
  const [, word = "", digits] = match;
  const kind = WORDS.get(word.replace(/\.$/, "").trim());
  if (kind === undefined) return undefined;
  return digits === undefined ? { kind } : { kind, number: Number(digits) };
}
