import { ItemSchema, slideSequence } from "@cuelith/protocol";
import { describe, expect, it } from "vitest";
import { joinSectionRich, keepOf, splitSectionRich, stripChordsRich } from "../src/model/rich.js";
import {
  emptySong,
  itemToSong,
  normalizeSong,
  songToItem,
  splitSlides,
  type Song,
} from "../src/model/song.js";

const word = (text: string, target: string): { start: number; end: number } => {
  const start = text.indexOf(target);
  return { start, end: start + target.length };
};

describe("parole formattate nei canti", () => {
  it("le slide sono sempre quelle di prima, con o senza formattazione", () => {
    const texts = [
      "[G]Santo, [D]santo\n[---]\nseconda parte",
      "  uno  \n\n[---]\n\n  due  \n",
      "una sola",
      "",
      "a\n[----]\nb\n[---]\nc",
    ];
    for (const text of texts) {
      expect(splitSectionRich(text, undefined).map((part) => part.text)).toEqual(splitSlides(text));
    }
  });

  it("ogni slide porta le sue parole, ritagliate dai separatori e dagli spazi", () => {
    const text = "  uno due  \n[---]\ntre quattro";
    const spans = [
      { ...word(text, "due"), bold: true },
      { ...word(text, "quattro"), size: 2 },
    ];
    const parts = splitSectionRich(text, spans);
    expect(parts.map((part) => part.text)).toEqual(["  uno due", "tre quattro"]);
    for (const part of parts) {
      for (const span of part.spans ?? []) {
        // La formattazione sta sulla parola giusta anche dopo i tagli.
        expect(part.text.slice(span.start, span.end)).toMatch(/^(due|quattro)$/);
      }
    }
    expect(parts[0]?.spans).toEqual([{ start: 6, end: 9, bold: true }]);
    expect(parts[1]?.spans).toEqual([{ start: 4, end: 11, size: 2 }]);
  });

  it("senza accordi: la formattazione resta sulla parola", () => {
    const text = "[G]Il [D]Signore  e' qui";
    const target = word(text, "Signore");
    const shown = stripChordsRich({ text, spans: [{ ...target, bold: true }] });
    expect(shown.text).toBe("Il Signore e' qui");
    expect(shown.spans).toEqual([{ start: 3, end: 10, bold: true }]);
    expect(shown.text.slice(3, 10)).toBe("Signore");
  });

  it("un testo non ricavabile per sola cancellazione non porta formattazione sbagliata", () => {
    expect(keepOf("abc", "abd")).toEqual([]);
    expect(keepOf("abc", "ac")).toEqual([0, 2]);
  });

  it("riunire e dividere una sezione non perde niente", () => {
    const joined = joinSectionRich(
      ["uno due", "tre"],
      [[{ start: 4, end: 7, bold: true }], [{ start: 0, end: 3, italic: true }]],
    );
    expect(joined.text).toBe("uno due\n[---]\ntre");
    const again = splitSectionRich(joined.text, joined.spans);
    expect(again).toEqual([
      { text: "uno due", spans: [{ start: 4, end: 7, bold: true }] },
      { text: "tre", spans: [{ start: 0, end: 3, italic: true }] },
    ]);
  });
});

describe("canto <-> elemento con parole formattate", () => {
  const base: Song = {
    ...emptySong(),
    title: "Santo",
    authors: [{ name: "Anonimo", role: "artist" }],
    sections: [
      {
        kind: "verse",
        number: 1,
        slides: ["[G]Santo, [D]santo", "seconda parte"],
        spans: [[{ start: 3, end: 8, size: 2, bold: true }], []],
      },
      { kind: "chorus", number: 1, slides: ["Osanna"] },
    ],
  };

  it("sulla slide proiettata la parola formattata e' al suo posto (senza gli accordi)", () => {
    const item = songToItem(base);
    expect(ItemSchema.safeParse(item).success).toBe(true);
    const first = slideSequence(item)[0];
    const field = first?.fields["text"];
    expect(field?.kind === "text" && field.value).toBe("Santo, santo");
    expect(field?.kind === "text" && field.spans).toEqual([
      { start: 0, end: 5, size: 2, bold: true },
    ]);
    // Le altre slide non portano formattazione.
    expect(slideSequence(item)[1]?.fields["text"]).toEqual({
      kind: "text",
      value: "seconda parte",
    });
  });

  it("riaprendo il canto le parole formattate tornano dove erano nell'editor (accordi compresi)", () => {
    const back = itemToSong(songToItem(base));
    expect(back.sections[0]?.slides).toEqual(["[G]Santo, [D]santo", "seconda parte"]);
    expect(back.sections[0]?.spans).toEqual([[{ start: 3, end: 8, size: 2, bold: true }], []]);
    // Una sezione senza formattazione non porta niente di piu'.
    expect(back.sections[1]).toEqual({ kind: "chorus", number: 1, slides: ["Osanna"] });
  });

  it("senza accordi le parole formattate sono quelle del testo proiettato", () => {
    const plain: Song = {
      ...base,
      sections: [
        {
          kind: "verse",
          number: 1,
          slides: ["Santo santo"],
          spans: [[{ start: 6, end: 11, italic: true }]],
        },
      ],
    };
    const item = songToItem(plain);
    const field = slideSequence(item)[0]?.fields["text"];
    expect(field?.kind === "text" && field.spans).toEqual([{ start: 6, end: 11, italic: true }]);
    expect(itemToSong(item).sections[0]?.spans).toEqual([[{ start: 6, end: 11, italic: true }]]);
  });

  it("le slide vuote spariscono e con loro la formattazione, senza spostare quella delle altre", () => {
    const song: Song = {
      ...base,
      sections: [
        {
          kind: "verse",
          number: 1,
          slides: ["uno", "   ", "due tre"],
          spans: [
            [{ start: 0, end: 3, bold: true }],
            [{ start: 0, end: 1, bold: true }],
            [{ start: 4, end: 7, size: 2 }],
          ],
        },
      ],
    };
    const normal = normalizeSong(song);
    expect(normal.sections[0]?.slides).toEqual(["uno", "due tre"]);
    expect(normal.sections[0]?.spans).toEqual([
      [{ start: 0, end: 3, bold: true }],
      [{ start: 4, end: 7, size: 2 }],
    ]);
  });

  it("un canto senza formattazione produce lo stesso elemento di sempre", () => {
    const plain = songToItem({
      ...base,
      sections: [{ kind: "verse", number: 1, slides: ["[G]Santo"] }],
    });
    expect(JSON.stringify(plain)).not.toContain("spans");
    expect(plain.meta["cuelith.songs"]).not.toHaveProperty("spans");
  });
});
