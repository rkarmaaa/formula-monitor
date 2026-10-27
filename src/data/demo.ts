// Dati del simulatore DEV: griglia (ID driver/team/nazionalità dalle appendici UDP) e circuito.
export interface DemoDriver {
  driverId: number;
  name: string;
  team2025: number;
  team2026: number;
  number: number;
  nationality: number;
  skill: number;
}

export const demoGrid: DemoDriver[] = [
  { driverId: 50, name: 'George Russell', team2025: 0, team2026: 476, number: 63, nationality: 10, skill: 0.994 },
  { driverId: 165, name: 'Kimi Antonelli', team2025: 0, team2026: 476, number: 12, nationality: 41, skill: 0.988 },
  { driverId: 58, name: 'Charles Leclerc', team2025: 1, team2026: 477, number: 16, nationality: 53, skill: 0.995 },
  { driverId: 7, name: 'Lewis Hamilton', team2025: 1, team2026: 477, number: 44, nationality: 10, skill: 0.992 },
  { driverId: 9, name: 'Max Verstappen', team2025: 2, team2026: 478, number: 1, nationality: 22, skill: 0.998 },
  { driverId: 94, name: 'Yuki Tsunoda', team2025: 2, team2026: 482, number: 22, nationality: 43, skill: 0.984 },
  { driverId: 62, name: 'Alexander Albon', team2025: 3, team2026: 479, number: 23, nationality: 80, skill: 0.986 },
  { driverId: 0, name: 'Carlos Sainz', team2025: 3, team2026: 479, number: 55, nationality: 77, skill: 0.987 },
  { driverId: 3, name: 'Fernando Alonso', team2025: 4, team2026: 480, number: 14, nationality: 77, skill: 0.985 },
  { driverId: 19, name: 'Lance Stroll', team2025: 4, team2026: 480, number: 18, nationality: 13, skill: 0.978 },
  { driverId: 59, name: 'Pierre Gasly', team2025: 5, team2026: 481, number: 10, nationality: 28, skill: 0.983 },
  { driverId: 162, name: 'Franco Colapinto', team2025: 5, team2026: 481, number: 43, nationality: 2, skill: 0.977 },
  { driverId: 113, name: 'Liam Lawson', team2025: 6, team2026: 482, number: 30, nationality: 54, skill: 0.981 },
  { driverId: 149, name: 'Isack Hadjar', team2025: 6, team2026: 478, number: 6, nationality: 28, skill: 0.984 },
  { driverId: 17, name: 'Esteban Ocon', team2025: 7, team2026: 483, number: 31, nationality: 28, skill: 0.98 },
  { driverId: 147, name: 'Oliver Bearman', team2025: 7, team2026: 483, number: 87, nationality: 10, skill: 0.981 },
  { driverId: 54, name: 'Lando Norris', team2025: 8, team2026: 484, number: 4, nationality: 10, skill: 0.997 },
  { driverId: 112, name: 'Oscar Piastri', team2025: 8, team2026: 484, number: 81, nationality: 3, skill: 0.996 },
  { driverId: 10, name: 'Nico Hülkenberg', team2025: 9, team2026: 485, number: 27, nationality: 29, skill: 0.979 },
  { driverId: 161, name: 'Gabriel Bortoleto', team2025: 9, team2026: 485, number: 5, nationality: 9, skill: 0.978 },
];

// Solo nel formato 2026 (11 team, 22 auto)
export const demoGrid2026Extra: DemoDriver[] = [
  { driverId: 14, name: 'Sergio Pérez', team2025: 41, team2026: 486, number: 11, nationality: 52, skill: 0.976 },
  { driverId: 15, name: 'Valtteri Bottas', team2025: 41, team2026: 486, number: 77, nationality: 27, skill: 0.975 },
];

export const demoPlayerDriverId = 7;

// Circuito: punti di controllo (metri) di una spline chiusa in senso orario, scalata alla lunghezza reale
export const demoTrack = {
  trackId: 11,
  length: 5793,
  control: [
    [0, -350],
    [0, 300],
    [0, 900],
    [10, 1010],
    [55, 1040],
    [40, 1110],
    [60, 1200],
    [180, 1520],
    [380, 1730],
    [620, 1790],
    [740, 1775],
    [770, 1735],
    [820, 1745],
    [980, 1690],
    [1070, 1590],
    [1100, 1460],
    [1075, 1340],
    [1000, 1000],
    [905, 610],
    [880, 470],
    [850, 430],
    [868, 360],
    [835, 250],
    [790, -150],
    [740, -560],
    [660, -760],
    [480, -830],
    [280, -760],
    [110, -590],
  ] as [number, number][],
};
