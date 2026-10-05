/** Le premier compte admin, avec la connexion par mot de passe + double authentification. */
export function FirstAdmin() {
  return (
    <>
      <p>
        Créer le premier compte admin (avec PostgreSQL en développement, arrêtez d’abord l’API : la
        base locale n’accepte qu’un processus) :
      </p>
      <pre>bun run admin:creer vous@exemple.fr</pre>
      <p>
        Le lien pour choisir le mot de passe s’affiche dans ce terminal. Le panel admin demande
        ensuite la double authentification, à activer depuis « Mon compte ».
      </p>
    </>
  );
}
