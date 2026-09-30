import { connectPanel } from "@cuelith/panel";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { EditorPanel } from "./EditorPanel.js";
import { PanelContext } from "./panel.js";
import { SongsPanel } from "./SongsPanel.js";
import "./styles.css";

// Un'unica pagina per i due pannelli: la postazione dice quale con ?panel=.
const root = document.getElementById("root");
if (root !== null) {
  void connectPanel().then((panel) => {
    createRoot(root).render(
      <StrictMode>
        <PanelContext.Provider value={panel}>
          {panel.panelId === "editor" ? <EditorPanel /> : <SongsPanel />}
        </PanelContext.Provider>
      </StrictMode>,
    );
  });
}
