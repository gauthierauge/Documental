export type Inline =
  | { type: 'texte'; value: string }
  | { type: 'code'; value: string }
  | { type: 'fort'; children: Inline[] }
  | { type: 'accent'; children: Inline[] }
  | { type: 'lien'; href: string; externe: boolean; children: Inline[] }
  | { type: 'image'; src: string; alt: string };

export type Block =
  | { type: 'titre'; niveau: 2 | 3 | 4; children: Inline[] }
  | { type: 'paragraphe'; children: Inline[] }
  | { type: 'liste'; ordonnee: boolean; items: Inline[][] }
  | { type: 'code'; value: string }
  | { type: 'citation'; children: Inline[] }
  | { type: 'filet' };

export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (!href) return null;
  if (href.startsWith('#')) return href;
  if (href.startsWith('/') && !href.startsWith('//')) return href;
  if (/^(https?:\/\/|mailto:)/i.test(href)) return href;
  return null;
}

export function safeImageSrc(raw: string): string | null {
  const src = raw.trim();
  return /^\/[^/]/.test(src) ? src : null;
}

function isExternal(href: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(href);
}

const TOKEN = /(`[^`\n]+`)|(!?\[)|(\*\*)|(\*|_)/;

function texte(value: string): Inline[] {
  return value ? [{ type: 'texte', value }] : [];
}

function readBracket(source: string, start: number): { inner: string; end: number } | null {
  let depth = 1;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (char === '[') depth += 1;
    else if (char === ']') {
      depth -= 1;
      if (depth === 0) return { inner: source.slice(start, i), end: i + 1 };
    }
  }
  return null;
}

function readParen(source: string, start: number): { inner: string; end: number } | null {
  if (source[start] !== '(') return null;
  let depth = 1;
  for (let i = start + 1; i < source.length; i += 1) {
    const char = source[i];
    if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) return { inner: source.slice(start + 1, i), end: i + 1 };
    }
  }
  return null;
}

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let rest = source;

  while (rest) {
    const match = TOKEN.exec(rest);
    if (match?.index === undefined) break;
    const before = rest.slice(0, match.index);
    const token = match[0];
    const after = rest.slice(match.index + token.length);

    const literal = () => {
      out.push(...texte(`${before}${token}`));
      rest = after;
    };

    if (token.startsWith('`')) {
      out.push(...texte(before), { type: 'code', value: token.slice(1, -1) });
      rest = after;
      continue;
    }

    if (token === '[' || token === '![') {
      const image = token === '![';
      const label = readBracket(rest, match.index + token.length);
      const target = label && readParen(rest, label.end);
      if (!label || !target) {
        literal();
        continue;
      }
      const url = image ? safeImageSrc(target.inner) : safeHref(target.inner);
      if (!url) {
        out.push(...texte(before), ...parseInline(label.inner));
      } else if (image) {
        out.push(...texte(before), { type: 'image', src: url, alt: label.inner });
      } else {
        out.push(...texte(before), {
          type: 'lien',
          href: url,
          externe: isExternal(url),
          children: parseInline(label.inner),
        });
      }
      rest = rest.slice(target.end);
      continue;
    }

    const close = after.indexOf(token);
    if (close === -1) {
      literal();
      continue;
    }
    out.push(...texte(before), {
      type: token === '**' ? 'fort' : 'accent',
      children: parseInline(after.slice(0, close)),
    });
    rest = after.slice(close + token.length);
  }

  out.push(...texte(rest));
  return out;
}

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;
const NUMBER = /^\d{1,9}[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const RULE = /^(-{3,}|\*{3,}|_{3,})$/;
const FENCE = /^```/;

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (FENCE.test(line)) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE.test(lines[i] ?? '')) {
        body.push(lines[i] ?? '');
        i += 1;
      }
      i += 1; // la clôture, ou la fin du texte si elle manque
      blocks.push({ type: 'code', value: body.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const niveau = ((heading[1]?.length ?? 1) + 1) as 2 | 3 | 4;
      blocks.push({ type: 'titre', niveau, children: parseInline(heading[2] ?? '') });
      i += 1;
      continue;
    }

    if (RULE.test(line.trim())) {
      blocks.push({ type: 'filet' });
      i += 1;
      continue;
    }

    const quote = QUOTE.exec(line);
    if (quote) {
      const body: string[] = [quote[1] ?? ''];
      i += 1;
      for (let next = QUOTE.exec(lines[i] ?? ''); next; next = QUOTE.exec(lines[i] ?? '')) {
        body.push(next[1] ?? '');
        i += 1;
      }
      blocks.push({ type: 'citation', children: parseInline(body.join(' ').trim()) });
      continue;
    }

    const ordonnee = NUMBER.test(line);
    if (ordonnee || BULLET.test(line)) {
      const pattern = ordonnee ? NUMBER : BULLET;
      const items: Inline[][] = [];
      for (let item = pattern.exec(lines[i] ?? ''); item; item = pattern.exec(lines[i] ?? '')) {
        items.push(parseInline(item[1] ?? ''));
        i += 1;
      }
      blocks.push({ type: 'liste', ordonnee, items });
      continue;
    }

    const body: string[] = [];
    while (i < lines.length) {
      const current = lines[i] ?? '';
      const starts =
        !current.trim() ||
        FENCE.test(current) ||
        HEADING.test(current) ||
        QUOTE.test(current) ||
        BULLET.test(current) ||
        NUMBER.test(current) ||
        RULE.test(current.trim());
      if (starts) break;
      body.push(current.trim());
      i += 1;
    }
    blocks.push({ type: 'paragraphe', children: parseInline(body.join(' ')) });
  }

  return blocks;
}
