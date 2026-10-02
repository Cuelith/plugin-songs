# plugin-songs

Modulo Canti di Cuelith (`cuelith.songs`). Fonte di verità: il documento di progetto e le decisioni in `cuelith-docs` (in particolare 0001 librerie e 0002 formati dei canti).

- Modulo senza processo (`runtime: none`): solo pannelli in iframe isolati che parlano col motore attraverso `@cuelith/panel`. Nessuna rete (`connect-src 'none'`), nessun permesso.
- Un canto è un elemento `cuelith.songs.song`: una slide per ogni parte di sezione, `group` = nome della sezione (`v1`, `c1`, `p1`, `b1`, `i1`, `e1`, `o1`), `arrangement` = ordine di proiezione, accordi ChordPro in linea in `fields.chords`, dati extra in `meta["cuelith.songs"]`.
- Titolo, almeno un autore e il testo sono obbligatori (`checkSong`).
- Formati: OpenLyrics 0.9 (principale) e ChordPro in entrambe le direzioni, testo semplice solo in importazione. Ogni cambio ai formati va con un test di andata e ritorno.
- Testi dell'interfaccia solo come chiavi `cuelith.songs.*` in `locales/it.json` e `locales/en.json` (stesse chiavi, stessi segnaposto); il test del pacchetto fallisce se ne manca una. Le chiavi non ammettono il trattino.
- Durante lo sviluppo l'SDK arriva da `link:../cuelith-sdk/packages/*` (repo affiancati); la CI fa lo stesso.
- `pnpm check` prima di ogni commit; `pnpm build` crea `dist/cuelith.songs-<versione>.cpkg` e stampa impronta e dimensione per il registry.
- Lavoro su `dev`; `main` riceve solo release taggate (SemVer). Il tag `v*` pubblica il pacchetto nella release di GitHub.
- Rispondi al fondatore sempre in italiano.
