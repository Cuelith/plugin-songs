import { bindRichText, type RichTextBinding } from "@cuelith/panel";
import { shiftSpans, type Span } from "@cuelith/protocol";
import { useEffect, useRef, useState } from "react";
import { usePanel } from "./panel.js";

/**
 * Casella di testo di una sezione, collegata al plugin Formattazione (se c'e'): descrive al motore
 * il testo e la selezione, e adotta le parole formattate che il plugin annesso chiede. Senza il
 * plugin annesso e' una casella di testo come le altre. Il testo lo scrive solo chi scrive qui.
 */
export function RichTextarea({
  field,
  value,
  spans,
  rows,
  label,
  onChange,
}: {
  /** Nome del testo (unico nel canto): distingue questa casella dalle altre sezioni. */
  field: string;
  value: string;
  spans: readonly Span[];
  rows: number;
  label: string;
  onChange: (value: string, spans: Span[]) => void;
}) {
  const panel = usePanel();
  const binding = useRef<RichTextBinding | undefined>(undefined);
  // Chi ha parlato per ultimo col motore: le altre sezioni restano in ascolto ma non descrivono niente.
  const [active, setActive] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  // L'ultima versione di cio' che serve alla richiesta del plugin annesso, senza ricollegarsi.
  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
  });

  useEffect(() => {
    const bound = bindRichText(panel, field, (next) => {
      latest.current.onChange(latest.current.value, next);
    });
    binding.current = bound;
    return () => {
      bound.end();
      binding.current = undefined;
    };
  }, [panel, field]);

  useEffect(() => {
    if (!active) return;
    binding.current?.update({ text: value, spans, selection });
  }, [active, value, spans, selection]);

  const track = (box: HTMLTextAreaElement): void => {
    setActive(true);
    if (box.selectionStart !== selection.start || box.selectionEnd !== selection.end) {
      setSelection({ start: box.selectionStart, end: box.selectionEnd });
    }
  };

  return (
    <textarea
      className="cl-input s-text"
      value={value}
      rows={rows}
      aria-label={label}
      spellCheck={false}
      onChange={(event) => {
        // Le parole formattate seguono il testo mentre si scrive.
        onChange(event.target.value, shiftSpans(value, event.target.value, spans));
      }}
      onFocus={(event) => {
        track(event.currentTarget);
      }}
      onSelect={(event) => {
        track(event.currentTarget);
      }}
      onKeyUp={(event) => {
        track(event.currentTarget);
      }}
    />
  );
}
