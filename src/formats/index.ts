import type { Song } from "../model/song.js";
import { parseChordPro } from "./chordpro.js";
import { MAX_SONG_FILE, parseOpenLyrics, SongFormatError } from "./openlyrics.js";
import { parsePlainText } from "./text.js";

export { parseChordPro, toChordPro } from "./chordpro.js";
export { parseOpenLyrics, SongFormatError, toOpenLyrics } from "./openlyrics.js";
export { parsePlainText } from "./text.js";

export type SongFormat = "openlyrics" | "chordpro" | "text";

/** Estensioni accettate dall'importazione (anche per il selettore dei file). */
export const IMPORT_EXTENSIONS = [
  ".xml",
  ".olyrics",
  ".cho",
  ".chordpro",
  ".chopro",
  ".crd",
  ".pro",
  ".txt",
] as const;

const CHORDPRO = new Set([".cho", ".chordpro", ".chopro", ".crd", ".pro"]);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

/** Il formato di un file, dal nome e dal contenuto. */
export function detectFormat(name: string, content: string): SongFormat {
  const extension = extensionOf(name);
  const start = content.replace(/^\uFEFF/, "").trimStart();
  if (extension === ".xml" || extension === ".olyrics" || start.startsWith("<")) {
    return "openlyrics";
  }
  if (CHORDPRO.has(extension) || /^\s*\{\s*(?:title|t|start_of_\w+|sov|soc)\s*[:}]/im.test(start)) {
    return "chordpro";
  }
  return "text";
}

/** Nome del file senza estensione: il titolo di un testo semplice. */
export function baseName(name: string): string {
  const file = name.split(/[\\/]/).pop() ?? name;
  const dot = file.lastIndexOf(".");
  return (dot > 0 ? file.slice(0, dot) : file).replace(/[_]+/g, " ").trim();
}

/** Legge un canto da un file in uno dei formati accettati. */
export function importSong(name: string, content: string): { song: Song; format: SongFormat } {
  if (content.length > MAX_SONG_FILE) throw new SongFormatError("cuelith.songs.error.fileTooLarge");
  const format = detectFormat(name, content);
  if (format === "openlyrics") return { song: parseOpenLyrics(content), format };
  if (format === "chordpro") {
    const song = parseChordPro(content);
    return { song: song.title === "" ? { ...song, title: baseName(name) } : song, format };
  }
  return { song: parsePlainText(content, baseName(name)), format };
}
