import { nextNumber, sectionId, type Section, type SectionKind } from "../model/song.js";

/**
 * Raccoglie le sezioni lette da un file e l'ordine in cui compaiono. Una
 * sezione ripetuta (lo stesso ritornello scritto di nuovo, o "{chorus}")
 * diventa una ripetizione nell'ordine invece di una sezione in piu'.
 */
export class SectionsBuilder {
  private readonly sections: { kind: SectionKind; number: number; slides: string[] }[] = [];
  private readonly sequence: string[] = [];

  /** Aggiunge una sezione; restituisce il suo nome ("c1"). */
  add(
    kind: SectionKind | undefined,
    number: number | undefined,
    slides: readonly string[],
  ): string {
    const text = slides.join("\n\n");
    // Testo identico a una sezione gia' letta: e' una ripetizione.
    const same = this.sections.find(
      (s) => (kind === undefined || s.kind === kind) && s.slides.join("\n\n") === text,
    );
    if (same !== undefined && (number === undefined || same.number === number)) {
      const id = sectionId(same);
      this.sequence.push(id);
      return id;
    }
    const finalKind = kind ?? "verse";
    const taken =
      number !== undefined &&
      this.sections.some((s) => s.kind === finalKind && s.number === number);
    const section = {
      kind: finalKind,
      number: number === undefined || taken ? nextNumber(this.sections, finalKind) : number,
      slides: [...slides],
    };
    this.sections.push(section);
    const id = sectionId(section);
    this.sequence.push(id);
    return id;
  }

  /** Ripete una sezione gia' letta (la numero indicata o l'ultima di quel tipo). */
  repeat(kind: SectionKind, number?: number): boolean {
    const matches = this.sections.filter(
      (s) => s.kind === kind && (number === undefined || s.number === number),
    );
    const last = matches.at(-1);
    if (last === undefined) return false;
    this.sequence.push(sectionId(last));
    return true;
  }

  /** Aggiunge slide all'ultima sezione (es. le parti "v1a", "v1b" di OpenLyrics). */
  append(id: string, slides: readonly string[]): boolean {
    const section = this.sections.find((s) => sectionId(s) === id);
    if (section === undefined) return false;
    section.slides.push(...slides);
    return true;
  }

  has(id: string): boolean {
    return this.sections.some((s) => sectionId(s) === id);
  }

  /** Sezioni e ordine; l'ordine resta vuoto se coincide con quello delle sezioni. */
  finish(): { sections: Section[]; order: string[] } {
    const sections = this.sections.map((s) => ({ ...s, slides: [...s.slides] }));
    const natural = sections.map(sectionId);
    const same =
      this.sequence.length === natural.length && this.sequence.every((id, i) => id === natural[i]);
    return { sections, order: same ? [] : [...this.sequence] };
  }
}
