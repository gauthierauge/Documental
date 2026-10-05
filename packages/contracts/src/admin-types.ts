export type FieldType =
  | 'texte'
  | 'texte_long'
  | 'nombre'
  | 'montant'
  | 'date'
  | 'oui_non'
  | 'liste'
  | 'email'
  | 'telephone'
  | 'lien';

export type Action = 'lire' | 'creer' | 'modifier' | 'archiver' | 'exporter';
export type Role = 'admin' | 'editeur' | 'lecteur';
export type SettingType = 'texte' | 'texte_long' | 'email' | 'nombre' | 'oui_non' | 'horaires';

export interface FieldConfig {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: readonly string[];
  target?: string;
}

export interface EntityConfig {
  key: string;
  label: string;
  actions: readonly Action[];
  fields: readonly FieldConfig[];
}

export interface SettingConfig {
  key: string;
  label: string;
  type: SettingType;
  public: boolean;
}

export interface AdminConfig {
  entities: readonly EntityConfig[];
  settings: readonly SettingConfig[];
  sections: { accueil: boolean; comptes: boolean; exports: boolean; journal: true };
}

export const ROLE_ACTIONS: Record<Role, readonly Action[]> = {
  admin: ['lire', 'creer', 'modifier', 'archiver', 'exporter'],
  editeur: ['lire', 'creer', 'modifier', 'archiver', 'exporter'],
  lecteur: ['lire', 'exporter'],
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  editeur: 'Éditeur',
  lecteur: 'Lecteur',
};

export function allowedActions(role: Role, entity: EntityConfig): Action[] {
  return entity.actions.filter((a) => ROLE_ACTIONS[role].includes(a));
}

export function titleField(entity: EntityConfig): FieldConfig | undefined {
  return (
    entity.fields.find((f) => f.type === 'texte') ?? entity.fields.find((f) => f.type === 'email')
  );
}

export function formatMontant(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

export function parseMontant(input: string): number | null {
  const clean = input.replace(/\s|€/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatValue(field: FieldConfig, value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  switch (field.type) {
    case 'montant':
      return formatMontant(Number(value));
    case 'date':
      return formatDate(String(value));
    case 'oui_non':
      return value ? 'oui' : 'non';
    case 'nombre':
      return new Intl.NumberFormat('fr-FR').format(Number(value));
    default:
      return String(value);
  }
}
