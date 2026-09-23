// Entry point. Bundled by esbuild into a single IIFE (dist/content.js) --
// see build.mjs. This replaces the old `(async function initUnifiedDashboard()
// { ... })()` wrapper; the polling logic below is ported verbatim from the
// end of that function.

import { injectWidget, purgeDefaultCanvasElements } from './components/widget-shell.js';
import { scrapeCanvasDashboardColors } from './utils/colors.js';
import { hydrateSyncedStorage, installSyncMirror } from './storage/xstorage.js';

// Immediately inject CSS to hide Canvas dashboard content before it renders
(function injectEarlyHidingStyles() {
  const style = document.createElement('style');
  style.textContent = `
    /* Hide right sidebar (To Do, Recent Feedback, etc.) immediately */
    #right-side .todo-list-needed,
    #right-side .to-do-list,
    #right-side .events_list,
    #right-side .recent_feedback,
    #right-side > div:not(#module-tasks-widget):not(#hidden-courses-popover),
    #right-side aside,
    .Sidebar__TodoListContainer,
    .ic-sidebar-right__event-list {
      display: none !important;
    }
    /* Hide main dashboard content (course cards, etc.) immediately */
    #content,
    .ic-Layout-contentMain,
    .dashboard,
    #main,
    .ic-Layout-content,
    .ic-DashboardCard__container,
    .ic-Layout-contentMain > *:not(#module-tasks-widget) {
      display: none !important;
    }
    /* Ensure right-side-wrapper is positioned for our widget */
    #right-side-wrapper {
      position: fixed !important; top: 24px !important; right: 24px !important; left: auto !important;
      float: none !important; margin: 0 !important;
      min-width: 410px !important; max-width: 460px !important; width: 26vw !important;
      max-height: calc(100vh - 48px) !important; overflow-y: auto !important; overflow-x: visible !important;
      z-index: 500 !important; box-sizing: border-box !important;
      transition: width 0.3s cubic-bezier(0.22, 1, 0.36, 1), transform 0.5s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.35s ease !important;
      container-type: inline-size !important;
      container-name: yace !important;
    }
    #right-side-wrapper::-webkit-scrollbar { width: 0 !important; }
    .ic-Layout-columns { display: flex !important; flex-wrap: nowrap !important; }
    #right-side { display: block !important; padding: 0 14px 24px 6px !important; box-sizing: border-box !important; }
    .ic-Layout-contentMain { margin-right: 0 !important; padding-right: 28px !important; }
  `;
  document.documentElement.appendChild(style);
})();

(function initUnifiedDashboard() {
  let widgetInjected = false;

  // Mirror every localStorage write into browser.storage.local (cross-origin
  // sync for the mycourses.unh.edu <-> unh.instructure.com split), then seed
  // this origin's localStorage from the storage area before rendering.
  // injectWidget() awaits the hydration again before its first render.
  installSyncMirror();
  hydrateSyncedStorage();

  function tryInjectWidget() {
    const rightSide = document.getElementById('right-side');
    if (rightSide && !document.getElementById('module-tasks-widget')) {
      document.body.classList.add('with-right-side');
      scrapeCanvasDashboardColors();
      injectWidget(rightSide);
      purgeDefaultCanvasElements();
      widgetInjected = true;
      return true;
    }
    return false;
  }

  // Try immediately in case right-side already exists
  if (tryInjectWidget()) return;

  // Use MutationObserver for faster detection than polling
  const observer = new MutationObserver(() => {
    if (tryInjectWidget()) {
      observer.disconnect();
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Fallback polling (in case MutationObserver misses it)
  const checkInterval = setInterval(() => {
    if (tryInjectWidget()) {
      clearInterval(checkInterval);
      observer.disconnect();
    }
  }, 200);

  // Cleanup after 10 seconds
  setTimeout(() => {
    clearInterval(checkInterval);
    observer.disconnect();
  }, 10000);

  // No periodic purge loop here: the injected CSS (above) hides Canvas's own
  // dashboard chrome with display:none, and purgeDefaultCanvasElements() runs
  // once at injection plus once after each scan. A setInterval version scanned
  // child.innerText (which forces a synchronous layout) every 2.5s forever.
})();
