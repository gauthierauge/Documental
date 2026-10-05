// Règles de mot de passe, d'après le NIST SP 800-63B : une longueur minimale, une longueur
// maximale large (les phrases de passe sont bienvenues), aucune règle de composition imposée
// (majuscule, chiffre, symbole…), et le refus des mots de passe que tout le monde essaie.
// Partagé : l'API l'applique à chaque définition de mot de passe, l'écran l'affiche avant l'envoi.
// La vérification dans les fuites connues (Have I Been Pwned) est une option de l'API : PASSWORD_HIBP.

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

const LEET: Record<string, string> = {
  '@': 'a',
  '4': 'a',
  '3': 'e',
  '0': 'o',
  '1': 'i',
  '!': 'i',
  $: 's',
  '5': 's',
  '7': 't',
};

/** Le cœur d'un mot de passe : sans accents, sans ce qui l'entoure, chiffres « l33t » remis en lettres. */
function skeleton(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^[^a-z@$]+|[^a-z]+$/g, '')
    .replace(/[@4310!$57]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z]/g, '');
}

/** Mots de passe courants qu'aucune autre règle n'attrape (suites de clavier entrelacées). */
const COMMON = new Set([
  '1q2w3e4r5t6y',
  '1q2w3e4r5t6y7u',
  'q1w2e3r4t5y6',
  '1a2z3e4r5t6y',
  'a1z2e3r4t5y6',
  '1qaz2wsx3edc',
  '1qaz2wsx3edc4rfv',
  'zaq12wsxcde3',
  'zaq1zaq1zaq1',
  '1qazxsw23edc',
  'qazwsxedcrfv',
  'qazwsxedcrfvtgb',
  'aqwzsxedcrfv',
  'a1b2c3d4e5f6',
  '1a2b3c4d5e6f',
  'qwertyuiopasdfgh',
  'azertyuiopqsdfgh',
  'asdfghjklzxcvbnm',
  'qsdfghjklmwxcvbn',
  'iloveyouiloveyou',
  'trustno1trustno1',
  'abc123abc123',
  'abcd1234abcd1234',
  'pass1234pass1234',
  'aaaaaa111111',
  'aaaaaa123456',
  'qqqqqq111111',
  '123456qwerty',
  '123456azerty',
  '123456abcdef',
]);

/**
 * Mots que l'on retrouve au cœur des mots de passe devinés en premier, une fois retirés les
 * chiffres et symboles ajoutés autour (« Motdepasse2026! », « P@ssw0rd1234 »). Le nom de
 * l'application en fait partie : c'est le premier mot qu'un attaquant essaie.
 */
const BASE_WORDS = new Set(
  [
    'documental',
    'password',
    'passwort',
    'motdepasse',
    'motdepass',
    'mdp',
    'azerty',
    'azertyuiop',
    'qwerty',
    'qwertyuiop',
    'qwertz',
    'admin',
    'administrateur',
    'administrator',
    'root',
    'user',
    'utilisateur',
    'login',
    'connexion',
    'secret',
    'changeme',
    'welcome',
    'bienvenue',
    'bonjour',
    'salut',
    'coucou',
    'hello',
    'soleil',
    'jetaime',
    'iloveyou',
    'amour',
    'doudou',
    'loulou',
    'chouchou',
    'chocolat',
    'liberte',
    'freedom',
    'whatever',
    'letmein',
    'trustno',
    'sunshine',
    'princess',
    'princesse',
    'dragon',
    'monkey',
    'master',
    'shadow',
    'superman',
    'batman',
    'starwars',
    'pokemon',
    'football',
    'baseball',
    'marseille',
    'paris',
    'france',
    'test',
    'abc',
    'abcd',
    'abcdef',
    'toto',
  ].map(skeleton),
);

/** Suites de touches ou de caractères : un mot de passe qui en est un morceau est trivial. */
const SEQUENCES = [
  '01234567890123456789012345678901234567890',
  'abcdefghijklmnopqrstuvwxyz',
  'azertyuiopqsdfghjklmwxcvbn',
  'qwertyuiopasdfghjklzxcvbnm',
  'qwertzuiopasdfghjklyxcvbnm',
].flatMap((s) => [s, [...s].reverse().join('')]);

function isTrivial(lower: string): boolean {
  // Un motif répété : « aaaaaaaaaaaa », « azerazerazer », « 123123123123 ».
  if (/^(.+?)\1+$/su.test(lower)) return true;
  return SEQUENCES.some((s) => s.includes(lower));
}

/** null si le mot de passe convient, sinon la raison, à afficher telle quelle. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Au moins ${PASSWORD_MIN} caractères.`;
  if (password.length > PASSWORD_MAX) return `Au plus ${PASSWORD_MAX} caractères.`;
  const lower = password.toLowerCase();
  const core = skeleton(password);
  if (COMMON.has(lower) || isTrivial(lower) || BASE_WORDS.has(core)) {
    return 'Ce mot de passe fait partie des premiers essayés : choisissez-en un autre, par exemple une phrase de quelques mots.';
  }
  return null;
}
