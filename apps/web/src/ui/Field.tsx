import {
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from 'react';
import './ui.css';

// Un champ de formulaire : libellé visible, aide et erreur reliées au champ pour les lecteurs
// d'écran. Le champ lui-même est passé en fonction, pour garder n'importe quel contrôle.

export interface ControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null | undefined;
  required?: boolean;
  children: (control: ControlProps) => ReactNode;
}

export function Field({ label, hint, error, required = false, children }: FieldProps) {
  const id = useId();
  const described = [hint ? `${id}-aide` : '', error ? `${id}-erreur` : ''].filter(Boolean);
  const control: ControlProps = {
    id,
    ...(described.length ? { 'aria-describedby': described.join(' ') } : {}),
    ...(error ? { 'aria-invalid': true as const } : {}),
  };
  return (
    <div className="ui-champ-bloc">
      <label htmlFor={id} className="ui-libelle">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {children(control)}
      {hint && (
        <span id={`${id}-aide`} className="ui-aide">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-erreur`} className="ui-erreur" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

const withClass = (base: string, extra: string | undefined) => (extra ? `${base} ${extra}` : base);

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={withClass('ui-champ', className)} {...rest} />;
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={withClass('ui-champ', className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={withClass('ui-champ ui-champ-long', className)} {...rest} />;
}

/** Une case à cocher avec son libellé cliquable, cible de 44 px. */
export function Checkbox({
  label,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={withClass('ui-case', className)}>
      <input type="checkbox" {...rest} />
      {label}
    </label>
  );
}
