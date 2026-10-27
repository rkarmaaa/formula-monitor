// Utilità di testo condivise da componenti e script (niente DOM)
const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// "*parola*" → <em>parola</em> (accento dei titoli)
export const accent = (text: string) => escapeHtml(text).replace(/\*(.+?)\*/g, '<em>$1</em>');

// "Ciao {name}" + { name: 'Luca' } → "Ciao Luca"
export const fill = (template: string, vars: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`));
