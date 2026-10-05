import { emailDomain, ProductionRules } from '@/env-rules';

describe('règles de production', () => {
  test('rend tous les problèmes d’un coup', () => {
    const rules = new ProductionRules()
      .required('STRIPE_PRICES', [])
      .secret('AUTH_SECRET', 'court')
      .publicUrl('APP_URL', 'http://localhost:5173')
      .realProvider('MAIL_PROVIDER', 'console')
      .clientEmail('MAIL_FROM', 'Ne pas répondre <noreply@exemple.fr>');
    expect(rules.problems).toEqual([
      'STRIPE_PRICES : obligatoire en production',
      'AUTH_SECRET : au moins 32 caractères aléatoires (openssl rand -base64 32)',
      'APP_URL : adresse en https attendue (http://localhost:5173)',
      'APP_URL : adresse locale (localhost:5173), pas celle de la production',
      'MAIL_PROVIDER=console : fournisseur de développement, à remplacer en production',
      "MAIL_FROM : adresse d'un domaine du client attendue (Ne pas répondre <noreply@exemple.fr>)",
    ]);
  });

  test('une configuration de production passe', () => {
    const rules = new ProductionRules()
      .required('STRIPE_PRICES', ['price_essai'])
      .secret('AUTH_SECRET', 'z'.repeat(40))
      .publicUrls('ALLOWED_ORIGINS', ['https://app.atelier.test'])
      .realProvider('MAIL_PROVIDER', 'brevo')
      .clientEmail('MAIL_FROM', 'Atelier <bonjour@atelier.test>');
    expect(rules.problems).toEqual([]);
  });

  test('une adresse invalide ou absente est signalée', () => {
    const rules = new ProductionRules().publicUrl('APP_URL', 'pas une adresse').publicUrl('X', '');
    expect(rules.problems).toEqual([
      'APP_URL : adresse invalide (pas une adresse)',
      'X : obligatoire en production',
    ]);
  });

  it('refuse les origines joker', () => {
    const rules = new ProductionRules().publicUrls('ALLOWED_ORIGINS', [
      '*',
      'https://*.atelier.test',
    ]);
    expect(rules.problems).toEqual([
      'ALLOWED_ORIGINS : adresse explicite attendue, pas de joker (*)',
      'ALLOWED_ORIGINS : adresse explicite attendue, pas de joker (https://*.atelier.test)',
    ]);
  });

  test('l’essai local de l’image tolère http://localhost et les fournisseurs de développement', () => {
    const rules = new ProductionRules({ localTrial: true })
      .publicUrl('APP_URL', 'http://localhost:8787')
      .publicUrl('PAYMENT_SUCCESS_URL', 'http://atelier.test/merci')
      .realProvider('FILES_PROVIDER', 'memoire');
    expect(rules.problems).toEqual([
      'PAYMENT_SUCCESS_URL : adresse en https attendue (http://atelier.test/merci)',
    ]);
    expect(new ProductionRules().realProvider('FILES_PROVIDER', 'memoire').problems).toHaveLength(
      1,
    );
  });

  test('les clés d’un fournisseur ne sont exigées que d’un vrai fournisseur', () => {
    const keys = (provider: string) =>
      new ProductionRules({ localTrial: true }).forRealProvider(provider, (r) =>
        r.required('MAIL_API_KEY', ''),
      ).problems;
    expect(keys('console')).toEqual([]);
    expect(keys('brevo')).toEqual(['MAIL_API_KEY : obligatoire en production']);
  });

  test('garde le message d’une vérification qui lève une erreur', () => {
    const rules = new ProductionRules().attempt(() => {
      throw new Error('STATS_SITE est requis');
    });
    expect(rules.problems).toEqual(['STATS_SITE est requis']);
    expect(emailDomain('Atelier <bonjour@Atelier.test>')).toBe('atelier.test');
  });
});
