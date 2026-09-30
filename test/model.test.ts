import { ItemSchema, slideSequence } from "@cuelith/protocol";
import { describe, expect, it } from "vitest";
import {
  checkSong,
  emptySong,
  itemToSong,
  normalizeSong,
  parseOrder,
  parseSectionId,
  songToItem,
  splitSlides,
  stripChords,
  type Song,
} from "../src/model/song.js";

const song: Song = {
  ...emptySong(),
  title: "Santo",
  authors: [{ name: "Anonimo", role: "artist" }],
  ccli: "123456",
  key: "G",
  songbooks: [{ name: "Innario", entry: "12" }],
  sections: [
    { kind: "verse", number: 1, slides: ["[G]Santo, [D]santo", "seconda parte"] },
    { kind: "chorus", number: 1, slides: ["Osanna nell'alto dei cieli"] },
    { kind: "verse", number: 2, slides: ["Benedetto colui che viene"] },
  ],
  order: ["v1", "c1", "v2", "c1"],
};

describe("sezioni e ordine", () => {
  it("riconosce i nomi brevi delle sezioni", () => {
    expect(parseSectionId("V1")).toEqual({ kind: "verse", number: 1 });
    expect(parseSectionId("c")).toEqual({ kind: "chorus", number: 1 });
    expect(parseSectionId("p2")).toEqual({ kind: "pre-chorus", number: 2 });
    expect(parseSectionId("x1")).toBeUndefined();
    expect(parseSectionId("v0")).toBeUndefined();
  });

  it("legge l'ordine scritto dall'operatore", () => {
    expect(parseOrder("V1 C1, v2;C")).toEqual(["v1", "c1", "v2", "c1"]);
  });

  it("divide una sezione in slide con [---]", () => {
    expect(splitSlides("uno\ndue\n[---]\ntre\n")).toEqual(["uno\ndue", "tre"]);
  });

  it("toglie gli accordi dal testo proiettato", () => {
    expect(stripChords("[G]Santo, [D]santo  [Em]")).toBe("Santo, santo");
  });
});

describe("controlli", () => {
  it("titolo, autore e testo sono obbligatori", () => {
    const keys = checkSong(emptySong()).map((i) => i.key);
    expect(keys).toEqual([
      "cuelith.songs.error.titleRequired",
      "cuelith.songs.error.authorRequired",
      "cuelith.songs.error.textRequired",
    ]);
    expect(checkSong(song)).toEqual([]);
  });

  it("l'ordine puo' contenere solo sezioni esistenti", () => {
    const issues = checkSong({ ...song, order: ["v1", "b1"] });
    expect(issues).toEqual([
      { key: "cuelith.songs.error.orderUnknown", params: { section: "B1" } },
    ]);
  });

  it("due sezioni con lo stesso nome non sono ammesse", () => {
    const issues = checkSong({
      ...song,
      sections: [...song.sections, { kind: "verse", number: 1, slides: ["altro"] }],
    });
    expect(issues.map((i) => i.key)).toContain("cuelith.songs.error.duplicateSection");
  });

  it("un ordine uguale a quello delle sezioni non si salva", () => {
    expect(normalizeSong({ ...song, order: ["v1", "c1", "v2"] }).order).toEqual([]);
  });
});

describe("canto <-> elemento", () => {
  it("diventa un elemento valido con gruppi e arrangiamento", () => {
    const item = ItemSchema.parse(songToItem(song));
    expect(item.type).toBe("cuelith.songs.song");
    expect(item.slides.map((s) => s.group)).toEqual(["v1", "v1", "c1", "v2"]);
    expect(item.slides[0]?.fields.text?.value).toBe("Santo, santo");
    expect(item.slides[0]?.fields.chords?.value).toBe("[G]Santo, [D]santo");
    expect(item.slides[2]?.fields.chords).toBeUndefined();
    expect(slideSequence(item).map((s) => s.group)).toEqual(["v1", "v1", "c1", "v2", "c1"]);
    expect(item.credits?.ccli).toBe("123456");
  });

  it("torna identico al canto di partenza", () => {
    expect(itemToSong(songToItem(song))).toEqual(normalizeSong(song));
  });

  it("tiene gli id delle slide esistenti e gli allegati", () => {
    const first = songToItem(song);
    const withAttachment = {
      ...first,
      attachments: [
        {
          mediaId: `${"a".repeat(64)}.mp3`,
          name: "base.mp3",
          kind: "audio" as const,
          role: "backing" as const,
        },
      ],
    };
    const next = songToItem({ ...song, title: "Santo (nuovo)" }, withAttachment);
    expect(next.id).toBe(first.id);
    expect(next.slides.map((s) => s.id)).toEqual(first.slides.map((s) => s.id));
    expect(next.attachments).toHaveLength(1);
  });

  it("un testo semplice diventa un canto a strofe", () => {
    const item = ItemSchema.parse({
      id: "01J0000000000000000000000A",
      type: "core.text",
      title: "Testo",
      slides: [
        { id: "01J0000000000000000000000B", fields: { text: { kind: "text", value: "uno" } } },
        { id: "01J0000000000000000000000C", fields: { text: { kind: "text", value: "due" } } },
      ],
      meta: {},
    });
    expect(itemToSong(item).sections).toEqual([
      { kind: "verse", number: 1, slides: ["uno"] },
      { kind: "verse", number: 2, slides: ["due"] },
    ]);
  });
});
