# CLAUDE.md — Formula Monitor

Guida per chi (persona o Claude) lavora su questo repository. Lo **stile** segue le regole SCSS di Nuvola GO
(plugin `nuvola-go`, skill `nuvola-go:regole` §2 e `scss.md`): token, `respond()`, nesting al 100%, una root
per partial, niente `--`/`__`, niente `<style>`. Design system: `DESIGN-SYSTEM.md` · protocollo: `docs/UDP-F1-25.md`
· dati: `docs/DATI.md`.

## 1. Overview

- **Prodotto:** cruscotto live per la telemetria UDP di F1 25 (formati 2025 e 2026), ottimizzato per display 9:16.
- **Stack:** Astro 7 statico · TypeScript strict · SCSS (solo `@use`) · bridge Node 22.18+ (TypeScript eseguito
  nativamente da Node, senza build).
- **Lingua:** italiano, testi in `src/i18n/it.ts`.

| Comando                       | Cosa fa                                                                 |
| ----------------------------- | ----------------------------------------------------------------------- |
| `npm run dev`                 | sito + bridge UDP→WebSocket su http://localhost:4321 (UDP 20777)        |
| `npm run build` / `npm start` | build in `dist/` / sito + bridge su http://IP:20780                     |
| `npm run mock`                | gioco finto via UDP (`--format 2026 --rate 60 --laps 10 --host --port`) |
| `npm test`                    | test Node (`node --test`): codec e gara simulata                        |
| `npm run check`               | `astro check`: 0 errori, 0 warning, 0 hint                              |

## 2. Deroghe alle regole Nuvola GO (motivate)

- **È un'app, non un sito vetrina**: niente sitemap, SEO, JSON-LD, Open Graph immagine, badge Nuvola GO.
- **`gridstack`** è l'unica dipendenza client: griglia drag/resize con collisioni e touch non si scrive in poche righe.
- **`ws` + server Node** in `server/`: il browser non può ricevere UDP.
- **localStorage** per le preferenze del dispositivo (versione di gioco, layout, opzioni mappa, tracciati appresi),
  sempre dietro `src/scripts/prefs.ts` (try/catch).
- I file in `src/lib/` e `src/data/` usati dal server importano con percorsi relativi ed estensione `.ts`
  (Node li esegue direttamente): niente alias `@…` lì dentro e solo sintassi TypeScript "cancellabile"
  (`erasableSyntaxOnly`: niente `enum`, `namespace`, parameter properties).

## 3. Architettura

```
server/bridge.ts        UDP → WebSocket (frame binari invariati) + stato JSON ogni secondo
server/integration.ts   bridge dentro il dev server di Astro (stessa porta, path /ws)
server/start.ts         produzione: serve dist/ + bridge
src/lib/f1/             struct.ts (codec dichiarativo), schema.ts (2025/2026), codec.ts (decode/encode)
src/lib/telemetry/      state.ts (reducer + analisi), view.ts (vista per frame), track.ts (tracciato appreso)
src/lib/sim/            simulatore isomorfo (demo nel browser e mock UDP)
src/scripts/monitor/    runtime (rAF), sources (bridge/demo), bind (binder), grid (gridstack), formatters
src/scripts/widgets/    renderer canvas: mappa, traccia pedali, grafico posizioni, forze G
```

Regole del codice:

- **Logica pura in `src/lib/`** (niente DOM), DOM solo in `src/scripts/`.
- I blocchi sono **markup + attributi del binder**; un renderer dedicato solo per canvas o stato locale.
- Nuovi dati derivati → `view.ts` (calcolati una volta per frame), non nei blocchi.
- Nuovi campi del protocollo → `schema.ts`; se esistono in un solo formato usare `only2026()`.
  Aggiornare i test delle dimensioni se le specifiche cambiano.
- Il simulatore deve restare plausibile: dopo modifiche lanciare `npm test` (gara completa decodificata).

## 4. Versioni di gioco

`src/data/games.ts`: `f1-25` (formato 2025) e `f1-25-2026` (formato 2026). La scelta avviene nella pagina di
avvio (redirect dal monitor se assente), è salvata in `localStorage` e applicata come `html[data-game]`: i
contenuti specifici usano `data-game-only="…"` (mostrati/nascosti dal CSS). Il monitor rileva comunque il
formato dei pacchetti e propone il cambio se non corrisponde. Layout salvati separatamente per versione.

## 5. Definition of done

- `npm test`, `npm run check` (0/0/0) e `npm run build` senza warning Sass.
- Monitor provato in demo a 540×960 e 390×844: nessun blocco che trabocca, nessuna console error.
- Percorso reale provato almeno con `npm start` + `npm run mock`.
- Nessun valore letterale nei partial, una root per partial, testi solo in `src/i18n/it.ts`.
- `DESIGN-SYSTEM.md`, `docs/DATI.md` e questo file aggiornati se cambia la struttura.
