import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Versione automatica dai commit: major.minor da package.json, patch = commit dopo l'ultimo cambio di "version".
// Alzare a mano major o minor in package.json azzera il conteggio; senza git resta la versione di package.json.
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

export function appVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  const [major = 0, minor = 0, patch = 0] = pkg.version.split('.').map(Number);
  try {
    const bump = git('log', '-1', '--format=%H', '-G"version"', '--', 'package.json');
    const commits = Number(git('rev-list', '--count', bump ? `${bump}..HEAD` : 'HEAD'));
    return `${major}.${minor}.${patch + commits}`;
  } catch {
    return pkg.version;
  }
}
