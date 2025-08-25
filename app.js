// Main application JavaScript
console.log('CineTray app initialized');

// Check if running as PWA
if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
    console.log('Running in PWA mode');
    document.documentElement.classList.add('pwa-mode');
}

// Check if running in TWA (Trusted Web Activity)
if (window.navigator.standalone === undefined && 
    window.matchMedia('(display-mode: standalone)').matches) {
    console.log('Running in TWA mode');
    document.documentElement.classList.add('twa-mode');
}
