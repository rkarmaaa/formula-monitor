# Design system — Formula Monitor "Grafite"

Documento di riferimento per i prossimi aggiornamenti. Tutti i valori vivono in
`src/styles/abstracts/_variables.scss`, i mixin in `_mixins.scss`; qui si spiega **quando** usarli.

**Fonte del design**: Figma, file "Roba", frame **QUALI & TESTING** (nodo `1283:9`, 1080 × 1920) e **RACE**
(nodo `1283:76`, stessi blocchi: distacchi in classifica, giri in alto; i pedali restano anche in gara, il blocco strategia è disattivato).
Ogni modifica visiva al monitor parte da lì: i token `$q-*` sono le misure del frame in pixel di design.

## 1. Filosofia

Un monitor da muretto box: carbone, schede a filo, dati grandi e leggibili. Ogni informazione è
"intelligente": il colore dice subito se un tempo è il migliore, se una gomma o un componente si sta consumando.

1. **Il colore è dato.** L'interfaccia è in scala di grigi; i colori informano: viola (migliore assoluto),
   verde (migliore personale / guadagno), rosso (più lento / perdita), arancio (usura), mescole, team.
2. **Schede a spigoli vivi.** Fondo `$color-surface`, filo `$color-line`, niente ombre. I raggi esistono solo
   nei **grafici dati**: chip delle mescole e anelli d'usura (cerchi), sagoma della vettura (`CarShape`).
3. **Gerarchia con i grigi.** Valori `$color-ink` (#D9D9D9), etichette `$color-ink-faint` (#767676),
   sottotitoli `$color-ink-soft` (#8D8D8D). Evidenze di riga e caselle attive con `$color-surface-raised`.
4. **Bottoni chiari su fondo scuro** (`.button`), secondari a filo (`.button.outline`).
5. **Cifre tabellari sempre** (`@include figures` / `numeric`): i numeri non "ballano".
6. **Misure del Figma rispettate**: testi rifilati all'altezza delle maiuscole (`@include cap-trim`, come
   `text-box-trim` in Figma) e spazi presi dai token `$q-*` attraverso `dp()`.

## 2. Token

### Colori

| Token                                                  | Valore                        | Uso                                          |
| ------------------------------------------------------ | ----------------------------- | -------------------------------------------- |
| `$gray-0` … `$gray-1000`                               | #000 → #F2F2F2, 13 passi      | scala base, non usarla direttamente          |
| `$color-bg` / `$color-surface`                         | #141414                       | fondo pagina e schede                        |
| `$color-surface-raised` / `-high`                      | #1C1C1C / #2D2D2D             | riga giocatore, casella attiva, tracce, tag  |
| `$color-line` / `-strong`                              | #2D2D2D / #3A3A3A             | fili delle schede e separatori               |
| `$color-ink` / `-soft` / `-faint` / `-ghost`           | #D9D9D9 / #8D8D8D / #767676 … | valori, sottotitoli, etichette, inattivo     |
| `$color-primary` / `$color-on-primary`                 | #D9D9D9 / #141414             | bottone principale                           |
| `$color-best` / `$color-personal`                      | #B325CC / #089D09             | tempi viola / verdi                          |
| `$color-danger` / `$color-critical` / `$color-wear`    | #BB152E / #B92020 / #B74815   | delta in perdita, usura critica, usura media |
| `$sector-best` / `-personal` / `-slower` / `-none`     | gradienti                     | barre S1-S3 della scheda giocatore           |
| `$tyre-soft/medium/hard/inter/wet`, `$tyre-chip-alpha` | #B92020, #EACC08, #D9D9D9…    | chip mescola: testo pieno, fondo al 20%      |

I colori dei team sono **dati** (`src/data/teams.ts`, custom property `--team`); i loghi stanno in
`public/teams/<id>.png` e si attivano con `logo` nel team (F1 e F2). Senza logo resta un quadrato nel colore del team.

### Tipografia (font del progetto, stile del Figma)

- **Saira** (asse larghezza): titoli del monitor, valori, tempi. Normale (`$stretch-normal`) per i valori
  grandi, `$stretch-narrow` (75%, come "Saira Condensed") per la classifica; pesi Light (posizioni e tempi)
  e Medium (sigle, valori).
- **Geist**: etichette di tabella, chip delle mescole, meteo, componenti della power unit, testo delle pagine.
- Mixin: `title-display`, `label`, `racing-label` (blocchi densi della simulazione), `eyebrow`, `figures`,
  `cap-trim`. Pagine: scala fluida `$fs-display` 44→96 · `$fs-h1` 34→64 · `$fs-h2` 28→44 · `$fs-body` 15→16.

### Scala del monitor: `dp()`

Il cruscotto riproduce il frame Figma. `dp($px)` = `calc($px * var(--dp))`, con `--dp` impostata da
`.monitor-board` sul container `.monitor-main`:

- 9:16 → `min(100cqw / 1080, 100cqh / 1880)` (`$q-base-w/h`);
- 16:9 → `min(100cqw / 2112, 100cqh / 1000)` (`$q-base-w/h-land`): classifica a sinistra, il resto a destra.

I token `$q-*` sono numeri senza unità (pixel del Figma): `font-size: dp($q-fs-timer)`. Mai px letterali.

### Altro

Spazi `$sp-*` per le pagine · `$touch-min` 48 px · usura di gomme e ali con colore **graduale**
(`@include wear-color` → `--wear` da `--v`: `$wear-green/yellow/orange/red` pieni alle soglie `$wear-stops`) ·
`@include compound-tones` per i colori delle mescole (testo pieno, fondo al 20%) · soglie della power unit (anche in
`formatters.ts`) e `PU_OK/PU_HIGH` (power unit) · `respond(phone | tab-port | tab-land | big-desktop)` e
`respond(landscape)` (deroga: proporzioni dello schermo).

## 3. Componenti

**Classi root esistenti** (una variante non può avere uno di questi nomi):
`button` `icon` `skip-link` `command-list` `udp-settings` `hero-car` `team-logo` `monitor-bar`
`monitor-wait` `monitor` `site-footer` `home-hero` `home-tutorial` `not-found`, i blocchi del monitor
`quali-header` `player-card` `timing-tower` `forecast` `power-unit` `live-feed` `pedals` `car-state` `race-strategy`

| Componente (`src/components/`)         | Anatomia                                                                                                                         | Dati / stati                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `blocks/Header`                        | `quali-header` › logo vettura, circuito, sessione · cronometro / giri                                                            | `data-race`                                            |
| `blocks/PlayerCard`                    | `player-card` (senza cornice) › posizione sfumata, mescola · S1-S3, delta (max 3/s), ultimo, migliore                            | barre `data-tone`, `data-every`                        |
| `blocks/Timing`                        | `timing-tower` › pos, logo, sigla, chip mescola · distacco dal primo, migliore, S1, S2, S3                                       | `data-tone`, `data-live`, `data-player`, `data-leader` |
| `blocks/Forecast`                      | `forecast` › 4 caselle: minuti, icona, temperatura                                                                               | `data-weather` 0-5, `data-wet` evidenziata             |
| `blocks/Engine`                        | `power-unit` › 2 × 4: nome, %, barra sottile (ICE…TC, cambio, motore)                                                            | `data-tone` ok/high/over, `--v`                        |
| `blocks/Feed`                          | `live-feed` › titolo, messaggi di gara (giro + testo, sigle in evidenza), sfumatura in fondo                                     | `data-name`                                            |
| `blocks/Pedals`                        | `pedals` › legenda cliccabile, zoom 4–32 s (scelte salvate per qualifica e gara), canvas acceleratore/freno                      | `aria-pressed`, `--trace-*`                            |
| `blocks/Strategy`                      | `race-strategy` (solo gara) › finestra pit, gomma, barra gara · rientro, carburante                                              | `data-compound`, `--from/--to/--now`                   |
| `blocks/Car` + `CarShape`              | `car-state` › anello ala ant. · sagoma centrata con gomme colorate e 4 anelli · anello alettone (anelli aperti verso la vettura) | `--v` → `--wear` graduale                              |
| `blocks/TeamLogo`                      | `team-logo` › logo 1:1 o quadrato colore team                                                                                    | `sm` (classifica) `lg` (intestazione)                  |
| `monitor/MonitorBar`                   | `monitor-bar` › dominio, stato, sessione, selettore della schermata (solo demo: vista + menu), schermo intero, esci              | `data-state`, `aria-expanded`, `aria-pressed`          |
| `ui/Button`, `home/HeroCar`, `setup/*` | pagine informative                                                                                                               |                                                        |

## 4. Monitor

- **Attesa** (`data-view="wait"`) finché non arriva il pacchetto Session; torna all'attesa dopo 15 s senza dati.
- **Cruscotto**: aree in `layout/_monitor.scss`. 9:16 = intestazione, scheda giocatore, classifica, poi in basso
  meteo e power unit (325) accanto al live feed (296), sotto i pedali (anche in gara), a destra gomme e ali
  (Figma 1291:192). 16:9 = classifica a tutta altezza a sinistra, a destra le stesse schede del 9:16.
- **Simulazione** (`?demo`): lo stesso cruscotto con dati simulati, senza blocchi aggiuntivi.

### Aggiungere un blocco al cruscotto

1. Disegnarlo nel frame Figma; prendere misure e colori (`get_design_context`) e tradurli in token `$q-*` / colori.
2. Componente in `src/components/blocks/` con root propria e `data-block="…"`; testi in `t.monitor.blocks`.
3. Partial in `src/styles/blocks/` registrato in `main.scss`, misure solo con `dp($q-…)`.
4. Area in `layout/_monitor.scss` per 9:16 e 16:9; dati derivati in `view.ts`, JS solo per canvas.

### Attributi del binder

`data-text="percorso|formatter:arg"` · `data-var="--v:percorso|formatter"` · `data-attr="data-x:percorso|formatter"`
· `data-list="percorso"` con `<template>` e opzionali `data-key`, `data-limit`, `data-flip` · `data-every="ms"`
(al massimo un aggiornamento dell'elemento per intervallo: il delta usa 334 ms, cioè 3 al secondo).
Formatter in `src/scripts/monitor/formatters.ts`.

### Microsettori

Il protocollo UDP di F1 25 **non** invia microsettori: solo S1, S2 (giro in corso) e i tre settori a giro
concluso. Si possono ricavare: ogni auto invia distanza sul giro e tempo del giro in corso a ogni pacchetto, e il
giocatore ha già una traccia ogni 10 m (`state.trace`, usata per il delta). Un blocco microsettori va costruito
in `view.ts` a partire da quella traccia.

## 5. Motion

Home: ingresso lento dell'auto (`emerge`), reveal del tutorial. Monitor: transizioni brevi sui dati, FLIP della
classifica ai sorpassi, puntini di "In attesa…", pallino "live". Con `prefers-reduced-motion` restano solo i
cambi di valore.
