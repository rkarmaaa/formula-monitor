// Preferenze del singolo dispositivo (tracciati appresi). localStorage può essere bloccato
// (navigazione privata): ogni accesso è protetto.
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
