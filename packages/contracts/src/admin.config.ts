import type { AdminConfig } from './admin-types';

export const adminConfig: AdminConfig = {
  entities: [],
  settings: [
    {
      key: 'nom_affiche',
      label: 'Nom affiché',
      type: 'texte',
      public: true,
    },
    {
      key: 'email_contact',
      label: 'E-mail de contact',
      type: 'email',
      public: false,
    },
  ],
  sections: {
    accueil: true,
    comptes: true,
    exports: false,
    journal: true,
  },
};
