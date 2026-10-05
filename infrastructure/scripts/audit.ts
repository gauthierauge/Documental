import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

export interface AuditException {
  id: string;
  paquet: string;
  raison: string;
  revoirLe: string;
}

export interface Advisory {
  url?: string;
  severity?: string;
  title?: string;
}

export type AuditReport = Record<string, Advisory[]>;

const SEVERITIES = ['critical', 'high', 'moderate', 'low'] as const;
type Severity = (typeof SEVERITIES)[number];
const BLOCKING: readonly Severity[] = ['critical', 'high'];
const SEVERITY_LABEL: Record<Severity, [string, string]> = {
  critical: ['critique', 'critiques'],
  high: ['haute', 'hautes'],
  moderate: ['modérée', 'modérées'],
  low: ['faible', 'faibles'],
};

function isException(value: unknown): value is AuditException {
  const e = value as Partial<AuditException> | null;
  return (
    typeof e === 'object' &&
    e !== null &&
    /^GHSA(-[a-z0-9]{4}){3}$/.test(String(e.id)) &&
    typeof e.paquet === 'string' &&
    typeof e.raison === 'string' &&
    e.raison.trim().length >= 10 &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(e.revoirLe))
  );
}

export function splitExceptions(
  raw: unknown,
  today: string,
): { active: AuditException[]; expired: AuditException[] } {
  const all = (Array.isArray(raw) ? raw : []).filter(isException);
  return {
    active: all.filter((e) => e.revoirLe >= today),
    expired: all.filter((e) => e.revoirLe < today),
  };
}

export function advisoryId(advisory: Advisory): string {
  return (
    String(advisory.url ?? '')
      .split('/')
      .pop() ?? ''
  );
}

export function withoutExceptions(report: unknown, active: AuditException[]): AuditReport {
  const ids = new Set(active.map((e) => e.id));
  const kept: AuditReport = {};
  if (!report || typeof report !== 'object') return kept;
  for (const [name, advisories] of Object.entries(report)) {
    if (!Array.isArray(advisories)) continue;
    const left = (advisories as Advisory[]).filter((a) => !ids.has(advisoryId(a)));
    if (left.length) kept[name] = left;
  }
  return kept;
}

export function packagesBySeverity(report: AuditReport): Record<Severity, string[]> {
  const out: Record<Severity, string[]> = { critical: [], high: [], moderate: [], low: [] };
  for (const [name, advisories] of Object.entries(report)) {
    for (const a of advisories) {
      const severity = SEVERITIES.find((s) => s === a.severity);
      if (severity && !out[severity].includes(name)) out[severity].push(name);
    }
  }
  return out;
}

export function auditVerdict(
  report: unknown,
  exceptionsRaw: unknown,
  today: string,
): { code: number; lines: string[] } {
  const { active, expired } = splitExceptions(exceptionsRaw, today);
  const left = withoutExceptions(report, active);
  const found = packagesBySeverity(left);
  const covered = Object.keys(report && typeof report === 'object' ? report : {}).filter(
    (name) => !(name in left),
  );
  const lines: string[] = [];
  for (const severity of SEVERITIES) {
    const names = found[severity];
    if (!names.length) continue;
    const [one, many] = SEVERITY_LABEL[severity];
    lines.push(`${names.length} ${names.length > 1 ? many : one} : ${names.join(', ')}`);
  }
  for (const e of active.filter((x) => covered.includes(x.paquet))) {
    lines.push(`exception écrite dans kit.json : ${e.paquet} (${e.id}), à revoir le ${e.revoirLe}`);
  }
  for (const e of expired) {
    lines.push(`exception échue le ${e.revoirLe}, à revoir : ${e.paquet} (${e.id})`);
  }
  const blocking = BLOCKING.some((s) => found[s].length > 0);
  if (blocking) {
    lines.unshift('✗ Audit des dépendances : vulnérabilité haute ou critique à corriger');
    return { code: 1, lines };
  }
  const anything = SEVERITIES.some((s) => found[s].length > 0);
  lines.unshift(
    anything
      ? '✓ Audit des dépendances : rien de haut ni de critique (le reste est à surveiller)'
      : '✓ Audit des dépendances : aucune vulnérabilité connue',
  );
  return { code: 0, lines };
}

export function parseAuditOutput(output: string): unknown {
  const start = output.indexOf('{');
  if (start === -1) return null;
  try {
    return JSON.parse(output.slice(start));
  } catch {
    return null;
  }
}

function readExceptions(): unknown {
  if (!existsSync('kit.json')) return [];
  const manifest = JSON.parse(readFileSync('kit.json', 'utf8')) as { auditExceptions?: unknown };
  return manifest.auditExceptions ?? [];
}

function main(): number {
  const result = spawnSync('bun', ['audit', '--json'], { encoding: 'utf8' });
  const report = parseAuditOutput(`${result.stdout ?? ''}`);
  if (report === null) {
    console.error('✗ Audit des dépendances indisponible (hors ligne ?) : rien de vérifié.');
    console.error(`${result.stderr ?? ''}`.trim());
    return 2;
  }
  const today = new Date().toISOString().slice(0, 10);
  const { code, lines } = auditVerdict(report, readExceptions(), today);
  for (const line of lines) (code === 0 ? console.info : console.error)(line);
  return code;
}

if (import.meta.main) process.exit(main());
