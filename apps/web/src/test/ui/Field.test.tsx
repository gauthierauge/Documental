// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { Field, Input } from '@/ui/Field';

describe('Field', () => {
  it('relie le libellé, l’aide et l’erreur au champ', () => {
    render(
      <Field label="Adresse e-mail" hint="Celle du travail" error="Adresse invalide">
        {(control) => <Input type="email" {...control} />}
      </Field>,
    );
    const input = screen.getByLabelText('Adresse e-mail');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Celle du travail Adresse invalide');
    expect(screen.getByRole('alert')).toHaveTextContent('Adresse invalide');
  });

  it('ne marque pas un champ sans erreur comme invalide', () => {
    render(<Field label="Nom">{(control) => <Input {...control} />}</Field>);
    expect(screen.getByLabelText('Nom')).not.toHaveAttribute('aria-invalid');
  });
});
