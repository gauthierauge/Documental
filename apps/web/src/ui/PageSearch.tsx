import { useId, useState } from 'react';
import { navigate } from '@/router';
import { NavList } from './NavList';
import type { NavItem } from './navigation';

// Rechercher une page du menu par son nom : les résultats s'affichent sous le champ, Entrée
// ouvre le premier, Échap vide le champ.

const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Les pages dont le nom contient chaque mot tapé, sans tenir compte des accents ni des majuscules. */
export function findPages(pages: NavItem[], query: string): NavItem[] {
  const words = plain(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return pages.filter((page) => words.every((word) => plain(page.label).includes(word)));
}

export function PageSearch({ pages }: { pages: NavItem[] }) {
  const id = useId();
  const [query, setQuery] = useState('');
  const results = findPages(pages, query);
  const searching = query.trim() !== '';
  const found =
    results.length > 1 ? `${results.length} pages trouvées` : `${results.length} page trouvée`;
  const clear = () => setQuery('');
  return (
    <search className="ui-recherche">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const [first] = results;
          if (!first) return;
          clear();
          navigate(first.href);
        }}
      >
        <label htmlFor={id} className="sr-only">
          Rechercher une page
        </label>
        <input
          id={id}
          type="search"
          className="ui-champ"
          placeholder="Rechercher une page"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') clear();
          }}
        />
        <p role="status" className="sr-only">
          {searching ? found : ''}
        </p>
        {searching && (
          <div className="ui-recherche-resultats">
            {results.length ? (
              <NavList pages={results} onNavigate={clear} />
            ) : (
              <p className="ui-recherche-vide">Aucune page ne porte ce nom.</p>
            )}
          </div>
        )}
      </form>
    </search>
  );
}
