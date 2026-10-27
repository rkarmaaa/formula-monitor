# CLAUDE.md — Formula Monitor

Guida per chi (persona o Claude) lavora su questo repository. Lo **stile** segue le regole SCSS di Nuvola GO
(plugin `nuvola-go`, skill `nuvola-go:regole` §2 e `scss.md`): token, `respond()`, nesting al 100%, una root
per partial, niente `--`/`__`, niente `<style>`. Design system: `DESIGN-SYSTEM.md` · protocollo: `docs/UDP-F1-25.md`
· dati: `docs/DATI.md`.

## 1. Overview

- **Prodotto:** cruscotto live per la telemetria UDP di F1 25 (formati 2025 e 2026), ottimizzato per display 9:16
  e utilizzabile anche a 16:9. Home con tutorial, monitor con schermata di attesa e tre blocchi base (sessione,
  classifica con settori, mappa), da sviluppare uno alla volta.
- **Stack:** Astro 7 statico · TypeScript strict · SCSS (solo `@use`) · bridge Node 22.18+ (TypeScript eseguito
  nativamente da Node, senza build).
- **Lingua:** italiano, testi in `src/i18n/it.ts`.

| Comando                       | Cosa fa                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `npm run dev`                 | sito + bridge UDP→WebSocket su http://localhost:4321 (UDP 20777)                        |
| `npm run build` / `npm start` | build in `dist/` / sito + bridge su http://IP:20780 (`--port`, `--udp`)                 |
| `npm run mock`                | gioco finto via UDP (`--session quali --format 2026 --rate 60 --laps 10 --host --port`) |
| `npm test`                    | test Node (`node --test`): codec, gara e qualifica simulate, mappa                      |
| `npm run check`               | `astro check`: 0 errori, 0 warning, 0 hint                                              |

## 2. Deroghe alle regole Nuvola GO (motivate)

- **È un'app, non un sito vetrina**: niente navbar, sitemap, SEO, JSON-LD, Open Graph immagine, badge Nuvola GO.
- **Nessuna dipendenza client**: il layout del monitor è fisso (CSS grid per 9:16 e 16:9), niente griglia trascinabile.
- **`ws` + server Node** in `server/`: il browser non può ricevere UDP.
- **localStorage** solo per i tracciati appresi (`fm:track:*`), sempre dietro `src/scripts/prefs.ts` (try/catch).
- **`src/data/circuits.ts`**: forme reali dei circuiti da github.com/bacinger/f1-circuits (MIT), generate una volta
  e incluse nel sorgente; servono a mostrare la mappa prima che le auto girino.
- **`respond(landscape)`**: unica media query sulle proporzioni, perché il monitor dipende dal formato dello schermo.
- I file in `src/lib/` e `src/data/` usati dal server importano con percorsi relativi ed estensione `.ts`
  (Node li esegue direttamente): niente alias `@…` lì dentro e solo sintassi TypeScript "cancellabile"
  (`erasableSyntaxOnly`: niente `enum`, `namespace`, parameter properties).

## 3. Architettura

```
server/bridge.ts        UDP → WebSocket (frame binari invariati) + stato JSON ogni secondo
server/integration.ts   bridge dentro il dev server di Astro (stessa porta, path /ws)
server/start.ts         produzione: serve dist/ + bridge
src/lib/f1/             struct.ts (codec dichiarativo), schema.ts (2025/2026), codec.ts (decode/encode)
src/lib/telemetry/      state.ts (reducer), view.ts (vista per frame), track.ts (tracciato appreso +
                        allineamento della forma reale del circuito)
src/lib/sim/            simulatore isomorfo, gara o qualifica (demo ?demo nel browser e mock UDP)
src/components/blocks/  Block (cornice), Session, Timing, Map: i blocchi base del monitor
src/components/widgets/ i 24 blocchi completi (catalogo in src/data/widgets.ts), visibili solo in simulazione
src/scripts/monitor/    index (attesa/cruscotto, diagnosi), runtime (rAF + ripiego a timer), sources, bind, formatters
src/scripts/blocks/     renderer canvas: mappa, pedali, grafico posizioni, forze G
```

Regole del codice:

- **Logica pura in `src/lib/`** (niente DOM), DOM solo in `src/scripts/`.
- I blocchi sono **markup + attributi del binder**; un renderer dedicato solo per canvas o stato locale.
- Nuovi dati derivati → `view.ts` (calcolati una volta per frame), non nei blocchi.
- Nuovi campi del protocollo → `schema.ts`; se esistono in un solo formato usare `only2026()`.
  Aggiornare i test delle dimensioni se le specifiche cambiano.
- Il simulatore deve restare plausibile: dopo modifiche lanciare `npm test` (gara e qualifica decodificate).

## 4. Versioni di gioco e demo

`src/data/games.ts`: formato 2025 (F1 25) e 2026 (Season Pack). **Nessuna scelta da fare**: il codec riconosce
il formato da ogni pacchetto. Formati diversi (2024 e precedenti) vengono scartati e la schermata di attesa
spiega come correggere l'impostazione nel gioco. Il decoder accetta pacchetti più lunghi del previsto.

La **simulazione sviluppatore** (simulatore nel browser) si apre dal link nel footer della home o con
`/monitor/?demo` (qualifica), `?demo=race`, `&format=2026`; non resta salvata nell'URL. Sotto i blocchi base
mostra **tutti i blocchi completi** con ogni dato disponibile, in una griglia scorrevole 12 × 24 (24 colonne a
16:9) dove ogni blocco prende la misura dal catalogo. I blocchi di una sola versione usano `data-game-only`,
nascosti in base a `html[data-game]` impostato dal formato rilevato.

## 5. Mappa

Il gioco non invia la forma della pista. All'arrivo del pacchetto Session la mappa mostra la forma reale del
circuito (auto posizionate per distanza sul giro); con ~12% di pista osservata la forma viene allineata alle
coordinate del gioco (rotazione, scala, specchiatura, traguardo, verso) e completa i tratti non ancora visti.
Il tracciato osservato è salvato per circuito e la mappa resta sempre orientata a nord.

## 6. Definition of done

- `npm test`, `npm run check` (0/0/0) e `npm run build` senza warning Sass.
- Monitor provato a 540×960, 390×844 e 1600×900: nessun blocco che trabocca, nessuna console error.
- Percorso reale provato almeno con `npm start` + `npm run mock -- --session quali`.
- Nessun valore letterale nei partial, una root per partial, testi solo in `src/i18n/it.ts`.
- `DESIGN-SYSTEM.md`, `docs/DATI.md` e questo file aggiornati se cambia la struttura.
