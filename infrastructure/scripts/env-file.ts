export type EnvValues = Record<string, string>;

const ENTRY = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;
const SECRET = /^\{\{secret:(\d+)\}\}$/;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const UNBIASED = 248;

function unquote(raw: string): string {
  const value = raw.trim();
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
    return value.slice(1, -1);
  }
  return value.replace(/\s+#.*$/, '');
}

export function parseEnvText(text: string): EnvValues {
  const values: EnvValues = {};
  for (const line of text.split('\n')) {
    const match = ENTRY.exec(line);
    if (match?.[1]) values[match[1]] = unquote(match[2] ?? '');
  }
  return values;
}

export function randomSecret(length: number): string {
  let out = '';
  while (out.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < UNBIASED && out.length < length) out += ALPHABET[byte % ALPHABET.length];
    }
  }
  return out;
}

export function resolveDevValue(value: string): string {
  const secret = SECRET.exec(value);
  return secret ? randomSecret(Number(secret[1])) : value;
}

const HEADER = `# Développement local, généré par \`make env\` à partir de .env.example. Jamais versionné.
# Les secrets sont tirés au hasard pour cette machine. Avant un déploiement : make env-check.
`;

function withDevValue(line: string, devValues: EnvValues): string {
  const key = ENTRY.exec(line)?.[1];
  const value = key === undefined ? undefined : devValues[key];
  return key === undefined || value === undefined ? line : `${key}=${resolveDevValue(value)}`;
}

export function devEnvText(example: string, devValues: EnvValues): string {
  return (
    HEADER +
    example
      .split('\n')
      .map((line) => withDevValue(line, devValues))
      .join('\n')
  );
}

export function missingEntries(current: string, example: string, devValues: EnvValues): string[] {
  const present = parseEnvText(current);
  return example
    .split('\n')
    .filter((line) => {
      const key = ENTRY.exec(line)?.[1];
      return key !== undefined && !(key in present);
    })
    .map((line) => withDevValue(line, devValues));
}
