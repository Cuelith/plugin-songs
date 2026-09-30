import { describe, expect, it } from "vitest";
import {
  detectFormat,
  importSong,
  importSongs,
  parseChordPro,
  parseOpenLyrics,
  parsePlainText,
  SongFormatError,
  toChordPro,
  toChordProCollection,
  toOpenLyrics,
} from "../src/formats/index.js";
import { parseLabel } from "../src/formats/labels.js";
import { emptySong, normalizeSong, type Song } from "../src/model/song.js";

const full: Song = normalizeSong({
  ...emptySong(),
  title: "Grande è il Signore & Re",
  altTitles: ["Great is the Lord"],
  authors: [
    { name: "Mario Rossi", role: "words" },
    { name: "Anna <Bianchi>", role: "music" },
    { name: "Coro Insieme", role: "artist" },
    { name: "Luca Verdi", role: "translation" },
  ],
  copyright: '© 2020 Edizioni "Esempio"',
  publisher: "Edizioni Esempio",
  year: 2020,
  ccli: "7654321",
  creditsShow: "first",
  key: "D",
  tempo: 72,
  songbooks: [{ name: "Innario Nuovo", entry: "45" }],
  comment: "Rallentare sull'ultimo ritornello",
  tags: ["lode", "adorazione"],
  sections: [
    { kind: "intro", number: 1, slides: ["[D] [G] [A]"] },
    {
      kind: "verse",
      number: 1,
      slides: ["[D]Grande è il [G]Signore\nDegno di [A]lode", "Nella città del nostro Dio"],
    },
    { kind: "pre-chorus", number: 1, slides: ["E noi cantiamo"] },
    { kind: "chorus", number: 1, slides: ["[G]Gloria, gloria\nal Re dei re"] },
    { kind: "verse", number: 2, slides: ["Seconda strofa"] },
    { kind: "bridge", number: 1, slides: ["Santo, santo"] },
    { kind: "ending", number: 1, slides: ["Amen"] },
  ],
  order: ["i1", "v1", "p1", "c1", "v2", "p1", "c1", "b1", "c1", "e1"],
});

describe("OpenLyrics", () => {
  it("esporta e rilegge lo stesso canto", () => {
    const xml = toOpenLyrics(full, { now: new Date("2026-01-01T00:00:00Z") });
    expect(xml).toContain('<verse name="p1">');
    expect(xml).toContain('<chord name="D"/>Grande è il <chord name="G"/>Signore<br/>');
    expect(xml).toContain("&amp; Re");
    expect(parseOpenLyrics(xml)).toEqual({ ...full, creditsShow: emptySong().creditsShow });
  });

  it("legge un file con parti, accordi 0.9 e piu' lingue", () => {
    const xml = `<?xml version='1.0' encoding='UTF-8'?>
<song xmlns="http://openlyrics.info/namespace/2009/song" version="0.9" createdIn="Esempio 1.0">
  <properties>
    <titles><title>Amazing Grace</title></titles>
    <authors><author>John Newton</author></authors>
    <ccliNo>22025</ccliNo>
    <released>1779-01</released>
    <verseOrder>v1a v1b c v2 c</verseOrder>
  </properties>
  <lyrics>
    <verse name="v1a" lang="en">
      <lines><chord root="G" structure="dom7"/>Amazing grace, how
        sweet the sound<br/>That saved a wretch like me<comment>piano</comment></lines>
    </verse>
    <verse name="v1b" lang="en"><lines>I once was lost</lines></verse>
    <verse name="v1a" lang="it"><lines>Stupenda grazia</lines></verse>
    <verse name="c" lang="en"><lines>My chains are gone</lines></verse>
    <verse name="v2" lang="en"><lines>'Twas grace that taught</lines></verse>
  </lyrics>
</song>`;
    const song = parseOpenLyrics(xml);
    expect(song.title).toBe("Amazing Grace");
    expect(song.authors).toEqual([{ name: "John Newton", role: "artist" }]);
    expect(song.year).toBe(1779);
    expect(song.ccli).toBe("22025");
    expect(song.sections).toEqual([
      {
        kind: "verse",
        number: 1,
        slides: [
          "[G7]Amazing grace, how sweet the sound\nThat saved a wretch like me",
          "I once was lost",
        ],
      },
      { kind: "chorus", number: 1, slides: ["My chains are gone"] },
      { kind: "verse", number: 2, slides: ["'Twas grace that taught"] },
    ]);
    expect(song.order).toEqual(["v1", "c1", "v2", "c1"]);
  });

  it("rifiuta un file che non e' OpenLyrics", () => {
    expect(() => parseOpenLyrics("<html><body/></html>")).toThrow(SongFormatError);
  });
});

describe("ChordPro", () => {
  it("esporta e rilegge lo stesso canto", () => {
    const text = toChordPro(full);
    expect(text).toContain("{start_of_verse: Pre-Chorus 1}");
    expect(text).toContain("{lyricist: Mario Rossi}");
    expect(parseChordPro(text)).toEqual(full);
  });

  it("legge le direttive comuni, {chorus} e i blocchi senza ambiente", () => {
    const song = parseChordPro(`# commento
{t: Come l'aurora}
{st: Aurora}
{artist: Gen Verde}
{key: C}
{soc}
[C]Vieni, [F]Signore
{eoc}

{c: Strofa 1}
Prima strofa

Seconda strofa
{chorus}
{start_of_tab}
e|---0---|
{end_of_tab}
`);
    expect(song.title).toBe("Come l'aurora");
    expect(song.altTitles).toEqual(["Aurora"]);
    expect(song.authors).toEqual([{ name: "Gen Verde", role: "artist" }]);
    expect(song.key).toBe("C");
    expect(song.sections).toEqual([
      { kind: "chorus", number: 1, slides: ["[C]Vieni, [F]Signore"] },
      { kind: "verse", number: 1, slides: ["Prima strofa"] },
      { kind: "verse", number: 2, slides: ["Seconda strofa"] },
    ]);
    expect(song.order).toEqual(["c1", "v1", "v2", "c1"]);
  });
});

describe("testo semplice", () => {
  it("riconosce le etichette italiane e inglesi", () => {
    expect(parseLabel("Rit.")).toEqual({ kind: "chorus" });
    expect(parseLabel("Strofa 2:")).toEqual({ kind: "verse", number: 2 });
    expect(parseLabel("[Pre-Chorus]")).toEqual({ kind: "pre-chorus" });
    expect(parseLabel("V3")).toEqual({ kind: "verse", number: 3 });
    expect(parseLabel("Ponte")).toEqual({ kind: "bridge" });
    expect(parseLabel("Oh Signore")).toBeUndefined();
  });

  it("paragrafi, etichette e ripetizioni", () => {
    const song = parsePlainText(
      "Strofa 1\nPrima riga\nSeconda riga\n\nRit.\nAlleluia\n\nSeconda strofa\n\nRit.\n\nFinale\nAmen\n",
      "Alleluia",
    );
    expect(song.title).toBe("Alleluia");
    expect(song.authors).toEqual([]);
    expect(song.sections).toEqual([
      { kind: "verse", number: 1, slides: ["Prima riga\nSeconda riga"] },
      { kind: "chorus", number: 1, slides: ["Alleluia"] },
      { kind: "verse", number: 2, slides: ["Seconda strofa"] },
      { kind: "ending", number: 1, slides: ["Amen"] },
    ]);
    expect(song.order).toEqual(["v1", "c1", "v2", "c1", "e1"]);
  });

  it("un paragrafo ripetuto uguale e' una ripetizione", () => {
    const song = parsePlainText("uno\n\nGloria\n\ndue\n\nGloria");
    expect(song.sections.map((s) => s.slides[0])).toEqual(["uno", "Gloria", "due"]);
    expect(song.order).toEqual(["v1", "v2", "v3", "v2"]);
  });
});

describe("backup di tutti i canti", () => {
  it("un file ChordPro con {new_song} si rilegge canto per canto", () => {
    const second = normalizeSong({
      ...emptySong(),
      title: "Secondo",
      authors: [{ name: "Anonimo", role: "artist" }],
      sections: [{ kind: "chorus", number: 1, slides: ["Alleluia"] }],
    });
    const file = toChordProCollection([full, second]);
    const songs = importSongs("Canti 2026-09-30.cho", file).map((r) => r.song);
    expect(songs).toEqual([full, second]);
  });
});

describe("importazione", () => {
  it("sceglie il formato da nome e contenuto", () => {
    expect(detectFormat("a.xml", "")).toBe("openlyrics");
    expect(detectFormat("a.txt", "<?xml version='1.0'?><song/>")).toBe("openlyrics");
    expect(detectFormat("a.cho", "testo")).toBe("chordpro");
    expect(detectFormat("a.txt", "{title: X}\ntesto")).toBe("chordpro");
    expect(detectFormat("a.txt", "Strofa 1\ntesto")).toBe("text");
  });

  it("usa il nome del file come titolo quando manca", () => {
    expect(importSong("Santo_subito.txt", "testo").song.title).toBe("Santo subito");
    expect(importSong("x.cho", "{soc}\nciao\n{eoc}").song.title).toBe("x");
  });
});
