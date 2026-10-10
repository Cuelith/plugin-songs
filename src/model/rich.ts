import { joinRich, remapSpans, sliceRich, type RichText, type Span } from "@cuelith/protocol";
import { SLIDE_BREAK, stripChords, trimLines } from "./text.js";

// Parole formattate nei canti (protocollo 1.21): il testo di una sezione resta quello che si
// scrive nell'editor (con gli accordi tra quadre e le righe [---]); le parole formattate
// stanno accanto e seguono il testo in ogni trasformazione che lo accorcia (tagli di spazi,
// accordi tolti, separatori di slide), cosi' arrivano alla slide proiettata nel posto giusto.

/**
 * Per un testo ottenuto da `original` togliendo dei caratteri: la posizione, nell'originale, di
 * ogni carattere rimasto. Se `reduced` non e' ricavabile cosi' (non dovrebbe succedere) non si
 * porta nessuna formattazione: meglio senza che nel posto sbagliato.
 */
export function keepOf(original: string, reduced: string): number[] {
  const keep: number[] = [];
  let at = 0;
  for (const char of reduced) {
    const found = original.indexOf(char, at);
    if (found === -1) return [];
    keep.push(found);
    at = found + 1;
  }
  return keep;
}

/** Applica una trasformazione che toglie caratteri, portando con se' le parole formattate. */
function reduce(rich: RichText, transform: (text: string) => string): RichText {
  const text = transform(rich.text);
  if (rich.spans === undefined || rich.spans.length === 0) return { text };
  const spans = remapSpans(rich.text, rich.spans, keepOf(rich.text, text));
  return spans.length === 0 ? { text } : { text, spans };
}

/** Il testo di una slide senza accordi, come si proietta, con le sue parole formattate. */
export function stripChordsRich(rich: RichText): RichText {
  return reduce(rich, stripChords);
}

/**
 * Il testo di una sezione nell'editor, diviso nelle sue slide (come `splitSlides`), con le parole
 * formattate di ognuna. Con un "a capo" di tipo Windows le posizioni non sono affidabili:
 * in quel caso si perde solo la formattazione, mai il testo.
 */
export function splitSectionRich(text: string, spans: readonly Span[] | undefined): RichText[] {
  const plain = text.replace(/\r\n?/g, "\n");
  const usable = plain === text ? spans : undefined;
  const parts: RichText[] = [];
  let from = 0;
  const push = (end: number): void => {
    parts.push(reduce(sliceRich(plain, usable, from, end), trimLines));
  };
  for (const match of plain.matchAll(/\n?^[ \t]*\[-{3,}\][ \t]*$\n?/gm)) {
    push(match.index);
    from = match.index + match[0].length;
  }
  push(plain.length);
  return parts;
}

/** Le slide di una sezione come un solo testo per l'editor, con la riga [---] tra una e l'altra. */
export function joinSectionRich(
  slides: readonly string[],
  spans: readonly (readonly Span[])[],
): RichText {
  return joinRich(
    slides.map((slide, index) => {
      const own = spans[index];
      return own === undefined || own.length === 0 ? { text: slide } : { text: slide, spans: own };
    }),
    `\n${SLIDE_BREAK}\n`,
  );
}
