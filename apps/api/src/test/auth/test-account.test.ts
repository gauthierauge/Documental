import { post } from '@/test/support/auth-helpers';
import { testApp } from '@/test/support/helpers';
import { eq } from 'drizzle-orm';
import { ensureTestAccount, TEST_ACCOUNT_ROLE } from '@/auth/test-account';
import * as schema from '@/db/schema';

const FIRST = 'une phrase factice assez longue';
const SECOND = 'une autre phrase factice, plus longue';

describe('Compte d’essai', () => {
  it('crée un compte lecteur qui se connecte avec son mot de passe', async () => {
    const t = await testApp();
    const email = 'compte-essai@exemple.fr';
    await ensureTestAccount(t.deps.db, email, FIRST);
    const [user] = await t.deps.db.select().from(schema.user).where(eq(schema.user.email, email));
    expect(user?.role).toBe(TEST_ACCOUNT_ROLE);
    expect((await post(t, '/sign-in/email', { email, password: FIRST })).status).toBe(200);
  });

  it('relancé, remet le mot de passe sans créer de doublon', async () => {
    const t = await testApp();
    const email = 'compte-essai-relance@exemple.fr';
    const id = await ensureTestAccount(t.deps.db, email, FIRST);
    expect(await ensureTestAccount(t.deps.db, email, SECOND)).toBe(id);
    const accounts = await t.deps.db
      .select()
      .from(schema.account)
      .where(eq(schema.account.userId, id));
    expect(accounts).toHaveLength(1);
    expect((await post(t, '/sign-in/email', { email, password: FIRST })).status).toBe(401);
    expect((await post(t, '/sign-in/email', { email, password: SECOND })).status).toBe(200);
  });
});
