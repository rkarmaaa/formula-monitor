import { defaultGameId, isGameId, type GameId } from '@data/games';

// Preferenze del singolo dispositivo (versione di gioco, layout, opzioni dei blocchi).
// localStorage può essere bloccato (navigazione privata): ogni accesso è protetto.
const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* preferenza non salvata: il monitor funziona lo stesso */
  }
};

export const hasGame = () => isGameId(read('fm:game'));

export function getGame(): GameId {
  const saved = read('fm:game');
  return isGameId(saved) ? saved : defaultGameId;
}

export function setGame(id: GameId) {
  write('fm:game', id);
  document.documentElement.dataset.game = id;
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = read(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const writeJson = (key: string, value: unknown) =>
  write(key, value === undefined ? null : JSON.stringify(value));
