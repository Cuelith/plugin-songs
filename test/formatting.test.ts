import { describe, expect, it } from "vitest";
import {
  importSongs,
  parseChordPro,
  parseOpenLyrics,
  toChordPro,
  toChordProCollection,
  toOpenLyrics,
} from "../src/formats/index.js";
import { emptySong, type Song } from "../src/model/song.js";

const song: Song = {
  ...emptySong(),
  title: "Santo",
  authors: [{ name: "Anonimo", role: "artist" }],
  sections: [
    {
      kind: "verse",
      number: 1,
      slides: ["[G]Santo, [D]santo", "seconda parte"],
      spans: [
        [
          {
            start: 13,
            end: 18,
            size: 2,
            bold: true,
            color: "#FFD166",
            outline: { width: 4, color: "#000000" },
          },
        ],
        [],
      ],
    },
    { kind: "chorus", number: 1, slides: ["Osanna"] },
  ],
  order: ["v1", "c1", "v1"],
};

const FORMATTED = song.sections[0]?.spans;

describe("formattazione nei file: pulito per tutti, con Cuelith anche le parole formattate", () => {
  it("l'esportazione normale e' pulita: niente di Cuelith in piu'", () => {
    expect(toChordPro(song)).not.toContain("cuelith_format");
    expect(toOpenLyrics(song, { now: new Date(0) })).not.toContain("richtext");
    // Lo stesso testo di un canto senza formattazione: il resto del file non cambia.
    const plain = { ...song, sections: song.sections.map(({ spans: _s, ...rest }) => rest) };
    expect(toChordPro(song)).toBe(toChordPro(plain));
    expect(toOpenLyrics(song, { now: new Date(0) })).toBe(
      toOpenLyrics(plain, { now: new Date(0) }),
    );
  });

  it("ChordPro con la formattazione di Cuelith: una riga {meta: ...} che si rilegge", () => {
    const file = toChordPro(song, { formatting: true });
    expect(file).toMatch(/^\{meta: cuelith_format \{.*\}\}$/m);
    // Il resto del file e' quello del file pulito, piu' quella riga.
    expect(file.replace(/^\{meta: cuelith_format .*\}\n/m, "")).toBe(toChordPro(song));
    const back = parseChordPro(file);
    expect(back.sections[0]?.slides).toEqual(["[G]Santo, [D]santo", "seconda parte"]);
    expect(back.sections[0]?.spans).toEqual([
      [
        {
          start: 13,
          end: 18,
          size: 2,
          bold: true,
          color: "#FFD166",
          outline: { width: 4, color: "#000000" },
        },
      ],
      [],
    ]);
    expect(back.sections[1]?.spans).toBeUndefined();
  });

  it("OpenLyrics con la formattazione di Cuelith: un elemento in piu' che si rilegge", () => {
    const xml = toOpenLyrics(song, { now: new Date(0), formatting: true });
    expect(xml).toContain("<cuelith:richtext");
    // E' ben formato e il testo del canto e' sempre quello (gli accordi anche).
    const back = parseOpenLyrics(xml);
    expect(back.title).toBe("Santo");
    expect(back.sections[0]?.slides).toEqual(["[G]Santo, [D]santo", "seconda parte"]);
    expect(back.sections[0]?.spans?.[0]).toEqual(FORMATTED?.[0]);
    // Senza l'elemento il canto si legge uguale, solo senza formattazione.
    const clean = parseOpenLyrics(toOpenLyrics(song, { now: new Date(0) }));
    expect(clean.sections[0]?.spans).toBeUndefined();
    expect(clean.sections[0]?.slides).toEqual(back.sections[0]?.slides);
  });

  it("un blocco rovinato, sconosciuto o riferito a un testo cambiato non rompe niente", () => {
    const file = toChordPro(song, { formatting: true });
    const broken = file.replace(
      /\{meta: cuelith_format .*\}$/m,
      "{meta: cuelith_format {non json}}",
    );
    expect(parseChordPro(broken).sections[0]?.spans).toBeUndefined();
    expect(parseChordPro(broken).sections[0]?.slides).toEqual([
      "[G]Santo, [D]santo",
      "seconda parte",
    ]);
    const future = file.replace('"v":1', '"v":9');
    expect(parseChordPro(future).sections[0]?.spans).toBeUndefined();
    // Un altro programma ha cambiato il testo: le parole formattate non si applicano a occhi chiusi.
    const edited = file.replace("[G]Santo, [D]santo", "[G]Santo, [D]sacro e santo");
    expect(parseChordPro(edited).sections[0]?.slides[0]).toBe("[G]Santo, [D]sacro e santo");
    expect(parseChordPro(edited).sections[0]?.spans).toBeUndefined();
  });

  it("la copia di sicurezza di tutti i brani tiene anche la formattazione", () => {
    const backup = toChordProCollection([song, { ...song, title: "Altro" }]);
    const songs = importSongs("copia.cho", backup);
    expect(songs).toHaveLength(2);
    expect(songs.map((entry) => entry.song.sections[0]?.spans?.[0]?.[0]?.bold)).toEqual([
      true,
      true,
    ]);
  });

  it("legge la formattazione di altri programmi (grassetto, corsivo, colore) senza toccare il testo", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<song xmlns="http://openlyrics.info/namespace/2009/song" version="0.9">
  <properties><titles><title>Prova</title></titles><authors><author>Tizio</author></authors></properties>
  <lyrics>
    <verse name="v1"><lines>Il <tag name="b">Signore</tag> è <tag name="it">il mio</tag> <tag name="y">pastore</tag><br/>non <tag name="sconosciuto">manco</tag> di nulla</lines></verse>
  </lyrics>
</song>`;
    const parsed = parseOpenLyrics(xml);
    const slide = parsed.sections[0]?.slides[0] ?? "";
    expect(slide).toBe("Il Signore è il mio pastore\nnon manco di nulla");
    const spans = parsed.sections[0]?.spans?.[0] ?? [];
    const words = spans.map((span) => [
      slide.slice(span.start, span.end),
      span.bold,
      span.italic,
      span.color,
    ]);
    expect(words).toEqual([
      ["Signore", true, undefined, undefined],
      ["il mio", undefined, true, undefined],
      ["pastore", undefined, undefined, "#FFD700"],
    ]);
  });
});
