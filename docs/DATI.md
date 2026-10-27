# Dati mostrabili a schermo

Tutto ciò che la telemetria UDP di F1 25 rende disponibile durante una gara, raggruppato per tema.
**Blocco** = dove lo mostra oggi Formula Monitor. ★ = dato che l'HUD del gioco non mostra o mostra solo nei
menu: è la ragione d'essere del monitor ed è stato messo in priorità nel layout di default.

## Gara e classifica

| Dato                                                               | Fonte                      | Blocco                |
| ------------------------------------------------------------------ | -------------------------- | --------------------- |
| Posizione, posizione in griglia, posti guadagnati ★                | Lap Data                   | Posizione, Classifica |
| Giro corrente / totale, giri mancanti, avanzamento                 | Lap Data + Session         | Giro                  |
| Tempo di sessione rimanente                                        | Session                    | Giro, Sessione        |
| Intervallo dall'auto davanti e dal leader per **ogni** pilota ★    | Lap Data                   | Classifica            |
| Doppiati (calcolati dalla distanza percorsa) ★                     | Lap Data                   | Classifica            |
| Mescola ed **età gomme di ogni avversario** ★                      | Car Status                 | Classifica, Battaglia |
| Numero di soste di ogni pilota ★                                   | Lap Data                   | Classifica            |
| Secondi di penalità e **avvisi per track limits** di ogni pilota ★ | Lap Data                   | Classifica            |
| Stato box / ritirato / squalificato                                | Lap Data                   | Classifica            |
| Ultimo giro e giro più veloce di ogni pilota ★                     | Lap Data + Session History | Classifica            |
| Posizione a inizio di ogni giro (grafico) ★                        | Lap Positions              | Grafico posizioni     |
| Velocità massima allo speed trap di ogni pilota ★                  | Lap Data + Event           | Speed trap            |
| Classifica finale con stint e punti                                | Final Classification       | — (futuro)            |

## Battaglia e ritmo (calcolati) ★

| Dato                                                   | Come                            | Blocco                          |
| ------------------------------------------------------ | ------------------------------- | ------------------------------- |
| Distacco da chi precede e da chi segue                 | Lap Data                        | Battaglia                       |
| **Trend del distacco** (s/giro, scarta pit e anomalie) | storico distacchi giro per giro | Battaglia                       |
| **Giri per raggiungere / essere raggiunti**            | distacco ÷ trend                | Battaglia                       |
| Differenza di età gomme con l'avversario               | Car Status                      | Battaglia                       |
| Entro 1 s (potenziale DRS)                             | Lap Data                        | Battaglia                       |
| Ritmo medio degli ultimi giri                          | Session History                 | (vista, disponibile ai blocchi) |

## Tempi

| Dato                                                     | Fonte                          | Blocco                   |
| -------------------------------------------------------- | ------------------------------ | ------------------------ |
| Tempo del giro in corso, ultimo, migliore                | Lap Data / History             | Delta live               |
| **Delta live metro per metro sul miglior giro valido** ★ | calcolato (campioni ogni 10 m) | Delta live               |
| Giro invalidato                                          | Lap Data                       | Delta live, Storico giri |
| Settori del giro con colori TV (viola/verde/giallo)      | Lap Data + History             | Settori                  |
| Migliori settori personali e assoluti ★                  | Session History                | Settori                  |
| Storico dei propri giri con settori e mescola ★          | Session History                | Storico giri             |

## Vettura del giocatore

| Dato                                                                                         | Fonte                  | Blocco                |
| -------------------------------------------------------------------------------------------- | ---------------------- | --------------------- |
| Velocità, marcia, giri motore, luci di cambiata                                              | Car Telemetry          | Cockpit               |
| Marcia suggerita                                                                             | Car Telemetry          | —                     |
| Acceleratore, freno, sterzo (+ traccia)                                                      | Car Telemetry          | Pedali e sterzo       |
| DRS: consentito, aperto, distanza dalla zona                                                 | Car Status / Telemetry | DRS, Cockpit          |
| Aero attiva (curva/rettilineo), Overtake mode (2026)                                         | Car Telemetry 2        | Aero attiva           |
| Usura per gomma ★, temperatura di superficie e **carcassa** ★, pressione ★, **blistering** ★ | Damage + Telemetry     | Gomme                 |
| Mescola effettiva e visiva, età in giri                                                      | Car Status             | Gomme, Strategia      |
| Temperature dei 4 freni ★, ripartizione frenata                                              | Telemetry + Status     | Freni                 |
| **Usura di ogni componente PU** (ICE, MGU-H, MGU-K, ES, CE, TC) e cambio ★                   | Car Damage             | Power unit            |
| Temperatura motore, potenza ICE e MGU-K ★                                                    | Telemetry + Status     | Power unit            |
| Danni ali, fondo, diffusore, pance, guasti DRS/ERS                                           | Car Damage             | Danni                 |
| Carburante (kg), giri di autonomia, **margine sul traguardo** ★, miscela                     | Car Status             | Carburante, Strategia |
| Batteria ERS, modalità, energia rilasciata/recuperata nel giro ★, limite (2026)              | Car Status             | ERS                   |
| Forze G laterali/longitudinali e picchi del giro ★                                           | Motion                 | Forze G               |
| Assetto completo (ali, differenziale, campanatura…)                                          | Car Setups             | — (futuro)            |
| Fisica estesa: slip ruote, carichi, altezza da terra                                         | Motion Ex              | — (futuro)            |

## Strategia

| Dato                                                   | Fonte              | Blocco     |
| ------------------------------------------------------ | ------------------ | ---------- |
| **Finestra pit consigliata** (giro ideale e ultimo) ★  | Session            | Strategia  |
| **Posizione prevista al rientro** ★                    | Session            | Strategia  |
| Sequenza degli stint                                   | Session History    | Strategia  |
| Treni di gomme disponibili e vita residua              | Tyre Sets          | — (futuro) |
| Limite di velocità in pit lane, timer pit lane e sosta | Session + Lap Data | (vista)    |

## Pista, meteo, direzione gara

| Dato                                                                             | Fonte             | Blocco                |
| -------------------------------------------------------------------------------- | ----------------- | --------------------- |
| Circuito, tipo di sessione, lunghezza                                            | Session           | Sessione, barra       |
| Meteo attuale, temperature pista/aria                                            | Session           | Sessione              |
| **Previsioni meteo** con probabilità di pioggia ★                                | Session           | Meteo previsto        |
| Safety car / VSC / giro di formazione, bandiera rossa                            | Session + Event   | Direzione gara        |
| **Bandiere gialle per settore** (zone marshal) ★                                 | Session           | Direzione gara, Mappa |
| Bandiera blu per il giocatore                                                    | Car Status        | Direzione gara        |
| Semafori di partenza                                                             | Event             | Direzione gara        |
| Feed eventi: sorpassi, penalità e motivo, giri veloci, ritiri, collisioni, DRS ★ | Event             | Feed                  |
| Mappa con tutte le auto (tracciato appreso), settori, zone DRS apprese ★         | Motion + Lap Data | Mappa                 |
| Numero di SC/VSC/bandiere rosse della sessione                                   | Session           | Sessione              |
| Impostazioni della sessione (aiuti, danni, regole)                               | Session           | —                     |
