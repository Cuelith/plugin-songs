# Canti — modulo di Cuelith

Canti con strofe, ritornelli e ordine di proiezione.

## Cosa fa

- **Scheda «Canti»** nella colonna di sinistra (icona propria): cerca per titolo, testo, autore o numero dell'innario, filtra per libreria.
  - Clic = seleziona, Ctrl+clic e Maiusc+clic = più canti, doppio clic = in anteprima.
  - Barra fissa sulla selezione: **Anteprima · In onda** (senza passare dalla scaletta) · **In scaletta** (anche più canti, nell'ordine scelto) · **Editor**.
- **Editor canti** in una finestra propria (spostabile su un altro schermo): la postazione resta com'è.
  - titolo e almeno un autore obbligatori, titoli alternativi;
  - sezioni con tipo e numero: strofa (V), ritornello (C), pre-ritornello (P), bridge (B), intro (I), finale (E), altro (O);
  - la riga `[---]` divide una sezione in più slide;
  - accordi tra quadre, come in ChordPro: `[G]Santo, [D]santo`. Sulle uscite si vede solo il testo;
  - ordine di proiezione, per esempio `V1 C1 V2 C1 B1 C1`: il ritornello si scrive una volta sola;
  - crediti e copyright (CCLI, editore, anno), tonalità, tempo, innari con numero, tag, note.
- **In diretta** i tasti `V C P B I E O` portano alla prossima sezione di quel tipo.
- **Importazione** di file OpenLyrics (`.xml`), ChordPro (`.cho`, `.chordpro`, `.chopro`, `.crd`, `.pro`) e testo semplice (`.txt`), anche trascinandoli sulla scheda. Nel testo semplice si riconoscono etichette come «Strofa 2», «Rit.», «[Chorus]», «Bridge:».
- **Esportazione** in OpenLyrics 0.9 e ChordPro, formati aperti letti da molti programmi; **«Esporta tutti…»** salva tutti i canti in un unico file ChordPro (backup), che «Importa…» rilegge.

## Sviluppo

I repository di Cuelith stanno affiancati nella stessa cartella: il modulo usa l'SDK da `../cuelith-sdk`.

```sh
pnpm install
pnpm check   # tipi, lint, test
pnpm build   # dist/cuelith.songs-<versione>.cpkg
```

Il pacchetto si installa da Cuelith: **Moduli → Installati → Installa da file…**.

## Licenza

Apache 2.0.
