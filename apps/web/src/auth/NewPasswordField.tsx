import { useState } from 'react';
import { Checkbox, Field, Input } from '@/ui/Field';
import { PASSWORD_MAX, passwordProblem } from './client';

/**
 * Champ de nouveau mot de passe : la règle s'affiche pendant la saisie (la même que l'API), le
 * mot de passe peut s'afficher en clair, et le collage depuis un gestionnaire reste permis.
 */
export function NewPasswordField({
  value,
  onChange,
  label = 'Nouveau mot de passe',
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const [visible, setVisible] = useState(false);
  const problem = value ? passwordProblem(value) : null;
  return (
    <>
      <Field
        label={label}
        hint={
          problem ?? '12 caractères au moins. Une phrase de quelques mots fait un bon mot de passe.'
        }
      >
        {(control) => (
          <Input
            {...control}
            type={visible ? 'text' : 'password'}
            autoComplete="new-password"
            required
            maxLength={PASSWORD_MAX}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </Field>
      <Checkbox
        label="Afficher le mot de passe"
        checked={visible}
        onChange={(e) => setVisible(e.target.checked)}
      />
    </>
  );
}
