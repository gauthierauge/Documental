import { checkMailDns, type DnsReader, report, senderDomain } from '@/scripts/mail-dns-check';

/** Un DNS en mémoire : rien ne sort de la machine pendant les tests. */
function dns(
  records: Partial<Record<'txt' | 'mx' | 'cname', Record<string, string[]>>>,
): DnsReader {
  const read = (kind: 'txt' | 'mx' | 'cname') => async (name: string) =>
    records[kind]?.[name] ?? [];
  return { txt: read('txt'), mx: read('mx'), cname: read('cname') };
}

const statuses = (findings: { label: string; status: string }[]) =>
  findings.map((f) => `${f.label} ${f.status}`);

describe('domaine d’envoi', () => {
  it('lit le domaine de MAIL_FROM, avec ou sans nom affiché', () => {
    expect(senderDomain('Atelier <bonjour@Atelier.test>')).toBe('atelier.test');
    expect(senderDomain('bonjour@envoi.atelier.test')).toBe('envoi.atelier.test');
    expect(senderDomain('Ne pas répondre')).toBeNull();
    expect(senderDomain('bonjour@localhost')).toBeNull();
  });
});

describe('enregistrements demandés par Resend', () => {
  it('tout est publié : DKIM, SPF et MX sur send, DMARC', async () => {
    const findings = await checkMailDns(
      'resend',
      'atelier.test',
      dns({
        txt: {
          'resend._domainkey.atelier.test': ['p=CLEPUBLIQUEFACTICE'],
          'send.atelier.test': ['v=spf1 include:fournisseur.test ~all'],
          '_dmarc.atelier.test': ['v=DMARC1; p=none;'],
        },
        mx: { 'send.atelier.test': ['retour.fournisseur.test'] },
      }),
    );
    expect(statuses(findings)).toEqual(['DKIM ok', 'SPF ok', 'MX de retour ok', 'DMARC ok']);
  });

  it('dit ce qui manque', async () => {
    const findings = await checkMailDns('resend', 'atelier.test', dns({}));
    expect(statuses(findings)).toEqual([
      'DKIM manque',
      'SPF manque',
      'MX de retour manque',
      'DMARC manque',
    ]);
    expect(report(findings)).toContain('✗ SPF');
  });
});

describe('enregistrements demandés par Brevo', () => {
  it('DMARC avec l’adresse de rapports de Brevo ; DKIM vérifié sur les noms donnés', async () => {
    const records = dns({
      txt: {
        'atelier.test': ['code-factice'],
        '_dmarc.atelier.test': ['v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com'],
      },
      cname: { 'cle1._domainkey.atelier.test': ['cle1.fournisseur.test'] },
    });
    const findings = await checkMailDns('brevo', 'atelier.test', records, [
      'cle1._domainkey',
      'cle2._domainkey',
    ]);
    expect(statuses(findings)).toEqual([
      'Code Brevo a-verifier',
      'DKIM ok',
      'DKIM manque',
      'DMARC ok',
      'DMARC : rapports Brevo ok',
    ]);
  });

  it('sans les noms DKIM du compte, ne devine rien : à vérifier', async () => {
    const findings = await checkMailDns(
      'brevo',
      'atelier.test',
      dns({ txt: { '_dmarc.atelier.test': ['v=DMARC1; p=none'] } }),
    );
    expect(statuses(findings)).toEqual([
      'Code Brevo a-verifier',
      'DKIM a-verifier',
      'DMARC ok',
      'DMARC : rapports Brevo manque',
    ]);
  });
});
