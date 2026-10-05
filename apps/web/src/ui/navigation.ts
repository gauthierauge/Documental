// La navigation de la coquille, sans React : testée seule.

/** Une page du menu principal. */
export interface NavItem {
  href: string;
  label: string;
}

/** La page ouverte : l'accueil seulement sur `/`, une section aussi sur ses sous-pages. */
export function isCurrent(href: string, path: string): boolean {
  return href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
}
