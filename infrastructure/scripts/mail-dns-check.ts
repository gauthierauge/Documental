import { Resolver } from 'node:dns/promises';
import { readFileSync } from 'node:fs';
import { parseEnvText } from './env-file';

export type Provider = 'brevo' | 'resend';
export type FindingStatus = 'ok' | 'manque' | 'a-verifier';

export interface Finding {
  label: string;
  host: string;
  status: FindingStatus;
  detail: string;
}

export interface DnsReader {
  txt(name: string): Promise<string[]>;
  mx(name: string): Promise<string[]>;
  cname(name: string): Promise<string[]>;
}

export function senderDomain(from: string): string | null {
  const address = /<([^>]+)>/.exec(from)?.[1] ?? from;
  const domain = address.trim().split('@')[1]?.toLowerCase();
  return domain && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) ? domain : null;
}

const found = (
  label: string,
  host: string,
  ok: boolean,
  missing: string,
  detail = '',
): Finding => ({
  label,
  host,
  status: ok ? 'ok' : 'manque',
  detail: ok ? detail : missing,
});

async function dmarc(domain: string, dns: DnsReader, provider: Provider): Promise<Finding[]> {
  const host = `_dmarc.${domain}`;
  const record = (await dns.txt(host)).find((v) => v.startsWith('v=DMARC1'));
  const findings = [
    found('DMARC', host, Boolean(record), 'aucun TXT commençant par v=DMARC1', record),
  ];
  if (provider === 'brevo' && record) {
    const rua = 'rua=mailto:rua@dmarc.brevo.com';
    findings.push(
      found('DMARC : rapports Brevo', host, record.includes(rua), `il manque ${rua}`, rua),
    );
  }
  return findings;
}

async function dkimHosts(domain: string, dns: DnsReader, hosts: string[]): Promise<Finding[]> {
  if (hosts.length === 0) {
    return [
      {
        label: 'DKIM',
        host: '(noms donnés par Brevo)',
        status: 'a-verifier',
        detail:
          'noms propres au compte : relancer avec DKIM=<nom1>,<nom2> tels que Brevo les affiche',
      },
    ];
  }
  return Promise.all(
    hosts.map(async (name) => {
      const host = name.endsWith(domain) ? name : `${name}.${domain}`;
      const values = [...(await dns.cname(host)), ...(await dns.txt(host))];
      return found('DKIM', host, values.length > 0, 'ni CNAME ni TXT publié', values[0]);
    }),
  );
}

export async function checkMailDns(
  provider: Provider,
  domain: string,
  dns: DnsReader,
  dkim: string[] = [],
): Promise<Finding[]> {
  if (provider === 'resend') {
    const key = `resend._domainkey.${domain}`;
    const send = `send.${domain}`;
    const dkimRecord = (await dns.txt(key)).find((v) => v.includes('p='));
    const spf = (await dns.txt(send)).find((v) => v.startsWith('v=spf1'));
    const mx = await dns.mx(send);
    return [
      found('DKIM', key, Boolean(dkimRecord), 'aucun TXT avec une clé publique (p=…)'),
      found('SPF', send, Boolean(spf), 'aucun TXT commençant par v=spf1', spf),
      found('MX de retour', send, mx.length > 0, 'aucun MX', mx[0]),
      ...(await dmarc(domain, dns, provider)),
    ];
  }
  const root = await dns.txt(domain);
  return [
    {
      label: 'Code Brevo',
      host: domain,
      status: 'a-verifier',
      detail: `${root.length} TXT publié${root.length > 1 ? 's' : ''} à la racine : comparer avec le code affiché par Brevo`,
    },
    ...(await dkimHosts(domain, dns, dkim)),
    ...(await dmarc(domain, dns, provider)),
  ];
}

const ICON: Record<FindingStatus, string> = { ok: '✓', manque: '✗', 'a-verifier': '?' };

export function report(findings: Finding[]): string {
  return findings
    .map(
      (f) => `${ICON[f.status]} ${f.label.padEnd(24)} ${f.host}${f.detail ? `  ${f.detail}` : ''}`,
    )
    .join('\n');
}

const absent = (error: unknown) =>
  ['ENOTFOUND', 'ENODATA'].includes((error as { code?: string }).code ?? '');

export function systemDns(resolver = new Resolver()): DnsReader {
  const read = async <T>(query: () => Promise<T[]>): Promise<T[]> => {
    try {
      return await query();
    } catch (error) {
      if (absent(error)) return [];
      throw error;
    }
  };
  return {
    txt: async (name) =>
      (await read(() => resolver.resolveTxt(name))).map((chunks) => chunks.join('')),
    mx: async (name) => (await read(() => resolver.resolveMx(name))).map((mx) => mx.exchange),
    cname: (name) => read(() => resolver.resolveCname(name)),
  };
}

async function main(args: string[]): Promise<number> {
  const file = args.find((a) => !a.startsWith('--')) ?? '.env';
  const dkim = args.find((a) => a.startsWith('--dkim='))?.slice('--dkim='.length) ?? '';
  const env = parseEnvText(readFileSync(file, 'utf8'));
  const provider = env.MAIL_PROVIDER;
  const domain = senderDomain(env.MAIL_FROM ?? '');
  if (provider !== 'brevo' && provider !== 'resend') {
    console.error(
      `${file} : MAIL_PROVIDER=${provider ?? ''} ; le contrôle vaut pour brevo ou resend.`,
    );
    return 2;
  }
  if (!domain) {
    console.error(`${file} : MAIL_FROM n'a pas d'adresse avec un domaine.`);
    return 2;
  }
  const findings = await checkMailDns(
    provider,
    domain,
    systemDns(),
    dkim.split(',').filter(Boolean),
  );
  console.info(`Domaine d'envoi ${domain}, ${provider} :\n${report(findings)}`);
  return findings.some((f) => f.status === 'manque') ? 1 : 0;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
