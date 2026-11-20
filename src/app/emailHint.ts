/** Häufige Tippfehler bei E-Mail-Anbietern → Vorschlag („Meintest du …?“) */
const DOMAINS = ['gmail.com', 'gmail.de', 'googlemail.com', 'web.de', 'gmx.de', 'gmx.net', 't-online.de', 'outlook.com', 'outlook.de', 'hotmail.com', 'hotmail.de', 'icloud.com', 'yahoo.com', 'yahoo.de', 'freenet.de', 'live.de', 'me.com', 'posteo.de', 'mail.de'];

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

/** Liefert die korrigierte Adresse, wenn der Anbieter vermutlich vertippt ist – sonst null. */
export function emailSuggestion(email: string): string | null {
  const m = /^([^@\s]+)@([^@\s]+\.[a-z]{2,})$/i.exec(email.trim());
  if (!m) return null;
  const domain = m[2].toLowerCase();
  if (DOMAINS.includes(domain)) return null;
  let best: string | null = null;
  let bestD = 3;
  for (const d of DOMAINS) {
    const dist = distance(domain, d);
    if (dist < bestD) {
      bestD = dist;
      best = d;
    }
  }
  return best && bestD <= 2 ? `${m[1]}@${best}` : null;
}
