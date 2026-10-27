# Design system — Formula Monitor "Grafite"

Documento di riferimento per i prossimi aggiornamenti. Tutti i valori vivono in
`src/styles/abstracts/_variables.scss`, i mixin in `_mixins.scss`; qui si spiega **quando** usarli.

## 1. Filosofia

Un monitor da muretto box, non un sito vetrina: nero assoluto, scala di grigi, bianco per le azioni.
Geometrico, minimale, spigoli vivi.

1. **Il colore è solo dato.** L'interfaccia è in bianco e nero; i colori compaiono solo per informare:
   viola (migliore assoluto), verde (migliore personale), mescole, colori dei team, bandiere.
2. **Spigoli vivi ovunque.** Nessun `border-radius`, nessun angolo tagliato, nessuna maschera o `clip-path`
   sulle forme. Separatori e bordi sono fili da 1 px.
3. **Gerarchia con i grigi, non con i box.** Testo principale `$color-ink-strong`, secondario `-soft`,
   etichette `-faint`, inattivo `-ghost`. Le superfici si distinguono di pochi punti di grigio.
4. **Bottoni chiari su fondo scuro.** Azione principale = pieno bianco con testo nero (`.button`);
   secondaria = filo chiaro (`.button.outline`).
5. **Cifre tabellari sempre** (`@include numeric`): i numeri non devono "ballare" quando cambiano.
6. **Etichette maiuscole minuscole** (`@include label`) con tracking ampio; un trattino orizzontale
   (`@include eyebrow`) è la firma grafica davanti agli occhielli.

Vietato: raggi, ombre colorate, gradienti decorativi nell'interfaccia, colori fuori dalla semantica dei dati,
icone piene (le icone Lucide hanno tratto 1.5 e terminali squadrati).

## 2. Token

### Colori

| Token                                                        | Valore                  | Uso                                     |
| ------------------------------------------------------------ | ----------------------- | --------------------------------------- |
| `$gray-0` … `$gray-1000`                                     | #000 → #FFF in 13 passi | scala base, non usarla direttamente     |
| `$color-bg` / `$color-bg-alt`                                | #000 / #070707          | fondo pagina / riquadri secondari       |
| `$color-surface` / `-raised` / `-high`                       | #0D0D0D → #1B1B1B       | intestazioni tabelle, chip, tag         |
| `$color-line` / `-strong`                                    | bianco 8% / 18%         | fili, separatori, bordi dei bottoni     |
| `$color-ink-strong` / `-ink` / `-soft` / `-faint` / `-ghost` | #FFF → #575757          | testo, dal più importante all'inattivo  |
| `$color-primary` / `-deep` / `$color-on-primary`             | #FFF / #C8C8C8 / #000   | bottone principale, hover, testo sopra  |
| `$color-player`                                              | bianco 10%              | riga del giocatore in classifica        |
| `$color-best` / `$color-personal`                            | #8F3FFF / #22C55E       | viola (assoluto, fondo pieno) / verde   |
| `$color-warn` / `$color-danger` / `$color-live`              |                         | bandiere gialle, offline, stato "live"  |
| `$tyre-soft/medium/hard/inter/wet`                           |                         | mescole (chip in classifica)            |
| `$map-*`                                                     |                         | colori del canvas della mappa           |
| `$art-*`                                                     |                         | fili di luce dell'illustrazione in home |

I colori dei team sono **dati** (`src/data/teams.ts`), applicati come custom property `--team`.

### Tipografia

**Geist** per titoli, testo e interfaccia; **Saira** (asse larghezza) solo per i numeri: tempi, timer,
classifica (`@include numeric($stretch-condensed)` dove serve densità).

- `@include title-display($fs-*)`: Geist semibold, interlinea stretta, tracking negativo; `*accento*` → grigio.
- `@include label($size)`: maiuscolo, tracking ampio (etichette, intestazioni di colonna, stato).
- `@include racing-label($size)`: come `label` ma in Saira condensata, per i blocchi densi della simulazione.
- `@include eyebrow`: etichetta preceduta da un trattino orizzontale.
- Pagine: scala fluida `$fs-display` 44→96 · `$fs-h1` 34→64 · `$fs-h2` 28→44 · `$fs-h3` 18→22 · `$fs-body` 15→16.
- **Blocchi**: i valori scalano con il box tramite container query: `$value-hero` (timer),
  `$value-md`, `$label-block`, `$value-list` (righe della classifica, scala con larghezza e altezza).
  `type-size()` accetta sia token in px sia valori relativi (em, clamp con cq…).

### Spazi, layout, motion

Spazi `$sp-0`…`$sp-128` (nome = px) e `$sp-cq-xs/sm/md` relativi al blocco · `$touch-min` 48 px ·
contenitori `$container-default/narrow` · durate `fast base slow reveal pulse data`, easing `$ease-out`.
Colonne della classifica in `em` (`$col-*`, `$row-height`): seguono la dimensione del testo della riga.

### Responsive

`respond(phone | tab-port | tab-land | big-desktop)` per la larghezza (desktop-first).
`respond(landscape)` è una deroga motivata: il monitor dipende dalle **proporzioni** dello schermo
(`min-aspect-ratio: 1/1`). Priorità al 9:16, il 16:9 è il caso secondario.

## 3. Componenti

**Classi root esistenti** (una variante non può avere uno di questi nomi):
`button` `icon` `skip-link` `command-list` `udp-settings` `hero-car` `block` `monitor-bar` `monitor-wait`
`monitor` `site-footer` `home-hero` `home-tutorial` `not-found` `tyre-chip` `battle-car`, i blocchi base
`session-clock` `timing-tower` `track-map` e i blocchi completi della simulazione `w-position` `w-lap` `w-delta`
`w-cockpit` `w-battle` `w-board` `w-tyres` `w-strategy` `w-fuel` `w-ers` `w-flags` `w-sectors` `w-inputs`
`w-events` `w-drs` `w-aero` `w-weather` `w-laps` `w-positions` `w-damage` `w-engine` `w-brakes` `w-gforce` `w-trap`.

I blocchi completi (`src/components/widgets/`, partial in `src/styles/widgets/`) usano gli stessi token: niente
raggi né bagliori, telemetria in bianco; restano colorati solo i dati (temperature, mescole, bandiere, tempi).
I loro token dedicati (`$value-xl/lg/sm/xs`, `$cq-*`, `$temp-*`, `$col-*`…) sono nella sezione "Blocchi della
simulazione completa" di `_variables.scss`.

| Componente           | Anatomia                                                         | Varianti / stati                         |
| -------------------- | ---------------------------------------------------------------- | ---------------------------------------- |
| `ui/Button`          | `button` › icona, `button-label`, `button-arrow`                 | `primary` `outline` `ghost`; `sm` `lg`   |
| `home/HeroCar`       | `hero-car` › `hero-car-photo` (foto reale) + sfumature `::after` | B/N e scurita con `$hero-photo-*`        |
| `setup/CommandList`  | `command-list` › riga, codice, bottone copia                     | `live="url"` = URL dal bridge            |
| `setup/UdpSettings`  | `udp-settings` › tabella completa (opzione, valore, note)        | su telefono ogni riga diventa una scheda |
| `monitor/MonitorBar` | `monitor-bar` › dominio, stato, sessione, schermo intero, esci   | `data-state` live/paused/waiting/…       |
| `blocks/Block`       | `block` › `block-head` (`block-title`), `block-body` (container) | `data-block` session/timing/map          |

## 4. Monitor

- **Attesa** (`data-view="wait"`): titolo "In attesa…", una riga di spiegazione, diagnosi
  (`data-wait-detail`: PC non raggiungibile, nessun dato UDP, formato sbagliato…) e il bottone Tutorial.
- **Cruscotto** (`data-view="board"`) appena arriva il pacchetto Session; torna all'attesa dopo 15 s senza dati.
- Layout 9:16: sessione · mappa · classifica impilate. 16:9: classifica a sinistra, sessione + mappa a destra.
  Le aree sono in `layout/_monitor.scss` (`grid-template-areas`): un blocco nuovo = un'area in entrambi i layout.

### Aggiungere un blocco

1. Componente in `src/components/blocks/` dentro `<Block id="…" title="…">`, con una root propria.
2. Partial in `src/styles/blocks/` registrato in `main.scss`; testi in `t.monitor.blocks`.
3. Area in `layout/_monitor.scss` per 9:16 e 16:9.
4. Dati derivati in `src/lib/telemetry/view.ts`; serve JS solo per canvas (`src/scripts/blocks/`).

### Attributi del binder

`data-text="percorso|formatter:arg"` · `data-var="--v:percorso|formatter"` · `data-attr="data-x:percorso|formatter"`
· `data-list="percorso"` con `<template>` e opzionali `data-key`, `data-limit`, `data-flip`.
Percorsi relativi all'elemento corrente della lista; `@` riparte dalla vista. Formatter in
`src/scripts/monitor/formatters.ts`.

### Classifica (`timing-tower`)

Settori del giro in corso appena chiusi a piena luminosità (`data-live`), quelli del giro precedente attenuati.
`data-tone`: `best` = fondo viola pieno (solo il tempo più basso della sessione, anche se appena fatto),
`personal` = testo verde, `invalid` = barrato, `slower` = grigio. Riga del giocatore: fondo `$color-player`
e posizione in negativo (bianco pieno).

### Mappa (`track-map`)

Disegnata su canvas, colori dalle custom property `--map-*`. Tracciato grigio, tacche bianche (traguardo) e
grigie (settori), DRS tratteggiato, auto come quadrati nel colore del team, giocatore più grande e bordato
di bianco, etichetta solo per giocatore e P1. Sempre orientata a nord come il circuito reale.

## 5. Motion

Home: ingresso lento dell'auto dal buio (`emerge`), reveal discreto del tutorial (`data-reveal`).
Monitor: solo transizioni brevi sui dati, FLIP della classifica ai sorpassi, puntini di "In attesa…" e
pallino "live". Con `prefers-reduced-motion` restano solo i cambi di valore.
