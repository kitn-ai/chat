import { render } from 'solid-js/web';
import ThemeStudio from './ThemeStudio';
import './styles.css';

// The app chrome is dark by default (it matches the builder that iframes it);
// ?theme=light opts into the light palette (styles.css keys off data-theme).
if (new URLSearchParams(window.location.search).get('theme') === 'light') {
  document.documentElement.dataset.theme = 'light';
}

render(() => <ThemeStudio />, document.getElementById('root')!);
