<p align="center">
  <img src="public/favicon.svg" width="72" alt="" />
</p>

<h1 align="center">Formula Monitor</h1>

<p align="center">
  Telemetria live di <b>F1 25</b> (PS5, Xbox, PC) su un cruscotto a blocchi pensato per lo <b>schermo verticale 9:16</b>.<br />
  I dati che l'HUD del gioco non mostra: trend dei distacchi, strategia degli avversari, finestra pit, delta live, usura PU.
</p>

<p align="center">
  <img src="docs/monitor.jpg" width="360" alt="Il monitor durante una gara simulata in modalità demo" />
</p>

---

## Cosa fa

- **Riceve la telemetria UDP** del gioco (formati **2025** e **2026** del Season Pack) tramite un piccolo bridge
  Node e la mostra in qualsiasi browser della rete: telefono, tablet, secondo monitor.
- **26 blocchi** di diverse dimensioni e importanza, da spostare, ridimensionare, aggiungere e togliere.
  Il layout si salva da solo, per versione di gioco.
- **Priorità ai dati che il gioco non mostra**: trend del distacco a giro e "giri al contatto", mescola ed età
  gomme di ogni avversario, avvisi per track limits, posizione prevista al rientro dai box, margine di carburante,
  delta live metro per metro, temperature della carcassa, blistering, usura di ogni componente della power unit.
- **Mappa** ricostruita dalle posizioni delle auto (il gioco non invia il tracciato), salvata per circuito, con
  4 stili (Broadcast, Minimal, Neon, Blueprint), etichette, orientamento automatico e livelli mostra/nascondi.
- **Modalità DEV/demo**: una gara completa simulata (semafori, sorpassi, pit stop, VSC, penalità, meteo) che
  produce pacchetti F1 reali, nel browser o via UDP verso il bridge, per sviluppare senza console.
- **Avvio guidato**: alla prima apertura si sceglie la versione del gioco e le istruzioni si adattano, con l'IP
  del PC letto in tempo reale dal bridge.

## Avvio rapido

Requisiti: **Node.js 22.18+** (consigliato 24) sul PC che riceve i dati.

```bash
npm install
npm run build
npm start
```

Il terminale mostra gli indirizzi da aprire, per esempio `http://192.168.1.20:20780`. Apri la pagina dal
telefono o dal tablet sulla stessa rete, scegli la versione del gioco e segui i quattro passi.

### Impostazioni nel gioco

_Opzioni di gioco → Impostazioni → Impostazioni telemetria UDP_

| Opzione            | Valore                                                                |
| ------------------ | --------------------------------------------------------------------- |
| UDP Telemetry      | On                                                                    |
| UDP Broadcast Mode | Off (On per più dispositivi/app)                                      |
| UDP IP Address     | IP del PC con Formula Monitor (`127.0.0.1` se giochi sullo stesso PC) |
| UDP Port           | `20777`                                                               |
| UDP Send Rate      | 60 Hz (30 Hz su Wi-Fi instabile)                                      |
| UDP Format         | `2025` per F1 25, `2026` con il Season Pack 2026                      |
| Your Telemetry     | Public (solo online, per mostrare i tuoi dati agli altri)             |

Su Windows consenti Node.js nel firewall per le reti private. La guida completa con risoluzione dei problemi è
nella pagina **Guida setup** del sito (`/guida/`).

## Sviluppo

```bash
npm run dev     # sito + bridge UDP sulla stessa porta (http://localhost:4321)
npm run mock    # gioco finto: invia pacchetti UDP reali al bridge (--format 2026 --rate 60 --laps 10)
npm test        # codec contro le dimensioni ufficiali + gara simulata completa
npm run check   # TypeScript e Astro: 0 errori, 0 warning, 0 hint
```

- **Demo nel browser**: `/monitor/?demo` (nessun bridge necessario).
- **Pannello DEV**: tasto `D` o `?dev` → FPS, pacchetti/s, conteggio per tipo, velocità della simulazione
  (1–8×), comandi VSC, penalità, box, ritiro, riavvio.
- **Scorciatoie del monitor**: `E` personalizza, `F` schermo intero, `D` pannello DEV, `Esc` esce dalla modifica.
- **Bridge diverso**: `/monitor/?bridge=192.168.1.20:20780`.
- **Porte**: `npm start -- --port 20780 --udp 20777`.

## Architettura

```
F1 25 ──UDP──▶ server/bridge.ts ──WebSocket (frame binari)──▶ browser
 (PS5/Xbox/PC)   inoltra i datagrammi così come sono            src/lib/f1      decodifica (stesso codec del simulatore)
                 + stato del bridge in JSON                     src/lib/telemetry  stato gara + analisi + vista
                                                                src/scripts/monitor  binder dichiarativo → blocchi
```

- **Codec dichiarativo** (`src/lib/f1/struct.ts`): la stessa definizione legge e scrive i pacchetti. Lo schema è
  unico e parametrizzato per i formati 2025/2026 (`schema.ts`); i test verificano ogni dimensione contro le
  specifiche ufficiali.
- **Stato e vista** (`src/lib/telemetry`): ultimo pacchetto di ogni tipo + analisi (delta live, trend distacchi,
  tracciato appreso) e una vista per frame con i campi derivati.
- **Binder** (`src/scripts/monitor/bind.ts`): i blocchi sono markup con `data-text`, `data-var`, `data-attr`,
  `data-list`; solo mappa, grafici e forze G hanno un renderer dedicato.
- **Simulatore** (`src/lib/sim`): circuito da spline con profilo di velocità fisico, 20–22 auto, strategie, eventi.
  Isomorfo: gira nel browser (demo) e in Node (`npm run mock`).

## Scelte tecniche

| Libreria                                | Perché                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| [Astro](https://astro.build)            | Pagine statiche, componenti, SCSS e TypeScript senza framework client          |
| [gridstack.js](https://gridstackjs.com) | Griglia drag & resize con collisioni, touch e serializzazione, zero dipendenze |
| [ws](https://github.com/websockets/ws)  | Server WebSocket per il bridge (il browser non riceve UDP)                     |
| Saira + Geist (`@fontsource`)           | Font self-hosted: numeri tabellari da cruscotto e testo leggibile              |
| `astro-icon` + Lucide                   | Icone inline senza runtime                                                     |

Valutate e scartate: i parser UDP esistenti per Node (`@deltazeroproduction/f1-udp-parser` e simili) decodificano
solo lato server, non scrivono pacchetti (serve per il simulatore) e non coprono il formato 2026; React/Vue non
servono per un cruscotto aggiornato a 60 Hz da un binder di poche righe.

## Struttura

```
server/            bridge UDP→WebSocket, avvio di produzione, mock UDP, integrazione dev
src/lib/f1/        codec binario e schema dei pacchetti 2025/2026
src/lib/telemetry/ stato gara, vista, tracciato appreso
src/lib/sim/       simulatore di gara e circuito
src/data/          versioni di gioco, catalogo blocchi e layout, team, piste, dati demo
src/i18n/it.ts     tutti i testi dell'interfaccia
src/components/    pagine, cornice dei blocchi, 26 blocchi
src/scripts/       runtime del monitor, binder, griglia, renderer canvas
src/styles/        design system SCSS (token, mixin, un partial per componente)
docs/              protocollo UDP e elenco completo dei dati
```

## Documenti

- [docs/UDP-F1-25.md](docs/UDP-F1-25.md) — come funziona la telemetria del gioco, pacchetti e formati
- [docs/DATI.md](docs/DATI.md) — tutti i dati mostrabili e in quale blocco
- [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) — brand, token, componenti
- [CLAUDE.md](CLAUDE.md) — regole di sviluppo del progetto

## Sicurezza

Il bridge è pensato per la rete di casa: non ha autenticazione e chiunque sulla stessa rete può aprire il monitor.
Non esporlo su Internet.

## Note legali

Progetto indipendente, non affiliato né approvato da Formula 1, FIA, Electronic Arts o Codemasters.
F1® è un marchio di Formula One Licensing BV. I nomi di piloti e team nei dati demo sono quelli che il gioco
stesso invia via UDP.

Licenza [MIT](LICENSE).
