// Aplica o tema antes da primeira pintura, para não piscar o claro em quem escolheu o escuro.
// Roda bloqueando, no <head>, e por isso é pequeno e não depende de nada. É um arquivo, e não
// um <script> embutido, porque a CSP de produção (`public/_headers`) só aceita script do site.
// Espelha `src/lib/theme.ts`: a chave, os valores e as cores da barra do navegador.
;(function () {
  var preference = 'system'
  try {
    var stored = localStorage.getItem('vekoo.theme')
    if (stored === 'light' || stored === 'dark') preference = stored
  } catch {
    // Janela privada ou armazenamento bloqueado: segue o sistema.
  }
  var dark =
    preference === 'dark' ||
    (preference === 'system' &&
      !!window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
  var root = document.documentElement
  root.classList.toggle('dark', dark)
  root.style.colorScheme = dark ? 'dark' : 'light'
  var meta = document.querySelector('meta[name="theme-color"]')
  // `--background` de cada tema, em hex: a barra do navegador não lê variável de CSS.
  if (meta) meta.setAttribute('content', dark ? '#0e0e11' : '#fefdfd')
})()
