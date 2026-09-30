import { PanelCallError, type Panel } from "@cuelith/panel";
import { ErrorCode, type MessageParams, type StateDocument } from "@cuelith/protocol";
import { createContext, useCallback, useContext, useSyncExternalStore } from "react";

export const PanelContext = createContext<Panel | null>(null);

export function usePanel(): Panel {
  const panel = useContext(PanelContext);
  if (panel === null) throw new Error("pannello non collegato");
  return panel;
}

let catalogVersion = 0;

/** Testi tradotti; il componente si ridisegna quando cambia la lingua. */
export function useT(): (key: string, params?: MessageParams) => string {
  const panel = usePanel();
  const version = useSyncExternalStore(
    (onChange) =>
      panel.onLanguage(() => {
        catalogVersion++;
        onChange();
      }),
    () => catalogVersion,
  );
  // Una funzione nuova a ogni cambio di lingua: chi la usa si ridisegna.
  return useCallback(
    (key: string, params?: MessageParams) => (version >= 0 ? panel.t(key, params) : key),
    [panel, version],
  );
}

/** Stato dello show, aggiornato a ogni cambio. */
export function usePanelState(): StateDocument {
  const panel = usePanel();
  return useSyncExternalStore(
    (onChange) => panel.onState(onChange),
    () => panel.state,
  );
}

/** Chiave del modulo per un errore di un comando (i testi del nucleo non arrivano ai moduli). */
export function errorKey(error: unknown): { key: string; params: Record<string, string> } {
  if (error instanceof PanelCallError) {
    if (error.code === ErrorCode.Forbidden)
      return { key: "cuelith.songs.error.forbidden", params: {} };
    if (error.code === ErrorCode.NotFound)
      return { key: "cuelith.songs.error.notFound", params: {} };
    return { key: "cuelith.songs.error.call", params: { code: String(error.code) } };
  }
  return { key: "cuelith.songs.error.unexpected", params: {} };
}
