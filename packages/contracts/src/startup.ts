// Ce que l'API dit de chaque élément installé, pour la page « Démarrage » (développement
// seulement). Chaque module ajoute sa ligne à la création du projet : rien pour un module absent.

export interface StartupState {
  environnement: string;
  emails: 'console' | 'brevo' | 'resend';
}
