// Percorsi interni con il base path di Astro: '/' in locale, '/formula-monitor/' su GitHub Pages
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export const href = (path = '') => `${base}/${path.replace(/^\//, '')}`;
