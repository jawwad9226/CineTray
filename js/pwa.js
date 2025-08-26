// js/pwa.js — passive PWA/TWA mode flags only
(() => {
  try {
    // Add CSS class when running as PWA
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
      console.log('Running in PWA mode');
      document.documentElement.classList.add('pwa-mode');
    }

    // Add CSS class when running as TWA
    if (window.navigator.standalone === undefined && window.matchMedia('(display-mode: standalone)').matches) {
      console.log('Running in TWA mode');
      document.documentElement.classList.add('twa-mode');
    }
  } catch (e) {
    console.debug('PWA/TWA mode detection skipped', e);
  }
})();