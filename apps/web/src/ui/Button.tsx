import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';
import { Link } from '@/router';
import './ui.css';

// Boutons et liens en forme de bouton : une action principale par écran au plus.

export type ButtonVariant = 'primaire' | 'secondaire' | 'discret' | 'danger';

export function buttonClass(variant: ButtonVariant, extra?: string): string {
  return ['ui-bouton', `ui-bouton-${variant}`, extra].filter(Boolean).join(' ');
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant };

export function Button({
  variant = 'secondaire',
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return <button type={type} className={buttonClass(variant, className)} {...rest} />;
}

type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: ButtonVariant;
};

/** Un lien vers une page de l'app, qui a l'air d'un bouton. */
export function ButtonLink({ variant = 'secondaire', className, ...rest }: ButtonLinkProps) {
  return <Link className={buttonClass(variant, className)} {...rest} />;
}
