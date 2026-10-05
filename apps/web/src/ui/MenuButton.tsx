import type { Menu } from './useMenu';
import './menu.css';

/** Le bouton du menu sur téléphone : son état est lu par les lecteurs d'écran (aria-expanded). */
export function MenuButton({ menu, controls }: { menu: Menu; controls: string }) {
  return (
    <button
      ref={menu.button}
      type="button"
      className="ui-menu-bouton"
      aria-expanded={menu.open}
      aria-controls={controls}
      onClick={menu.toggle}
    >
      <span className="ui-menu-icone" aria-hidden="true" />
      Menu
    </button>
  );
}
