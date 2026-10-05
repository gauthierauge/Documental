import { z } from 'zod';
import type { EntityConfig, FieldConfig, SettingConfig } from '@documental/contracts/admin-types';

function fieldSchema(field: FieldConfig): z.ZodType {
  const error = `${field.label} : valeur invalide`;
  switch (field.type) {
    case 'texte':
    case 'telephone':
      return z.string({ error }).trim().max(500, `${field.label} : 500 caractères au plus`);
    case 'texte_long':
      return z.string({ error }).trim().max(20_000, `${field.label} : trop long`);
    case 'email':
      return z.email(`${field.label} : adresse e-mail invalide`).max(320);
    case 'nombre':
      return z.number({ error });
    case 'montant':
      return z.number({ error }).int(`${field.label} : montant en centimes`);
    case 'date':
      return z.iso.date(`${field.label} : date invalide`);
    case 'oui_non':
      return z.boolean({ error });
    case 'liste':
      return z.enum(
        field.options as [string, ...string[]],
        `${field.label} : valeur hors de la liste`,
      );
    case 'lien':
      return z.string({ error }).min(1, error);
  }
}

const BLANKABLE = new Set(['texte', 'texte_long', 'email', 'telephone', 'date', 'lien']);

function isBlank(value: unknown): boolean {
  return (
    value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
  );
}

export function entitySchemas(entity: EntityConfig) {
  const create: Record<string, z.ZodType> = {};
  const update: Record<string, z.ZodType> = {};
  for (const field of entity.fields) {
    const base = fieldSchema(field);
    const optional = BLANKABLE.has(field.type)
      ? z.preprocess((v) => (isBlank(v) ? null : v), base.nullable())
      : base.nullable();
    const required = z.preprocess(
      (v) => (BLANKABLE.has(field.type) && isBlank(v) ? undefined : v),
      z
        .unknown()
        .superRefine((v, ctx) => {
          if (v === undefined || v === null)
            ctx.addIssue({ code: 'custom', message: `${field.label} : obligatoire` });
        })
        .pipe(base),
    );
    create[field.key] = field.required ? required : optional.optional();
    update[field.key] = (field.required ? required : optional).optional();
  }
  return { create: z.object(create).strict(), update: z.object(update).strict() };
}

export function settingsSchema(settings: readonly SettingConfig[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const s of settings) {
    const value: z.ZodType =
      s.type === 'email'
        ? z.union([z.email('Adresse e-mail invalide'), z.literal('')])
        : s.type === 'nombre'
          ? z.number().finite()
          : s.type === 'oui_non'
            ? z.boolean()
            : z.string().max(s.type === 'texte' ? 500 : 5_000);
    shape[s.key] = value.nullable().optional();
  }
  return z.object(shape).strict();
}

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_');
    if (issue.code === 'unrecognized_keys') {
      out._ = `Champ inconnu : ${issue.keys.join(', ')}`;
    } else out[key] ??= issue.message;
  }
  return out;
}
