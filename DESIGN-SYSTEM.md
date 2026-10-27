# Design system — Formula Monitor "Carbon & Signal"

Documento autonomo per ampliare il progetto con la stessa filosofia. Tutti i valori vivono in
`src/styles/abstracts/_variables.scss`; qui si spiega **quando** usarli. La pagina `/brand/` mostra logo,
palette e tipografia dal vivo.

## 1. Filosofia

Un muretto box, non un videogioco: superfici scure e silenziose, un solo rosso che indica ciò che conta,
numeri grandi leggibili a un metro di distanza.

1. **Il dato prima della decorazione.** Ogni blocco ha un numero protagonista; il resto è contesto in grigio.
2. **Un rosso per schermata.** `$color-primary` è azione principale o allarme, mai decorazione.
3. **Colori dei tempi come in TV.** Viola = migliore assoluto, verde = personale, giallo = più lento.
4. **Cifre tabellari sempre** (`@include numeric`): i valori non devono "ballare" quando cambiano.
5. **Inclinazione a −12°** come firma: simbolo del logo, trattino delle etichette, corsivo dei titoli.

Vietato: gradienti arcobaleno, glow su tutto, più di un accento caldo per blocco, testo bianco puro su rosso
per paragrafi lunghi, tema chiaro (il prodotto vive in ambienti bui accanto a uno schermo).

## 2. Token

### Colori

| Token                                                   | Hex                         | Uso                                       |
| ------------------------------------------------------- | --------------------------- | ----------------------------------------- |
| `$color-bg` / `$color-bg-alt`                           | #08090C / #0C0E13           | fondo pagina / sezioni alternate, barre   |
| `$color-surface` / `-raised` / `-high`                  | #11141B / #171B24 / #1E2330 | blocchi / elementi interni / hover e chip |
| `$color-line` / `-strong`                               | bianco-blu 7% / 14%         | bordi e separatori                        |
| `$color-ink` / `-soft` / `-faint`                       | #F1F3F7 / #A3ABBA / #6A7285 | testo / secondario / etichette            |
| `$color-primary` (+ `-deep`, `-tint`, `-line`, `-glow`) | #F23D33                     | azione principale, allarmi, giocatore     |
| `$color-accent` (+ `-tint`, `-line`)                    | #35C5F0                     | telemetria, focus, ERS, finestra pit      |
| `$color-best` / `$color-personal` / `$color-slower`     | #B57CFF / #36D27C / #F5C84A | viola / verde / giallo dei tempi          |
| `$color-warn`                                           | #FF9D3A                     | attenzione (usura, temperature alte)      |
| `$tyre-soft/medium/hard/inter/wet`                      |                             | mescole, solo su `tyre-chip`              |
| `$temp-cold/ok/hot/over`                                |                             | scala temperature di gomme, freni, motore |

I colori dei team sono **dati** (`src/data/teams.ts`), applicati come custom property `--team`.

### Tipografia

**Saira** (variabile, assi peso e larghezza) per titoli, numeri ed etichette; **Geist** per testo e interfaccia.

- `@include title-display($fs-*)`: Saira corsivo, larghezza `$stretch-semi`, maiuscolo, `*accento*` in rosso.
- `@include racing-label`: Saira condensata maiuscola con tracking ampio (etichette dei blocchi).
- `@include numeric`: cifre tabellari, per ogni valore che cambia.
- Pagine: scala fluida `$fs-display` 46→104 · `$fs-h1` 38→72 · `$fs-h2` 30→52 · `$fs-h3` 21→26 · `$fs-body` 15→16.
- **Blocchi**: i valori scalano con il box tramite container query: `$value-xl` (numero protagonista),
  `$value-lg`, `$value-md`, `$value-sm`, `$value-xs`, `$label-widget`; `$value-list` per elenchi lunghi.

### Spazi, forme, motion

Spazi `$sp-0`…`$sp-160` (nome in px) e `$sp-cq-xs/sm/md` relativi al blocco · radius `xs sm md lg xl pill round`
· angolo tagliato `$cut`/`$cut-lg` (`@include cut-corner`) · durate `fast base slow reveal pulse data` ·
`$dur-data` per le barre che seguono i dati.

## 3. Componenti

**Classi root esistenti** (una variante non può avere uno di questi nomi):
`section` `container` `site-header` `site-footer` `monitor` `icon` `skip-link` `button` `logo` `section-title`
`bridge-pill` `game-picker` `udp-settings` `command-list` `widget` `tyre-chip` `battle-car` `drawer`
`panel-dialog` `dev-panel` `toast` `home-hero` `home-steps` `home-features` `guide-flow` `guide-platforms`
`guide-find-ip` `guide-faq` `guide-cta` `brand-logos` `brand-palette` `brand-type` `brand-rules` `not-found`
e i blocchi `w-position` `w-lap` `w-delta` `w-cockpit` `w-battle` `w-board` `w-map` `w-tyres` `w-strategy`
`w-fuel` `w-ers` `w-flags` `w-sectors` `w-inputs` `w-events` `w-drs` `w-aero` `w-session` `w-weather` `w-laps`
`w-positions` `w-damage` `w-engine` `w-brakes` `w-gforce` `w-trap`.

| Componente          | Anatomia                                                                                 | Varianti / stati                                            | Quando                                    |
| ------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------- |
| `ui/Button`         | `button` › icona, `button-label`, `button-arrow`                                         | `primary` `outline` `ghost`; `sm` `md` `lg`; `aria-pressed` | ogni azione                               |
| `brand/Logo`        | `logo` › `logo-mark`, `logo-word`                                                        | `full` `mark`; `md` `lg`; `mono`                            | header, footer, barra                     |
| `monitor/Widget`    | `widget` › `widget-head` (`widget-title`, `widget-meta`, `widget-action`), `widget-body` | `hero` `primary` `secondary` `detail`                       | cornice di ogni blocco                    |
| `monitor/TyreChip`  | `tyre-chip`                                                                              | `data-compound` soft…wet                                    | ogni mescola                              |
| `monitor/BattleCar` | `battle-car` › label, driver, gap, trend, catch, tyre                                    | `ahead` `behind`; `data-drs`                                | blocco Battaglia                          |
| `setup/GamePicker`  | `game-picker` › `game-option`                                                            | `compact`                                                   | avvio, guida, dialog del monitor          |
| `setup/UdpSettings` | `udp-settings` › tabella                                                                 | `detailed`                                                  | avvio (compatta), guida (con motivazioni) |

## 4. Blocchi del monitor

Ogni blocco è un componente in `src/components/widgets/` con una root `w-*` e il suo partial in
`src/styles/widgets/`. Il corpo del blocco è un container (`container-type: size`): dimensioni dei valori,
colonne e dettagli secondari si adattano con `@container` (soglie `$cq-*` in larghezza, `$cqh-*` in altezza).

Per aggiungerne uno: voce nel catalogo `src/data/widgets.ts` (tier, categoria, icona, misure), testi in
`t.widgets`, componente con gli attributi del binder, partial `w-nome`, registrazione in `WidgetTemplates.astro`
e in `main.scss`. Serve JS solo per canvas o stato locale (`src/scripts/widgets/`).

### Attributi del binder

`data-text="percorso|formatter:arg"` · `data-var="--v:percorso|unit"` · `data-attr="data-tone:percorso|tone:tyre"`
· `data-list="percorso"` con `<template>` e opzionali `data-key`, `data-limit`, `data-flip`. Percorsi relativi
all'elemento corrente della lista; `@` riparte dalla vista. Formatter in `src/scripts/monitor/formatters.ts`.

## 5. Mappa

Preset definiti come custom property `--map-*` in `_map.scss` (letti dal canvas): `broadcast` (pista larga con
bordo e settori a filo), `minimal`, `neon` (bagliore), `blueprint` (griglia tecnica). Gialli e zone DRS sono
sempre del colore semantico, indipendentemente dal preset.

## 6. Motion

Pagine: `data-reveal` (`up` `fade` `left` `right` `scale`) e `data-reveal-group`. Monitor: solo transizioni
brevi sui dati (`$dur-data`), ingresso righe (`slide-in`), FLIP della classifica sui sorpassi, lampeggio per
safety car e carburante critico. Con `prefers-reduced-motion` restano solo i cambi di valore.
