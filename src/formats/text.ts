import { emptySong, trimLines, type Song } from "../model/song.js";
import { SectionsBuilder } from "./builder.js";
import { parseLabel } from "./labels.js";

/**
 * Testo semplice (solo importazione, decisione 0002): paragrafi separati da
 * righe vuote. Un paragrafo che comincia con un'etichetta ("Strofa 2",
 * "Rit.", "[Bridge]") diventa quella sezione; un'etichetta da sola ripete la
 * sezione; un paragrafo uguale a uno gia' letto e' una ripetizione. Titolo e
 * autori vanno poi completati nell'editor.
 */
export function parsePlainText(text: string, title = ""): Song {
  const builder = new SectionsBuilder();
  const paragraphs = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map(trimLines)
    .filter((p) => p !== "");

  for (const paragraph of paragraphs) {
    const [first = "", ...rest] = paragraph.split("\n");
    const label = parseLabel(first);
    if (label === undefined) {
      builder.add(undefined, undefined, [paragraph]);
      continue;
    }
    const body = trimLines(rest.join("\n"));
    if (body === "") {
      builder.repeat(label.kind, label.number);
      continue;
    }
    builder.add(label.kind, label.number, [body]);
  }
  const { sections, order } = builder.finish();
  return {
    ...emptySong(),
    title: title.trim(),
    ...(sections.length === 0 ? {} : { sections }),
    order,
  };
}
