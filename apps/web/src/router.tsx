import { type AnchorHTMLAttributes, useSyncExternalStore } from 'react';

// Un routeur minimal sur l'historique du navigateur : assez pour quelques écrans, sans
// dépendance. Si l'app grandit (routes imbriquées, chargement par route), passer à
// TanStack Router ou React Router, et l'écrire dans une décision.

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

export function usePath(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
    () => '/',
  );
}

export function navigate(to: string): void {
  window.history.pushState(null, '', to);
  for (const listener of listeners) listener();
  window.scrollTo(0, 0);
}

export function Link({ href = '/', onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.button !== 0) return;
        event.preventDefault();
        navigate(href);
      }}
      {...rest}
    />
  );
}
