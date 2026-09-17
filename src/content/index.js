// Entry point. Bundled by esbuild into a single IIFE (dist/content.js) --
// see build.mjs. This replaces the old `(async function initUnifiedDashboard()
// { ... })()` wrapper; the polling logic below is ported verbatim from the
// end of that function.

import { injectWidget, purgeDefaultCanvasElements } from './components/widget-shell.js';
import { scrapeCanvasDashboardColors } from './utils/colors.js';

(function initUnifiedDashboard() {
  const checkInterval = setInterval(() => {
    const rightSide = document.getElementById('right-side');
    if (rightSide && !document.getElementById('module-tasks-widget')) {
      document.body.classList.add('with-right-side');
      scrapeCanvasDashboardColors();
      injectWidget(rightSide);
      purgeDefaultCanvasElements();
    }
  }, 400);

  setInterval(purgeDefaultCanvasElements, 2500);
})();
