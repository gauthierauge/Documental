import {
  auditVerdict,
  parseAuditOutput,
  splitExceptions,
  withoutExceptions,
} from '@/scripts/audit';

// La forme de `bun audit --json` : un tableau d'avis par paquet.
const REPORT = {
  'node-forge': [
    {
      url: 'https://github.com/advisories/GHSA-86w9-cpqp-85rv',
      severity: 'high',
      title: 'Vérification de signature',
    },
  ],
  uuid: [
    {
      url: 'https://github.com/advisories/GHSA-w5hq-g745-h8pq',
      severity: 'moderate',
      title: 'Contrôle de taille',
    },
  ],
};

const EXCEPTION = {
  id: 'GHSA-86w9-cpqp-85rv',
  paquet: 'node-forge',
  raison: "Outil de développement seulement, absent de l'app livrée.",
  revoirLe: '2027-01-01',
};

describe('make audit', () => {
  test('une vulnérabilité haute fait échouer, avec le paquet nommé', () => {
    const { code, lines } = auditVerdict(REPORT, [], '2026-10-02');
    expect(code).toBe(1);
    expect(lines).toContain('1 haute : node-forge');
    expect(lines).toContain('1 modérée : uuid');
  });

  test('une exception écrite et pas échue couvre son avis ; le modéré reste signalé', () => {
    const { code, lines } = auditVerdict(REPORT, [EXCEPTION], '2026-10-02');
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('exception écrite dans kit.json : node-forge');
    expect(lines).toContain('1 modérée : uuid');
  });

  test('une exception échue ne compte plus et le dit', () => {
    const { code, lines } = auditVerdict(REPORT, [EXCEPTION], '2027-01-02');
    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('exception échue le 2027-01-01, à revoir : node-forge');
  });

  test('une exception mal formée est ignorée (raison trop courte, id inconnu)', () => {
    const { active } = splitExceptions(
      [{ ...EXCEPTION, raison: 'non' }, { ...EXCEPTION, id: 'CVE-2026-0001' }, 'texte'],
      '2026-10-02',
    );
    expect(active).toEqual([]);
  });

  test("seul l'avis visé est retiré, par son identifiant", () => {
    expect(Object.keys(withoutExceptions(REPORT, [EXCEPTION]))).toEqual(['uuid']);
  });

  test('aucune vulnérabilité : vert', () => {
    expect(auditVerdict({}, [], '2026-10-02')).toEqual({
      code: 0,
      lines: ['✓ Audit des dépendances : aucune vulnérabilité connue'],
    });
  });

  test('la sortie JSON se lit même précédée de texte ; sans JSON, rien', () => {
    expect(parseAuditOutput('bun audit v1.4.2\n{"a":[]}')).toEqual({ a: [] });
    expect(parseAuditOutput('error: hors ligne')).toBeNull();
  });
});
