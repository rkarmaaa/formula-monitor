// Team per ID UDP (appendice delle specifiche 2025 + 2026): nome breve e colore di riferimento.
// I colori sono dati (applicati come custom property --team), non token di stile.
interface Team {
  name: string;
  color: string;
  // Logo in public/teams/<logo>.png, quando disponibile (altrimenti un quadrato nel colore del team)
  logo?: string;
}

const base: Record<string, Team> = {
  mercedes: { name: 'Mercedes', color: '#2bd9c2' },
  ferrari: { name: 'Ferrari', color: '#e8102e', logo: 'ferrari' },
  redbull: { name: 'Red Bull', color: '#4777d6' },
  williams: { name: 'Williams', color: '#5ab8f5' },
  aston: { name: 'Aston Martin', color: '#26a37a' },
  alpine: { name: 'Alpine', color: '#f58ac0' },
  rb: { name: 'Racing Bulls', color: '#7a9cff' },
  haas: { name: 'Haas', color: '#a3a9b0' },
  mclaren: { name: 'McLaren', color: '#ff8a1a' },
  sauber: { name: 'Sauber', color: '#4fdb5a' },
  audi: { name: 'Audi', color: '#d6dbe2' },
  cadillac: { name: 'Cadillac', color: '#c9a65a' },
  generic: { name: 'F1', color: '#8a93a6' },
};

const f2 = (name: string, color: string): Team => ({ name, color });

export const teams: Record<number, Team> = {
  0: base.mercedes!,
  1: base.ferrari!,
  2: base.redbull!,
  3: base.williams!,
  4: base.aston!,
  5: base.alpine!,
  6: base.rb!,
  7: base.haas!,
  8: base.mclaren!,
  9: base.sauber!,
  41: base.generic!,
  104: { name: 'Custom', color: '#e6e9ef' },
  129: f2('Konnersport', '#ff6b4a'),
  142: f2('APXGP', '#2f3542'),
  154: f2('APXGP', '#2f3542'),
  155: f2('Konnersport', '#ff6b4a'),
  158: f2('ART GP', '#9aa3ad'),
  159: f2('Campos', '#e84d4d'),
  160: f2('Rodin', '#3b82f6'),
  161: f2('AIX Racing', '#f59e0b'),
  162: f2('DAMS', '#38bdf8'),
  163: f2('Hitech', '#c0c7d0'),
  164: f2('MP Motorsport', '#fb923c'),
  165: f2('Prema', '#ef4444'),
  166: f2('Trident', '#60a5fa'),
  167: f2('Van Amersfoort', '#f97316'),
  168: f2('Invicta', '#a3e635'),
  185: base.mercedes!,
  186: base.ferrari!,
  187: base.redbull!,
  188: base.williams!,
  189: base.aston!,
  190: base.alpine!,
  191: base.rb!,
  192: base.haas!,
  193: base.mclaren!,
  194: base.sauber!,
  465: f2('ART GP', '#9aa3ad'),
  466: f2('Campos', '#e84d4d'),
  467: f2('Rodin', '#3b82f6'),
  468: f2('AIX Racing', '#f59e0b'),
  469: f2('DAMS', '#38bdf8'),
  470: f2('Hitech', '#c0c7d0'),
  471: f2('MP Motorsport', '#fb923c'),
  472: f2('Prema', '#ef4444'),
  473: f2('Trident', '#60a5fa'),
  474: f2('Van Amersfoort', '#f97316'),
  475: f2('Invicta', '#a3e635'),
  476: base.mercedes!,
  477: base.ferrari!,
  478: base.redbull!,
  479: base.williams!,
  480: base.aston!,
  481: base.alpine!,
  482: base.rb!,
  483: base.haas!,
  484: base.mclaren!,
  485: base.audi!,
  486: base.cadillac!,
};

export const teamOf = (id: number | undefined): Team => (id !== undefined && teams[id]) || base.generic!;
