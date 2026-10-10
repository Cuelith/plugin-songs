// Funzioni sui testi dei canti, senza altro: stanno qui perche' le usano sia il modello sia le
// parole formattate (rich.ts), e un file solo con tutto creerebbe un giro di importazioni.

/** Riga che divide una sezione in piu' slide. */
export const SLIDE_BREAK = "[---]";

/** Toglie righe vuote in testa e in coda e gli spazi a fine riga. */
export function trimLines(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}

const CHORD = /\[[^\]\n]*\]/g;

/** Il testo senza accordi, come si proietta. */
export function stripChords(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(CHORD, "").replace(/ {2,}/g, " ").trim())
    .join("\n");
}
