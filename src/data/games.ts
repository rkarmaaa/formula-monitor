import type { UdpFormat } from '../lib/f1/schema.ts';

// Versioni di gioco selezionabili all'avvio: decidono formato UDP atteso, istruzioni e layout
export const games = [
  { id: 'f1-25', udpFormat: 2025, maxCars: 22 },
  { id: 'f1-25-2026', udpFormat: 2026, maxCars: 24 },
] as const satisfies readonly { id: string; udpFormat: UdpFormat; maxCars: number }[];

export type Game = (typeof games)[number];
export type GameId = Game['id'];

export const defaultGameId: GameId = 'f1-25';

export const isGameId = (value: unknown): value is GameId => games.some((game) => game.id === value);
export const gameById = (id: GameId): Game => games.find((game) => game.id === id) ?? games[0];
export const gameByFormat = (format: number): Game | undefined => games.find((game) => game.udpFormat === format);

// Porte di default: 20777 è quella del gioco, il monitor risponde sulla successiva libera "memorabile"
export const ports = { udp: 20777, http: 20780 } as const;
export const wsPath = '/ws';
