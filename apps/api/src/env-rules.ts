// Les règles de production communes à tous les projets : ce qu'une configuration de
// développement accepte, mais qui ne doit jamais partir en production. Chaque projet les applique
// dans `make env-check` et, s'il a un serveur, à son démarrage en production.

/** Les fournisseurs de développement : rien ne part vraiment (e-mails, paiements, fichiers). */
export const DEV_PROVIDERS: readonly string[] = ['console', 'simule', 'memoire'];
export const MIN_SECRET_LENGTH = 32;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);
const PLACEHOLDER_DOMAINS = new Set(['exemple.fr', 'exemple.com', 'example.com', 'example.org']);

export function isLocalHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname) || hostname.endsWith('.localhost');
}

/** Le domaine d'une adresse e-mail, même écrite « Nom <adresse> ». */
export function emailDomain(value: string): string {
  return (/@([^>\s]+)>?\s*$/.exec(value.trim())?.[1] ?? '').toLowerCase();
}

export interface RulesOptions {
  /** Essai local de l'image de production : les adresses http://localhost sont tolérées. */
  localTrial?: boolean;
}

type Value = string | number | boolean | readonly string[] | undefined | null;

function isEmpty(value: Value): boolean {
  if (Array.isArray(value)) return value.length === 0;
  return value === undefined || value === null || String(value).trim() === '';
}

/** Les problèmes s'accumulent : on les rend tous d'un coup, en français, une ligne chacun. */
export class ProductionRules {
  readonly problems: string[] = [];

  constructor(private readonly options: RulesOptions = {}) {}

  /** Une condition, et le message si elle n'est pas remplie. */
  expect(ok: boolean, message: string): this {
    if (!ok) this.problems.push(message);
    return this;
  }

  /** Des problèmes déjà formulés (ceux d'un module qui a ses propres règles). */
  add(...problems: string[]): this {
    this.problems.push(...problems);
    return this;
  }

  required(name: string, value: Value): this {
    return this.expect(!isEmpty(value), `${name} : obligatoire en production`);
  }

  /** Un secret : présent, et assez long pour ne pas se deviner. */
  secret(name: string, value: string | undefined): this {
    if (isEmpty(value)) return this.required(name, value);
    return this.expect(
      (value ?? '').length >= MIN_SECRET_LENGTH,
      `${name} : au moins ${MIN_SECRET_LENGTH} caractères aléatoires (openssl rand -base64 32)`,
    );
  }

  /** Une adresse vue de l'extérieur : en https, et pas la machine locale. */
  publicUrl(name: string, value: string | undefined): this {
    if (isEmpty(value)) return this.required(name, value);
    // Une origine joker (« * », « https://*.domaine.fr ») ouvrirait l'API à d'autres sites.
    if (value?.includes('*'))
      return this.expect(false, `${name} : adresse explicite attendue, pas de joker (${value})`);
    let url: URL;
    try {
      url = new URL(value ?? '');
    } catch {
      return this.expect(false, `${name} : adresse invalide (${value})`);
    }
    const local = isLocalHost(url.hostname);
    if (local && this.options.localTrial) return this;
    this.expect(url.protocol === 'https:', `${name} : adresse en https attendue (${value})`);
    return this.expect(
      !local,
      `${name} : adresse locale (${url.host}), pas celle de la production`,
    );
  }

  publicUrls(name: string, values: readonly string[]): this {
    if (values.length === 0) return this.required(name, values);
    for (const value of values) this.publicUrl(name, value);
    return this;
  }

  /** Les règles des clés d'un fournisseur : sans objet avec celui de développement. */
  forRealProvider(value: string | undefined, rules: (r: this) => void): this {
    if (!DEV_PROVIDERS.includes(value ?? '')) rules(this);
    return this;
  }

  /**
   * Un fournisseur réel : console, simule et memoire ne servent qu'en développement. L'essai local
   * de l'image (LOCAL_TRIAL) les accepte : il démarre sans les comptes du client.
   */
  realProvider(name: string, value: string | undefined): this {
    if (this.options.localTrial && DEV_PROVIDERS.includes(value ?? '')) return this;
    return this.expect(
      !DEV_PROVIDERS.includes(value ?? ''),
      `${name}=${value} : fournisseur de développement, à remplacer en production`,
    );
  }

  /** Une adresse e-mail du domaine du client, pas celle des exemples. */
  clientEmail(name: string, value: string | undefined): this {
    if (isEmpty(value)) return this.required(name, value);
    const domain = emailDomain(value ?? '');
    if (this.options.localTrial && PLACEHOLDER_DOMAINS.has(domain)) return this;
    return this.expect(
      domain !== '' && !PLACEHOLDER_DOMAINS.has(domain) && !isLocalHost(domain),
      `${name} : adresse d'un domaine du client attendue (${value})`,
    );
  }

  /** Une vérification qui lève une erreur (celle d'un module, par exemple) : son message est gardé. */
  attempt(check: () => unknown): this {
    try {
      check();
    } catch (error) {
      this.problems.push(error instanceof Error ? error.message : String(error));
    }
    return this;
  }
}
