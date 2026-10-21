// Páginas legales: idioma como en la app (localStorage liq-lang; si no, el del móvil) y selector ES/CA.
(() => {
  let lang = 'es';
  try { lang = localStorage.getItem('liq-lang') || ((navigator.language || '').toLowerCase().startsWith('ca') ? 'ca' : 'es'); } catch (e) {}
  const apply = (l) => {
    lang = l === 'ca' ? 'ca' : 'es';
    document.documentElement.dataset.lang = lang; document.documentElement.lang = lang;
    for (const b of document.querySelectorAll('[data-set]')) b.setAttribute('aria-pressed', String(b.dataset.set === lang));
  };
  for (const b of document.querySelectorAll('[data-set]')) b.addEventListener('click', () => { apply(b.dataset.set); try { localStorage.setItem('liq-lang', lang); } catch (e) {} });
  apply(lang);
})();
