import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '@documental/ui/polices.css';
import '@documental/ui/jetons.css';
import '@documental/ui/base.css';
import { applyAppearance } from './ui/AppearanceSwitch';

const root = document.getElementById('root');
if (!root) throw new Error('Élément #root introuvable');
applyAppearance();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
