import { Page } from '@/ui/Page';

// L'accueil en production. En développement, la page « Démarrage » s'affiche à sa place.
// À personnaliser : c'est la première page que voient les visiteurs.

export function Home() {
  return <Page title={'Documental'} lede="Bienvenue."></Page>;
}
