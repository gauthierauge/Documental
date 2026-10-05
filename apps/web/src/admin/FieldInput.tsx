import { type ReactNode, useEffect, useState } from 'react';
import { type FieldConfig, formatMontant, parseMontant } from '@documental/contracts/admin-types';
import { api } from '@/api';
import { Checkbox, type ControlProps, Field, Input, Select, Textarea } from '@/ui/Field';

// Un champ de formulaire selon son type. Les montants se saisissent en euros et voyagent
// en centimes ; les liens proposent les lignes du contenu lié.

interface Props {
  field: FieldConfig;
  value: unknown;
  error?: string | undefined;
  disabled: boolean;
  onChange: (value: unknown) => void;
}

function LinkSelect({
  field,
  value,
  disabled,
  onChange,
  control,
}: Props & { control: ControlProps }) {
  const [options, setOptions] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => {
    if (field.target)
      api<{ id: string; label: string }[]>(`/admin/contenus/${field.target}/options`)
        .then(setOptions)
        .catch(() => setOptions([]));
  }, [field.target]);
  return (
    <Select
      {...control}
      value={String(value ?? '')}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

function toText(value: unknown): string {
  return value === null || value === undefined || value === ''
    ? ''
    : formatMontant(Number(value)).replace(/\s?€/, '');
}

function MoneyInput({ value, disabled, onChange, control }: Props & { control: ControlProps }) {
  const [text, setText] = useState(() => toText(value));
  // La valeur arrive après le chargement de la fiche : on la reprend si elle diffère de la saisie.
  // oxlint-disable react/exhaustive-deps -- seule la valeur externe compte ici.
  useEffect(() => {
    if (parseMontant(text) !== value && typeof value === 'number') setText(toText(value));
  }, [value]);
  // oxlint-enable react/exhaustive-deps
  return (
    <Input
      {...control}
      inputMode="decimal"
      value={text}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        const cents = parseMontant(e.target.value);
        onChange(e.target.value.trim() === '' ? null : (cents ?? e.target.value));
      }}
    />
  );
}

function Control({ props, control }: { props: Props; control: ControlProps }): ReactNode {
  const { field, value, disabled, onChange } = props;
  switch (field.type) {
    case 'texte_long':
      return (
        <Textarea
          {...control}
          rows={5}
          value={String(value ?? '')}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'liste':
      return (
        <Select
          {...control}
          value={String(value ?? field.options?.[0] ?? '')}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          {field.options?.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </Select>
      );
    case 'lien':
      return <LinkSelect {...props} control={control} />;
    case 'montant':
      return <MoneyInput {...props} control={control} />;
    case 'nombre':
      return (
        <Input
          {...control}
          type="number"
          step="any"
          value={value === null || value === undefined ? '' : String(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      );
    default: {
      const type =
        field.type === 'email'
          ? 'email'
          : field.type === 'telephone'
            ? 'tel'
            : field.type === 'date'
              ? 'date'
              : 'text';
      return (
        <Input
          {...control}
          type={type}
          value={String(value ?? '')}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }
  }
}

export function FieldInput(props: Props) {
  const { field, value, error, disabled, onChange } = props;
  if (field.type === 'oui_non') {
    return (
      <div className="ui-champ-bloc">
        <Checkbox
          label={field.label}
          checked={Boolean(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        {error && (
          <span className="ui-erreur" role="alert">
            {error}
          </span>
        )}
      </div>
    );
  }
  return (
    <Field label={field.label} required={Boolean(field.required)} error={error}>
      {(control) => <Control props={props} control={control} />}
    </Field>
  );
}
