import type { Author } from "@cuelith/protocol";
import { XMLParser } from "fast-xml-parser";
import {
  emptySong,
  parseOrder,
  parseSectionId,
  sectionId,
  type Section,
  type Song,
  type Songbook,
} from "../model/song.js";
import { SectionsBuilder } from "./builder.js";

// OpenLyrics 0.9 (https://docs.openlyrics.org), formato principale dei canti
// (decisione 0002): formato aperto letto e scritto da molti programmi.

export const OPENLYRICS_NAMESPACE = "http://openlyrics.info/namespace/2009/song";
/** Oltre questa dimensione un file non e' un canto. */
export const MAX_SONG_FILE = 2 * 1024 * 1024;

type XmlNode = Record<string, unknown>;

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
});

function tagOf(node: XmlNode): string | undefined {
  return Object.keys(node).find((key) => key !== ":@");
}

function childrenOf(node: XmlNode): XmlNode[] {
  const tag = tagOf(node);
  const value = tag === undefined ? undefined : node[tag];
  return Array.isArray(value) ? (value as XmlNode[]) : [];
}

function attrsOf(node: XmlNode): Record<string, string> {
  const raw = node[":@"];
  if (typeof raw !== "object" || raw === null) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
  );
}

function find(nodes: readonly XmlNode[], tag: string): XmlNode[] {
  return nodes.filter((node) => tagOf(node) === tag);
}

function textOf(node: XmlNode): string {
  const tag = tagOf(node);
  if (tag === "#text") return String(node["#text"]);
  return childrenOf(node).map(textOf).join("");
}

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

/** Sigle della struttura degli accordi di OpenLyrics 0.9 -> scrittura comune. */
const STRUCTURE: Readonly<Record<string, string>> = {
  "": "",
  maj: "",
  min: "m",
  dom7: "7",
  maj7: "maj7",
  min7: "m7",
  dim: "dim",
  aug: "aug",
  sus2: "sus2",
  sus4: "sus4",
};

function chordName(attrs: Record<string, string>): string {
  if (attrs.name !== undefined) return attrs.name;
  const root = attrs.root ?? "";
  const structure = attrs.structure ?? "";
  const bass = attrs.bass === undefined ? "" : `/${attrs.bass}`;
  return `${root}${STRUCTURE[structure] ?? structure}${bass}`;
}

/** Contenuto di <lines>: righe con gli accordi in linea ("[G]Santo"). */
function linesText(nodes: readonly XmlNode[]): string {
  let out = "";
  const walk = (list: readonly XmlNode[]) => {
    for (const node of list) {
      const tag = tagOf(node);
      if (tag === "#text") out += String(node["#text"]).replace(/\s+/g, " ");
      else if (tag === "br") out += "\n";
      else if (tag === "comment") continue;
      else if (tag === "chord") {
        const name = chordName(attrsOf(node));
        if (name !== "") out += `[${name}]`;
        walk(childrenOf(node));
      } else walk(childrenOf(node));
    }
  };
  walk(nodes);
  return out
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}

const AUTHOR_TYPES: Readonly<Record<string, Author["role"]>> = {
  words: "words",
  music: "music",
  translation: "translation",
  arrangement: "arrangement",
};

export class SongFormatError extends Error {
  /** Chiave di traduzione del modulo. */
  readonly key: string;
  constructor(key: string) {
    super(key);
    this.name = "SongFormatError";
    this.key = key;
  }
}

export function parseOpenLyrics(xml: string): Song {
  if (xml.length > MAX_SONG_FILE) throw new SongFormatError("cuelith.songs.error.fileTooLarge");
  let document: XmlNode[];
  try {
    document = parser.parse(xml) as XmlNode[];
  } catch {
    throw new SongFormatError("cuelith.songs.error.notOpenLyrics");
  }
  const root = find(document, "song")[0];
  if (root === undefined) throw new SongFormatError("cuelith.songs.error.notOpenLyrics");
  const top = childrenOf(root);
  const properties = childrenOf(find(top, "properties")[0] ?? {});
  const lyrics = childrenOf(find(top, "lyrics")[0] ?? {});
  const one = (tag: string) => {
    const node = find(properties, tag)[0];
    const value = node === undefined ? "" : collapse(textOf(node));
    return value === "" ? undefined : value;
  };
  const list = (group: string, tag: string) =>
    find(properties, group).flatMap((node) => find(childrenOf(node), tag));

  const titles = list("titles", "title")
    .map((node) => collapse(textOf(node)))
    .filter((t) => t !== "");
  const authors: Author[] = list("authors", "author").flatMap((node) => {
    const name = collapse(textOf(node));
    if (name === "") return [];
    return [{ name, role: AUTHOR_TYPES[attrsOf(node).type ?? ""] ?? "artist" }];
  });
  const songbooks: Songbook[] = list("songbooks", "songbook").flatMap((node) => {
    const { name, entry } = attrsOf(node);
    if (name === undefined || name.trim() === "") return [];
    return [{ name: name.trim(), ...(entry?.trim() ? { entry: entry.trim() } : {}) }];
  });
  const tags = list("themes", "theme")
    .map((node) => collapse(textOf(node)))
    .filter((t) => t !== "");
  const comments = list("comments", "comment")
    .map((node) => collapse(textOf(node)))
    .filter((t) => t !== "");

  // Sezioni: si tiene una sola lingua (la prima), le parti "v1a", "v1b"
  // diventano slide della stessa sezione.
  const builder = new SectionsBuilder();
  const verses = find(lyrics, "verse");
  const lang = verses.map((v) => attrsOf(v).lang).find((l) => l !== undefined);
  const baseOf = new Map<string, string>();
  for (const verse of verses) {
    const attrs = attrsOf(verse);
    if (attrs.lang !== undefined && attrs.lang !== lang) continue;
    const name = (attrs.name ?? "").toLowerCase();
    const slides = find(childrenOf(verse), "lines")
      .map((lines) => linesText(childrenOf(lines)))
      .filter((s) => s !== "");
    if (slides.length === 0) continue;
    const match = /^([a-z])(\d*)([a-z]*)$/.exec(name);
    const parsed = parseSectionId(`${match?.[1] ?? "o"}${match?.[2] ?? ""}`);
    const base = parsed === undefined ? undefined : sectionId(parsed);
    if (base !== undefined && (match?.[3] ?? "") !== "" && builder.has(base)) {
      builder.append(base, slides);
      baseOf.set(name, base);
      continue;
    }
    const id = builder.add(parsed?.kind ?? "other", parsed?.number, slides);
    baseOf.set(name, id);
  }
  const { sections, order: sequence } = builder.finish();

  let order = sequence;
  const written = one("verseOrder");
  if (written !== undefined) {
    // "v1a v1b" e' la sezione v1 una volta sola.
    const mapped: string[] = [];
    let previousPart: string | undefined;
    for (const name of written.toLowerCase().split(/\s+/)) {
      const id = baseOf.get(name) ?? parseOrder(name)[0] ?? name;
      const isPart = /^[a-z]\d*[a-z]+$/.test(name);
      if (!(isPart && previousPart === id)) mapped.push(id);
      previousPart = isPart ? id : undefined;
    }
    const ids = new Set(sections.map(sectionId));
    if (mapped.every((id) => ids.has(id))) order = mapped;
  }
  const natural = sections.map(sectionId);
  if (order.length === natural.length && order.every((id, i) => id === natural[i])) order = [];

  const year = Number.parseInt(one("released") ?? "", 10);
  const tempoNode = find(properties, "tempo")[0];
  const tempo = Number.parseFloat(tempoNode === undefined ? "" : textOf(tempoNode));
  const ccli = one("ccliNo")?.replace(/\D/g, "");
  const [title = "", ...altTitles] = titles;
  const copyright = one("copyright");
  const publisher = one("publisher");
  const key = one("key");
  return {
    ...emptySong(),
    title,
    altTitles,
    authors,
    ...(copyright === undefined ? {} : { copyright }),
    ...(publisher === undefined ? {} : { publisher }),
    ...(Number.isInteger(year) && year >= 1000 && year <= 9999 ? { year } : {}),
    ...(ccli === undefined || ccli === "" ? {} : { ccli }),
    ...(key === undefined ? {} : { key }),
    ...(Number.isFinite(tempo) && tempo > 0 ? { tempo } : {}),
    songbooks,
    ...(comments.length === 0 ? {} : { comment: comments.join("\n") }),
    tags,
    sections: sections.length === 0 ? emptySong().sections : sections,
    order,
  };
}

// ---------- Esportazione ----------

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Una riga con accordi in linea -> XML di OpenLyrics. */
function lineXml(line: string): string {
  let out = "";
  let last = 0;
  for (const match of line.matchAll(/\[([^\]\n]*)\]/g)) {
    out += escapeXml(line.slice(last, match.index));
    const name = (match[1] ?? "").trim();
    if (name !== "") out += `<chord name="${escapeXml(name)}"/>`;
    last = match.index + match[0].length;
  }
  return out + escapeXml(line.slice(last));
}

function verseXml(section: Section): string {
  const lines = section.slides
    .map((slide) => `      <lines>${slide.split("\n").map(lineXml).join("<br/>")}</lines>`)
    .join("\n");
  return `    <verse name="${sectionId(section)}">\n${lines}\n    </verse>`;
}

const AUTHOR_EXPORT: Readonly<Record<Author["role"], string>> = {
  artist: "",
  words: ' type="words"',
  music: ' type="music"',
  translation: ' type="translation"',
  arrangement: ' type="arrangement"',
};

export function toOpenLyrics(song: Song, options: { version?: string; now?: Date } = {}): string {
  const app = `Cuelith songs ${options.version ?? ""}`.trim();
  const now = (options.now ?? new Date()).toISOString().replace(/\.\d{3}Z$/, "");
  const p: string[] = [];
  const add = (tag: string, value: string | undefined) => {
    if (value !== undefined && value.trim() !== "")
      p.push(`    <${tag}>${escapeXml(value)}</${tag}>`);
  };
  p.push(
    "    <titles>",
    ...[song.title, ...song.altTitles].map((t) => `      <title>${escapeXml(t)}</title>`),
    "    </titles>",
  );
  if (song.authors.length > 0) {
    p.push(
      "    <authors>",
      ...song.authors.map(
        (a) => `      <author${AUTHOR_EXPORT[a.role]}>${escapeXml(a.name)}</author>`,
      ),
      "    </authors>",
    );
  }
  add("copyright", song.copyright);
  add("ccliNo", song.ccli);
  add("released", song.year === undefined ? undefined : String(song.year));
  add("publisher", song.publisher);
  add("key", song.key);
  if (song.tempo !== undefined) p.push(`    <tempo type="bpm">${song.tempo}</tempo>`);
  if (song.order.length > 0) add("verseOrder", song.order.join(" "));
  if (song.songbooks.length > 0) {
    p.push(
      "    <songbooks>",
      ...song.songbooks.map(
        (b) =>
          `      <songbook name="${escapeXml(b.name)}"${
            b.entry === undefined ? "" : ` entry="${escapeXml(b.entry)}"`
          }/>`,
      ),
      "    </songbooks>",
    );
  }
  if (song.tags.length > 0) {
    p.push(
      "    <themes>",
      ...song.tags.map((t) => `      <theme>${escapeXml(t)}</theme>`),
      "    </themes>",
    );
  }
  if (song.comment !== undefined && song.comment.trim() !== "") {
    p.push(
      "    <comments>",
      ...song.comment
        .split("\n")
        .filter((c) => c.trim() !== "")
        .map((c) => `      <comment>${escapeXml(c.trim())}</comment>`),
      "    </comments>",
    );
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<song xmlns="${OPENLYRICS_NAMESPACE}" version="0.9" createdIn="${escapeXml(app)}" modifiedIn="${escapeXml(app)}" modifiedDate="${now}">`,
    "  <properties>",
    ...p,
    "  </properties>",
    "  <lyrics>",
    ...song.sections.map(verseXml),
    "  </lyrics>",
    "</song>",
    "",
  ].join("\n");
}
