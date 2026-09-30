import type { Author } from "@cuelith/protocol";
import {
  emptySong,
  parseOrder,
  sectionId,
  trimLines,
  type Section,
  type SectionKind,
  type Song,
  type Songbook,
} from "../model/song.js";
import { SectionsBuilder } from "./builder.js";
import { EXPORT_LABEL, parseLabel, type Label } from "./labels.js";

// ChordPro (https://www.chordpro.org), formato secondario (decisione 0002):
// testo con accordi tra quadre e direttive tra graffe. Quello che ChordPro
// non prevede (ordine di proiezione, tag, innari) viaggia in {meta: cuelith_...}.

const DIRECTIVE = /^\s*\{\s*([A-Za-z_][\w-]*)(?:\s*[:\s]\s*(.*?))?\s*\}\s*$/;

const SHORT_NAMES: Readonly<Record<string, string>> = {
  t: "title",
  st: "subtitle",
  c: "comment",
  ci: "comment",
  comment_italic: "comment",
  cb: "comment",
  comment_box: "comment",
  highlight: "comment",
  sov: "start_of_verse",
  eov: "end_of_verse",
  soc: "start_of_chorus",
  eoc: "end_of_chorus",
  sob: "start_of_bridge",
  eob: "end_of_bridge",
  sot: "start_of_tab",
  eot: "end_of_tab",
  sog: "start_of_grid",
  eog: "end_of_grid",
};

/** Ambienti che non contengono testo da proiettare. */
const SKIPPED = new Set(["tab", "grid", "abc", "ly", "svg", "textblock", "musicxml"]);

const AUTHOR_DIRECTIVES: Readonly<Record<string, Author["role"]>> = {
  artist: "artist",
  lyricist: "words",
  composer: "music",
  arranger: "arrangement",
  cuelith_translator: "translation",
};

/** Valore di una direttiva: "Strofa 2" oppure label="Strofa 2". */
function labelValue(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const attribute = /label\s*=\s*"([^"]*)"/.exec(value);
  return (attribute?.[1] ?? value).trim();
}

function envKind(name: string): SectionKind | "skip" {
  if (SKIPPED.has(name)) return "skip";
  if (name === "verse" || name === "chorus" || name === "bridge") return name;
  return parseLabel(name.replace(/_/g, " "))?.kind ?? "other";
}

/** Dati del canto letti dalle direttive, prima di sezioni e ordine. */
interface Draft {
  title: string;
  altTitles: string[];
  authors: Author[];
  copyright?: string;
  publisher?: string;
  year?: number;
  ccli?: string;
  creditsShow: Song["creditsShow"];
  key?: string;
  tempo?: number;
  songbooks: Songbook[];
  comment?: string;
  tags: string[];
}

export function parseChordPro(source: string): Song {
  const builder = new SectionsBuilder();
  const song: Draft = {
    title: "",
    altTitles: [],
    authors: [],
    creditsShow: emptySong().creditsShow,
    songbooks: [],
    tags: [],
  };
  let explicitOrder: string[] | undefined;

  let env: { kind: SectionKind | "skip"; number?: number; slides: string[][] } | undefined;
  let loose: string[] = [];
  let pending: Label | undefined;

  const flushLoose = () => {
    const paragraphs = loose
      .join("\n")
      .split(/\n[ \t]*\n/)
      .map(trimLines)
      .filter((p) => p !== "");
    loose = [];
    for (const paragraph of paragraphs) {
      const [first = "", ...rest] = paragraph.split("\n");
      const own = parseLabel(first);
      const label = own ?? pending;
      const body = own === undefined ? paragraph : trimLines(rest.join("\n"));
      pending = undefined;
      if (label === undefined) builder.add(undefined, undefined, [body]);
      else if (body === "") builder.repeat(label.kind, label.number);
      else builder.add(label.kind, label.number, [body]);
    }
  };

  const usePending = () => {
    if (pending !== undefined) builder.repeat(pending.kind, pending.number);
    pending = undefined;
  };

  const finishEnv = () => {
    if (env === undefined) return;
    const current = env;
    env = undefined;
    if (current.kind === "skip") return;
    const slides = current.slides
      .map((lines) => trimLines(lines.join("\n")))
      .filter((s) => s !== "");
    if (slides.length > 0) builder.add(current.kind, current.number, slides);
  };

  const meta = (name: string, value: string) => {
    const key = name.toLowerCase();
    const role = AUTHOR_DIRECTIVES[key];
    if (role !== undefined) {
      song.authors.push({ name: value, role });
      return;
    }
    switch (key) {
      case "title":
        if (song.title === "") song.title = value;
        else song.altTitles.push(value);
        return;
      case "subtitle":
      case "sorttitle":
        song.altTitles.push(value);
        return;
      case "copyright":
        song.copyright = value;
        return;
      case "publisher":
        song.publisher = value;
        return;
      case "year": {
        const year = Number(value);
        if (Number.isInteger(year)) song.year = year;
        return;
      }
      case "key":
        song.key = value;
        return;
      case "tempo": {
        const tempo = Number.parseFloat(value);
        if (Number.isFinite(tempo) && tempo > 0) song.tempo = tempo;
        return;
      }
      case "ccli": {
        const digits = value.replace(/\D/g, "");
        if (digits !== "") song.ccli = digits;
        return;
      }
      case "tag":
      case "cuelith_tag":
        song.tags.push(value);
        return;
      case "cuelith_order":
        explicitOrder = parseOrder(value);
        return;
      case "cuelith_songbook": {
        const [name = "", entry] = value.split("|").map((part) => part.trim());
        if (name !== "") song.songbooks.push(entry ? { name, entry } : { name });
        return;
      }
      case "cuelith_comment":
        song.comment = value;
        return;
      case "cuelith_credits":
        if (value === "none" || value === "first" || value === "last") song.creditsShow = value;
        return;
      default:
        return;
    }
  };

  const lines = source
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  for (const line of lines) {
    if (line.trimStart().startsWith("#")) continue;
    const directive = DIRECTIVE.exec(line);
    if (directive !== null) {
      const raw = (directive[1] ?? "").toLowerCase();
      const name = SHORT_NAMES[raw] ?? raw;
      const value = directive[2]?.trim();

      const start = /^start_of_(.+)$/.exec(name);
      if (start !== null) {
        flushLoose();
        usePending();
        finishEnv();
        const kind = envKind(start[1] ?? "");
        const label = parseLabel(labelValue(value) ?? "");
        env =
          kind === "skip"
            ? { kind, slides: [[]] }
            : {
                kind: label?.kind ?? kind,
                ...(label?.number === undefined ? {} : { number: label.number }),
                slides: [[]],
              };
        continue;
      }
      if (name.startsWith("end_of_")) {
        finishEnv();
        continue;
      }
      if (name === "chorus") {
        flushLoose();
        usePending();
        const label = parseLabel(labelValue(value) ?? "");
        builder.repeat("chorus", label?.number);
        continue;
      }
      if (name === "comment") {
        if (env !== undefined) continue;
        const label = parseLabel(value ?? "");
        if (label !== undefined) {
          flushLoose();
          usePending();
          pending = label;
        }
        continue;
      }
      if (name === "meta" && value !== undefined) {
        const match = /^(\S+)\s+(.+)$/.exec(value);
        if (match !== null) meta(match[1] ?? "", (match[2] ?? "").trim());
        continue;
      }
      if (value !== undefined && value !== "") meta(name, value);
      continue;
    }
    if (env !== undefined) {
      if (line.trim() === "") {
        if ((env.slides.at(-1)?.length ?? 0) > 0) env.slides.push([]);
      } else {
        env.slides.at(-1)?.push(line.trimEnd());
      }
      continue;
    }
    loose.push(line);
  }
  finishEnv();
  flushLoose();
  usePending();

  const { sections, order } = builder.finish();
  const ids = new Set(sections.map(sectionId));
  const useExplicit = explicitOrder !== undefined && explicitOrder.every((id) => ids.has(id));
  return {
    ...song,
    sections: sections.length === 0 ? emptySong().sections : sections,
    order: useExplicit ? (explicitOrder ?? []) : order,
  };
}

// ---------- Esportazione ----------

const ENVIRONMENT: Readonly<Record<SectionKind, string>> = {
  verse: "verse",
  chorus: "chorus",
  "pre-chorus": "verse",
  bridge: "bridge",
  intro: "verse",
  ending: "verse",
  other: "verse",
};

const AUTHOR_EXPORT: Readonly<Record<Author["role"], string>> = {
  artist: "artist",
  words: "lyricist",
  music: "composer",
  arrangement: "arranger",
  translation: "cuelith_translator",
};

function authorLine(author: Author): string {
  const name = oneLine(author.name);
  // ChordPro non ha una direttiva per il traduttore: viaggia come meta.
  return author.role === "translation"
    ? `{meta: cuelith_translator ${name}}`
    : `{${AUTHOR_EXPORT[author.role]}: ${name}}`;
}

const oneLine = (value: string) => value.replace(/\s*\n\s*/g, " ").trim();

function sectionBlock(section: Section): string {
  const env = ENVIRONMENT[section.kind];
  const label = `${EXPORT_LABEL[section.kind]} ${section.number}`;
  return [`{start_of_${env}: ${label}}`, section.slides.join("\n\n"), `{end_of_${env}}`].join("\n");
}

export function toChordPro(song: Song): string {
  const lines: string[] = [`{title: ${oneLine(song.title)}}`];
  for (const alt of song.altTitles) lines.push(`{subtitle: ${oneLine(alt)}}`);
  for (const author of song.authors) {
    lines.push(authorLine(author));
  }
  if (song.copyright) lines.push(`{copyright: ${oneLine(song.copyright)}}`);
  if (song.year !== undefined) lines.push(`{year: ${song.year}}`);
  if (song.key) lines.push(`{key: ${oneLine(song.key)}}`);
  if (song.tempo !== undefined) lines.push(`{tempo: ${song.tempo}}`);
  if (song.ccli) lines.push(`{ccli: ${song.ccli}}`);
  if (song.publisher) lines.push(`{meta: publisher ${oneLine(song.publisher)}}`);
  for (const book of song.songbooks) {
    const entry = book.entry === undefined ? "" : ` | ${oneLine(book.entry)}`;
    lines.push(`{meta: cuelith_songbook ${oneLine(book.name)}${entry}}`);
  }
  for (const tag of song.tags) lines.push(`{meta: cuelith_tag ${oneLine(tag)}}`);
  if (song.comment) lines.push(`{meta: cuelith_comment ${oneLine(song.comment)}}`);
  if (song.order.length > 0) lines.push(`{meta: cuelith_order ${song.order.join(" ")}}`);
  lines.push(`{meta: cuelith_credits ${song.creditsShow}}`);
  return `${lines.join("\n")}\n\n${song.sections.map(sectionBlock).join("\n\n")}\n`;
}
