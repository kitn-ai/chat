/**
 * Spec -> one self-contained HTML document. No external requests, no build
 * step: everything the page needs (styles, a little script) is inline, because
 * the preview iframe is sandboxed with the kit's default
 * `allow-scripts allow-forms` and gets the document as a data: URL.
 */
import type { PageSpec } from './page-spec.js';

const FONTS: Record<PageSpec['font'], string> = {
  sans: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`,
  serif: `ui-serif, Georgia, Cambria, "Times New Roman", serif`,
  mono: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`,
};

/** Escape anything that came from the user's prompt before it reaches markup. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** #rrggbb -> {r,g,b}; used for the tinted washes so one accent drives it all. */
function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function mix(hex: string, withWhite: number): string {
  const [r, g, b] = rgb(hex);
  const f = (c: number) => Math.round(c + (255 - c) * withWhite);
  return `#${[f(r), f(g), f(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function section(on: boolean, html: string): string {
  return on ? html : '';
}

export function renderPage(spec: PageSpec, version: number): string {
  const dark = spec.scheme === 'dark';
  const bg = dark ? '#0d1117' : '#ffffff';
  const surface = dark ? '#161b22' : mix(spec.accent, 0.94);
  const text = dark ? '#e6edf3' : '#111827';
  const muted = dark ? '#9aa4b2' : '#5b6472';
  const border = dark ? '#232a33' : '#e6e8ec';
  const headerBg = spec.headerDark ? '#0b0e14' : dark ? '#0d1117' : '#ffffff';
  const headerText = spec.headerDark || dark ? '#f5f7fa' : '#111827';
  const headerBorder = spec.headerDark ? '#1d222b' : border;
  const heroPad = spec.heroSize === 'large' ? '9rem 0 7rem' : '5rem 0 4rem';
  const nav = ['Home', 'About', spec.sections.pricing ? 'Pricing' : null, spec.sections.faq ? 'FAQ' : null, 'Contact']
    .filter(Boolean)
    .map((label) => `<a href="#${String(label).toLowerCase()}">${esc(String(label))}</a>`)
    .join('\n          ');

  return `<!doctype html>
<html lang="en" data-version="${version}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(spec.brand)} — ${esc(spec.tagline)}</title>
<style>
  :root {
    --accent: ${spec.accent};
    --accent-soft: ${mix(spec.accent, dark ? 0.1 : 0.88)};
    --bg: ${bg};
    --surface: ${surface};
    --text: ${text};
    --muted: ${muted};
    --border: ${border};
    --radius: ${spec.radius}px;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: ${FONTS[spec.font]};
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { width: min(1080px, calc(100% - 2.5rem)); margin-inline: auto; }
  header {
    position: sticky; top: 0; z-index: 10;
    background: ${headerBg};
    color: ${headerText};
    border-bottom: 1px solid ${headerBorder};
  }
  header .wrap { display: flex; align-items: center; justify-content: space-between; gap: 1rem; height: 64px; }
  .brand { display: flex; align-items: center; gap: .6rem; font-weight: 700; letter-spacing: -0.01em; font-size: 1.05rem; }
  .dot { width: 22px; height: 22px; border-radius: 999px; background: var(--accent); display: inline-block; }
  nav { display: flex; gap: 1.4rem; font-size: .92rem; }
  nav a { color: inherit; text-decoration: none; opacity: .78; }
  nav a:hover { opacity: 1; }
  .btn {
    display: inline-block; border: 0; cursor: pointer; font: inherit; font-weight: 600;
    padding: .68rem 1.15rem; border-radius: var(--radius);
    background: var(--accent); color: #fff; text-decoration: none;
  }
  .btn.ghost { background: transparent; color: inherit; border: 1px solid currentColor; opacity: .85; }
  #menu { display: none; background: none; border: 0; color: inherit; font-size: 1.3rem; cursor: pointer; }
  .hero { padding: ${heroPad}; background: linear-gradient(180deg, var(--accent-soft), var(--bg) 78%); }
  .hero h1 {
    margin: 0 0 1rem; letter-spacing: -0.03em; line-height: 1.08;
    font-size: clamp(2.2rem, ${spec.heroSize === 'large' ? '6vw' : '5vw'}, ${spec.heroSize === 'large' ? '4.4rem' : '3.4rem'});
    max-width: 16ch;
  }
  .hero p { margin: 0 0 1.8rem; font-size: 1.12rem; color: var(--muted); max-width: 56ch; }
  .eyebrow {
    display: inline-block; margin-bottom: 1rem; padding: .25rem .7rem; border-radius: 999px;
    background: var(--accent); color: #fff; font-size: .74rem; letter-spacing: .09em; text-transform: uppercase; font-weight: 700;
  }
  .actions { display: flex; gap: .75rem; flex-wrap: wrap; }
  section { padding: 4rem 0; }
  h2 { font-size: clamp(1.5rem, 3vw, 2rem); letter-spacing: -0.02em; margin: 0 0 .5rem; }
  .lede { color: var(--muted); margin: 0 0 2.2rem; max-width: 58ch; }
  .grid { display: grid; gap: 1.1rem; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.4rem; }
  .card h3 { margin: .6rem 0 .35rem; font-size: 1.05rem; }
  .card p { margin: 0; color: var(--muted); font-size: .95rem; }
  .ico { font-size: 1.6rem; line-height: 1; }
  .price { display: flex; align-items: baseline; gap: .35rem; margin: .4rem 0 1rem; }
  .price b { font-size: 2rem; letter-spacing: -0.02em; }
  .price span { color: var(--muted); font-size: .9rem; }
  .card ul { margin: 0 0 1.2rem; padding-left: 1.1rem; color: var(--muted); font-size: .93rem; }
  .card.featured { border-color: var(--accent); box-shadow: 0 12px 30px -18px var(--accent); }
  blockquote { margin: 0; font-size: 1rem; }
  blockquote footer { margin-top: .8rem; color: var(--muted); font-size: .87rem; }
  details { border-bottom: 1px solid var(--border); padding: 1rem 0; }
  details summary { cursor: pointer; font-weight: 600; }
  details p { color: var(--muted); margin: .6rem 0 0; }
  form { display: grid; gap: .8rem; max-width: 460px; }
  input, textarea {
    font: inherit; padding: .7rem .85rem; border-radius: var(--radius);
    border: 1px solid var(--border); background: var(--bg); color: var(--text);
  }
  .shots { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
  .shot { aspect-ratio: 4 / 3; border-radius: var(--radius); border: 1px solid var(--border);
          background: linear-gradient(140deg, var(--accent-soft), var(--surface)); display: grid; place-items: center; color: var(--muted); font-size: .85rem; }
  .cta-band { background: var(--accent); color: #fff; border-radius: var(--radius); padding: 2.6rem; text-align: center; }
  .cta-band h2 { margin-bottom: .4rem; }
  .cta-band p { opacity: .9; margin: 0 0 1.4rem; }
  .cta-band .btn { background: #fff; color: var(--accent); }
  footer.site { border-top: 1px solid var(--border); padding: 2rem 0; color: var(--muted); font-size: .88rem; }
  footer.site .wrap { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  @media (max-width: 720px) {
    nav { display: none; }
    nav.open { display: flex; position: absolute; top: 64px; left: 0; right: 0; flex-direction: column;
               background: ${headerBg}; padding: 1rem 1.25rem; border-bottom: 1px solid ${headerBorder}; }
    #menu { display: block; }
    header .wrap { position: relative; }
    .hero { padding: 3.5rem 0 3rem; }
  }
</style>
</head>
<body>
  <header>
    <div class="wrap">
      <div class="brand"><span class="dot"></span>${esc(spec.brand)}</div>
      <button id="menu" aria-label="Toggle navigation" aria-expanded="false">☰</button>
      <nav id="nav">
          ${nav}
      </nav>
      <a class="btn" href="#contact">${esc(spec.cta)}</a>
    </div>
  </header>

  <div class="hero">
    <div class="wrap">
      <span class="eyebrow">${esc(spec.subject)}</span>
      <h1>${esc(spec.tagline)}</h1>
      <p>${esc(spec.blurb)}</p>
      <div class="actions">
        <a class="btn" href="#contact">${esc(spec.cta)}</a>
        <a class="btn ghost" href="#about">Read more</a>
      </div>
    </div>
  </div>

  <section id="about">
    <div class="wrap">
      <h2>What you get</h2>
      <p class="lede">The three things people ask about first, answered before they have to.</p>
      <div class="grid">
        ${spec.features
          .map(
            (f) => `<article class="card">
          <div class="ico">${esc(f.icon)}</div>
          <h3>${esc(f.title)}</h3>
          <p>${esc(f.body)}</p>
        </article>`,
          )
          .join('\n        ')}
      </div>
    </div>
  </section>
${section(
  spec.sections.gallery,
  `
  <section id="gallery">
    <div class="wrap">
      <h2>Gallery</h2>
      <p class="lede">A look around before you come by.</p>
      <div class="shots">
        ${[1, 2, 3, 4].map((n) => `<div class="shot">Image ${n}</div>`).join('\n        ')}
      </div>
    </div>
  </section>
`,
)}${section(
    spec.sections.pricing,
    `
  <section id="pricing">
    <div class="wrap">
      <h2>Pricing</h2>
      <p class="lede">Three plans, no call required, cancel whenever.</p>
      <div class="grid">
        <article class="card">
          <h3>Starter</h3>
          <div class="price"><b>$0</b><span>/ month</span></div>
          <ul><li>One project</li><li>Community support</li><li>Weekly digest</li></ul>
          <a class="btn ghost" href="#contact">Choose Starter</a>
        </article>
        <article class="card featured">
          <h3>Studio</h3>
          <div class="price"><b>$29</b><span>/ month</span></div>
          <ul><li>Ten projects</li><li>Priority support</li><li>Custom domain</li></ul>
          <a class="btn" href="#contact">Choose Studio</a>
        </article>
        <article class="card">
          <h3>Team</h3>
          <div class="price"><b>$79</b><span>/ month</span></div>
          <ul><li>Unlimited projects</li><li>SSO + audit log</li><li>Shared workspaces</li></ul>
          <a class="btn ghost" href="#contact">Choose Team</a>
        </article>
      </div>
    </div>
  </section>
`,
  )}${section(
    spec.sections.testimonials,
    `
  <section id="testimonials">
    <div class="wrap">
      <h2>What people say</h2>
      <div class="grid">
        <article class="card"><blockquote>“Exactly what we needed, and nothing we didn't.”<footer>— Priya N., operations lead</footer></blockquote></article>
        <article class="card"><blockquote>“We were live the same afternoon we signed up.”<footer>— Marc D., founder</footer></blockquote></article>
        <article class="card"><blockquote>“The only thing my team stopped complaining about.”<footer>— Tess A., engineering manager</footer></blockquote></article>
      </div>
    </div>
  </section>
`,
  )}${section(
    spec.sections.faq,
    `
  <section id="faq">
    <div class="wrap">
      <h2>Questions</h2>
      <details open><summary>How quickly can we start?</summary><p>Same week, usually same day.</p></details>
      <details><summary>Is there a contract?</summary><p>Monthly, cancel any time, no exit fee.</p></details>
      <details><summary>Can we talk to a human?</summary><p>Yes — the form below reaches one.</p></details>
    </div>
  </section>
`,
  )}${section(
    spec.sections.contact,
    `
  <section id="contact-form">
    <div class="wrap">
      <h2>Get in touch</h2>
      <p class="lede">Tell us what you're after and we'll come back within a day.</p>
      <form onsubmit="event.preventDefault(); this.reset(); document.getElementById('sent').hidden = false;">
        <input type="text" name="name" placeholder="Your name" required>
        <input type="email" name="email" placeholder="you@example.com" required>
        <textarea name="message" rows="4" placeholder="What can we help with?"></textarea>
        <button class="btn" type="submit">Send</button>
        <p id="sent" hidden>Thanks — that's on its way.</p>
      </form>
    </div>
  </section>
`,
  )}
  <section id="contact">
    <div class="wrap">
      <div class="cta-band">
        <h2>${esc(spec.cta)}</h2>
        <p>${esc(spec.brand)} — ${esc(spec.tagline)}</p>
        <a class="btn" href="#top">${esc(spec.cta)}</a>
      </div>
    </div>
  </section>

  <footer class="site">
    <div class="wrap">
      <span>© <span id="year"></span> ${esc(spec.brand)}</span>
      <span>Version ${version} · generated locally</span>
    </div>
  </footer>

<script>
  document.getElementById('year').textContent = new Date().getFullYear();
  var menu = document.getElementById('menu');
  var nav = document.getElementById('nav');
  menu.addEventListener('click', function () {
    var open = nav.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(open));
  });
</script>
</body>
</html>
`;
}
