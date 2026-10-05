import type { AdminConfig } from './admin-types';

// Le panel admin, décrit par des réglages. Ajoute un contenu avec `kit admin ajouter`
// (il crée aussi la table), ou modifie directement les libellés, droits et réglages ici.
export const adminConfig: AdminConfig = {
  entities: [
    {
      key: 'clients',
      label: 'Clients',
      actions: ['lire', 'creer', 'modifier', 'archiver', 'exporter'],
      fields: [
        {
          key: 'nom',
          label: 'Nom',
          type: 'texte',
          required: true,
        },
        {
          key: 'email',
          label: 'E-mail',
          type: 'email',
          required: false,
        },
      ],
    },
  ],
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
