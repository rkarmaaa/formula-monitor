# Telemetria UDP di F1 25 — come funziona

Sintesi delle specifiche ufficiali EA/Codemasters (_Data Output from F1® 25 Game_, v3) e della variante
**2026** introdotta dal Season Pack. Le strutture complete sono in [`src/lib/f1/schema.ts`](../src/lib/f1/schema.ts),
verificate dai test contro le dimensioni dichiarate nelle specifiche.

## Il trasporto

- Il gioco (PS5, Xbox, PC) invia **datagrammi UDP** verso un IP e una porta (default **20777**), oppure in
  **broadcast** sulla sottorete. Nessun handshake: se nessuno ascolta, i pacchetti si perdono.
- Valori **little-endian**, strutture **impacchettate** (nessun padding).
- Ogni pacchetto inizia con un **header di 29 byte**: formato (`2025`/`2026`), anno, versione, `packetId`,
  `sessionUID`, tempo di sessione, numero di frame, indice dell'auto del giocatore.
- Frequenza: i pacchetti "di guida" seguono la _Send Rate_ scelta nel menu (10–60 Hz) e partono tutti nello
  stesso frame; gli altri hanno frequenze fisse (vedi tabella).
- Il gioco supporta il formato corrente e i due precedenti: F1 25 → 2025/2024/2023, Season Pack → 2026/2025/2024.

## I 16 (+1) tipi di pacchetto

|  ID | Pacchetto            | Frequenza          | Byte 2025 | Byte 2026 | Contenuto                                                                                                     |
| --: | -------------------- | ------------------ | --------: | --------: | ------------------------------------------------------------------------------------------------------------- |
|   0 | Motion               | Send Rate          |      1349 |      1325 | Posizione/velocità/assetto nel mondo e forze G di tutte le auto                                               |
|   1 | Session              | 2/s                |       753 |       926 | Pista, meteo e previsioni, safety car, finestra pit, aiuti, regole, zone marshal (2026: zone DRS/aero attiva) |
|   2 | Lap Data             | Send Rate          |      1285 |      1399 | Tempi, settori, distacchi, posizione, pit, penalità e avvisi di ogni auto                                     |
|   3 | Event                | all'evento         |        45 |        45 | 21 eventi: giro veloce, sorpasso, penalità, SC, semafori, collisioni…                                         |
|   4 | Participants         | ogni 5 s           |      1284 |      1470 | Nome, team, numero, nazionalità, IA/umano, colori livrea                                                      |
|   5 | Car Setups           | 2/s                |      1133 |      1233 | Assetto (ali, differenziale, sospensioni, pressioni, carburante)                                              |
|   6 | Car Telemetry        | Send Rate          |      1352 |      1448 | Velocità, pedali, sterzo, marcia, giri, DRS, temperature gomme/freni/motore                                   |
|   7 | Car Status           | Send Rate          |      1239 |      1445 | Carburante, ERS, mescola ed età gomme, bandiere, potenze, modalità                                            |
|   8 | Final Classification | fine gara          |      1042 |      1134 | Classifica finale con stint, penalità, punti                                                                  |
|   9 | Lobby Info           | 2/s in lobby       |       954 |      1062 | Giocatori della lobby online                                                                                  |
|  10 | Car Damage           | 10/s               |      1041 |      1133 | Usura e danni gomme, ali, fondo, freni, componenti PU                                                         |
|  11 | Session History      | 20/s (a rotazione) |      1460 |      1460 | Fino a 100 giri e 8 stint per auto                                                                            |
|  12 | Tyre Sets            | 20/s (a rotazione) |       231 |       231 | I 20 treni di gomme assegnati e la loro vita                                                                  |
|  13 | Motion Ex            | Send Rate          |       273 |       273 | Fisica estesa dell'auto del giocatore (sospensioni, slip, carichi)                                            |
|  14 | Time Trial           | 1/s                |       101 |       104 | Migliori giri personali e del rivale                                                                          |
|  15 | Lap Positions        | 1/s                |      1131 |      1231 | Posizione di ogni auto a inizio giro (grafico della gara)                                                     |
|  16 | Car Telemetry 2      | Send Rate          |         — |       269 | Solo 2026: aero attiva, Overtake mode, guida contromano                                                       |

## Differenze del formato 2026 (Season Pack)

- Auto massime **24** (11 team, 22 in griglia): quasi tutti i pacchetti cambiano dimensione.
- ID di pilota, team e rete passano a **16 bit**; nuovi team (Audi, Cadillac) e piste (Madring).
- Forze G **quantizzate** (`int16 / 1000`), temperatura motore a 8 bit.
- Sessione: zone DRS e di aerodinamica attiva, tempo di reazione al via, nuovi aiuti.
- Car Status: **limite di recupero ERS per giro**. Evento collisione con **gravità**.
- Nuovo pacchetto **Car Telemetry 2** (aero attiva, Overtake).

Usando il formato 2025 con il Season Pack il gioco omette i dati 2026 e mostra le nuove auto come "F1 Generic".

## Dati limitati ("Your Telemetry")

In multiplayer, per chi ha _Your Telemetry: Restricted_ (default) arrivano a zero: carburante, miscela, ERS,
potenze, ripartizione frenata (Car Status), tutti i danni e le usure (Car Damage) e i Tyre Sets.
I dati della propria auto sono sempre visibili. I nomi reali compaiono solo con _Show online ID_.

## Cosa ci permette di fare

Il flusso è completo per costruire un muretto box: classifica con strategia degli avversari, distacchi
cronometrici, settori, storico giri, meteo, danni, mappa (ricostruita dalle posizioni), più i dati "fisici"
dell'auto del giocatore. Ciò che il gioco **non** invia è la forma del tracciato: Formula Monitor la apprende
dalle posizioni delle auto (vedi [`src/lib/telemetry/track.ts`](../src/lib/telemetry/track.ts)).

L'elenco completo dei dati e dei blocchi che li mostrano è in [DATI.md](DATI.md).
