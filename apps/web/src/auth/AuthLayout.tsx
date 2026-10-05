import { type ReactNode, useEffect } from 'react';
import { useCurrentUser } from '@/auth/client';
import { redirect } from '@/router';
import '@/auth/auth.css';

export const AUTH_PATHS: readonly string[] = [
  '/connexion',
  '/mot-de-passe/oublie',
  '/mot-de-passe/nouveau',
];

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="auth-fond">
      <main id="contenu" className="auth-cadre" tabIndex={-1}>
        <p className="auth-marque">{title}</p>
        <div className="auth-carte">{children}</div>
      </main>
    </div>
  );
}

export function useRedirectWhenSignedIn(to: () => string): void {
  const { user, pending } = useCurrentUser();
  useEffect(() => {
    if (!pending && user) redirect(to());
  }, [pending, user, to]);
}
