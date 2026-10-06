import { parseInline, parseMarkdown, safeHref, safeImageSrc } from '@/documents/markdown-parser';

function texteDe(blocks: ReturnType<typeof parseMarkdown>): string {
  const inline = (nodes: ReturnType<typeof parseInline>): string =>
    nodes
      .map((n) => {
        if (n.type === 'texte' || n.type === 'code') return n.value;
        if (n.type === 'image') return n.alt;
        return inline(n.children);
      })
      .join('');
  return blocks
    .map((b) => {
      if (b.type === 'filet') return '―';
      if (b.type === 'code') return b.value;
      if (b.type === 'liste') return b.items.map(inline).join(' | ');
      return inline(b.children);
    })
    .join('\n');
}

describe('safeHref', () => {
  it('accepte un chemin de l’application, une ancre et les schémas permis', () => {
    expect(safeHref('/documents/abc')).toBe('/documents/abc');
    expect(safeHref('#section')).toBe('#section');
    expect(safeHref('https://exemple.fr/a')).toBe('https://exemple.fr/a');
    expect(safeHref('mailto:a@exemple.fr')).toBe('mailto:a@exemple.fr');
    expect(safeHref('  https://exemple.fr  ')).toBe('https://exemple.fr');
  });

  it('refuse tout ce qui peut s’exécuter ou sortir de l’origine', () => {
    for (const hostile of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      '  javascript:alert(1)',
      'java\tscript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox',
      '//exemple-hostile.fr',
      'file:///etc/passwd',
      '',
    ]) {
      expect(safeHref(hostile), hostile).toBeNull();
    }
  });
});

describe('safeImageSrc', () => {
  it('n’accepte qu’un chemin de l’application', () => {
    expect(safeImageSrc('/api/documents/fichiers/abc')).toBe('/api/documents/fichiers/abc');
    expect(safeImageSrc('https://ailleurs.fr/pixel.png')).toBeNull();
    expect(safeImageSrc('//ailleurs.fr/pixel.png')).toBeNull();
    expect(safeImageSrc('data:image/svg+xml,<svg onload=alert(1)>')).toBeNull();
  });
});

describe('parseInline', () => {
  it('reconnaît gras, italique et code', () => {
    expect(parseInline('un **mot** et _un autre_ et `du code`')).toEqual([
      { type: 'texte', value: 'un ' },
      { type: 'fort', children: [{ type: 'texte', value: 'mot' }] },
      { type: 'texte', value: ' et ' },
      { type: 'accent', children: [{ type: 'texte', value: 'un autre' }] },
      { type: 'texte', value: ' et ' },
      { type: 'code', value: 'du code' },
    ]);
  });

  it('marque les liens externes, pas les internes', () => {
    const [interne, , externe] = parseInline('[ici](/documents/a) puis [là](https://exemple.fr)');
    expect(interne).toMatchObject({ type: 'lien', href: '/documents/a', externe: false });
    expect(externe).toMatchObject({ type: 'lien', href: 'https://exemple.fr', externe: true });
  });

  it('dégrade un lien d’adresse refusée en simple texte', () => {
    expect(parseInline('[clique](javascript:alert(1))')).toEqual([
      { type: 'texte', value: 'clique' },
    ]);
  });

  it('laisse un marqueur non refermé tel qu’il a été écrit', () => {
    expect(texteDe(parseMarkdown('2 ** 3 et [pas un lien'))).toBe('2 ** 3 et [pas un lien');
  });

  it('ne voit pas de balise là où il n’y en a pas', () => {
    const nodes = parseInline('<script>alert(1)</script>');
    expect(nodes).toEqual([{ type: 'texte', value: '<script>alert(1)</script>' }]);
  });
});

describe('parseMarkdown', () => {
  it('décale les titres d’un niveau : le h1 est le titre de la page', () => {
    const blocks = parseMarkdown('# Un\n## Deux\n### Trois');
    expect(blocks.map((b) => b.type === 'titre' && b.niveau)).toEqual([2, 3, 4]);
  });

  it('regroupe les lignes d’un paragraphe et sépare sur une ligne vide', () => {
    const blocks = parseMarkdown('une ligne\net sa suite\n\nun autre');
    expect(blocks).toHaveLength(2);
    expect(texteDe(blocks)).toBe('une ligne et sa suite\nun autre');
  });

  it('reconnaît les listes à puces et numérotées', () => {
    const [puces, nombres] = parseMarkdown('- un\n- deux\n\n1. premier\n2. second');
    expect(puces).toMatchObject({ type: 'liste', ordonnee: false });
    expect(nombres).toMatchObject({ type: 'liste', ordonnee: true });
    expect(puces && texteDe([puces])).toBe('un | deux');
  });

  it('garde un bloc de code intact, sans l’analyser', () => {
    const [block] = parseMarkdown('```\nconst a = **1**;\n\nconst b = [x](y);\n```');
    expect(block).toEqual({ type: 'code', value: 'const a = **1**;\n\nconst b = [x](y);' });
  });

  it('ferme un bloc de code resté ouvert', () => {
    expect(parseMarkdown('```\nsans fin')).toEqual([{ type: 'code', value: 'sans fin' }]);
  });

  it('reconnaît citations et filets', () => {
    const blocks = parseMarkdown('> une\n> citation\n\n---');
    expect(blocks[0]).toMatchObject({ type: 'citation' });
    expect(blocks[1]).toEqual({ type: 'filet' });
    expect(blocks[0] && texteDe([blocks[0]])).toBe('une citation');
  });

  it('ne rend une image que depuis un chemin de l’application', () => {
    const [ok] = parseMarkdown('![plan](/api/documents/fichiers/f1)');
    expect(ok).toMatchObject({
      children: [{ type: 'image', src: '/api/documents/fichiers/f1', alt: 'plan' }],
    });
    const [refusee] = parseMarkdown('![pixel](https://ailleurs.fr/p.png)');
    expect(refusee).toMatchObject({ children: [{ type: 'texte', value: 'pixel' }] });
  });

  it('accepte un texte vide', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('\n\n  \n')).toEqual([]);
  });
});
