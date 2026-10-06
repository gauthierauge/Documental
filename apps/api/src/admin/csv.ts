import type { EntityConfig } from '@documental/contracts/admin-types';
import { formatValue } from '@documental/contracts/admin-types';
import type { Row } from './store';

function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(
  entity: EntityConfig,
  rows: Row[],
  labels: Record<string, Record<string, string>>,
): string {
  const header = ['Identifiant', ...entity.fields.map((f) => f.label), 'Créé le'];
  const lines = rows.map((row) => [
    row.id,
    ...entity.fields.map((f) => {
      const value = row[f.key];
      if (f.type === 'lien' && typeof value === 'string') return labels[f.key]?.[value] ?? value;
      return formatValue(f, value);
    }),
    row.created_at instanceof Date
      ? row.created_at.toISOString().slice(0, 10)
      : String(row.created_at ?? ''),
  ]);
  return `\uFEFF${[header, ...lines].map((line) => line.map((v) => cell(String(v))).join(';')).join('\r\n')}\r\n`;
}
