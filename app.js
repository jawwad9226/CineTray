// Main application JavaScript
console.log('CineTray app initialized');

function readStoredWatchlist() {
    try {
        const stored = JSON.parse(localStorage.getItem('cinetray-watchlist') || '[]');
        return Array.isArray(stored) ? stored.filter(item =>
            item && typeof item.id === 'string' && typeof item.title === 'string'
        ) : [];
    } catch (error) {
        console.warn('Invalid saved watchlist; starting with an empty list.', error);
        localStorage.removeItem('cinetray-watchlist');
        return [];
    }
}

let watchlist = readStoredWatchlist();
let currentFilter = 'all';

// Sample movie titles for suggestions
const sampleMovies = [
    "The Shawshank Redemption", "The Godfather", "The Dark Knight", "Pulp Fiction",
    "The Lord of the Rings", "Forrest Gump", "Inception", "Fight Club",
    "The Matrix", "Goodfellas", "The Empire Strikes Back", "One Flew Over the Cuckoo's Nest",
    "Se7en", "The Silence of the Lambs", "It's a Wonderful Life", "Schindler's List",
    "Saving Private Ryan", "The Green Mile", "Interstellar", "Parasite",
    "Avengers: Endgame", "Titanic", "Avatar", "Black Panther", "Spider-Man: Into the Spider-Verse"
];

// TMDB API key comes from ENV; if missing, we'll fallback to local sampleMovies
const TMDB_API_KEY = (window.ENV && window.ENV.TMDB_API_KEY) || '';
if (!TMDB_API_KEY) {
    console.warn('TMDB_API_KEY not set in config.js. Suggestions will use local sample list only.');
}

// Simple debounce helper
function debounce(fn, delay = 300) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), delay);
    };
}

function saveData() {
    localStorage.setItem('cinetray-watchlist', JSON.stringify(watchlist));
    updateStats();
    renderWatchlist();
    syncToSupabase(); // Sync changes to Supabase
}

function nowISO() {
    return new Date().toISOString();
}

function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function migrateWatchlistDates() {
    let changed = false;
    watchlist = watchlist.map(item => {
        const migrated = { ...item };
        if (!migrated.updatedAt) {
            migrated.updatedAt = nowISO();
            changed = true;
        }
        ['dateAdded', 'dateWatched'].forEach(field => {
            if (migrated[field]) {
                const parsed = new Date(migrated[field]);
                if (!Number.isNaN(parsed.getTime()) && migrated[field] !== parsed.toISOString()) {
                    migrated[field] = parsed.toISOString();
                    changed = true;
                }
            }
        });
        return migrated;
    });
    if (changed) localStorage.setItem('cinetray-watchlist', JSON.stringify(watchlist));
}

function updateStats() {
    const total = watchlist.length;
    const watched = watchlist.filter(item => item.status === 'watched').length;
    const toWatch = total - watched;

    document.getElementById('totalCount').textContent = total;
    document.getElementById('watchedCount').textContent = watched;
    document.getElementById('toWatchCount').textContent = toWatch;
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    if (!notification || !message) return;
    notification.textContent = message;
    notification.className = `notification show ${type}`;
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function encodeHandlerArgument(value) {
    return encodeURIComponent(value).replace(/'/g, '%27');
}

function addItem() {
    const titleInput = document.getElementById('titleInput');
    const title = titleInput.value.trim();

    if (!title) {
        showNotification('Please enter a title');
        return;
    }

    // Check for duplicates
    const exists = watchlist.find(item => 
        item.title.toLowerCase() === title.toLowerCase()
    );

    if (exists) {
        showNotification('This title already exists in your watchlist');
        return;
    }

    const newItem = {
        id: generateId(),
        title: title,
        status: 'to-watch',
        dateAdded: nowISO(),
        dateWatched: null,
        updatedAt: nowISO()
    };

    watchlist.unshift(newItem);
    titleInput.value = '';
    hidesuggestions();
    saveData();
    showNotification(`"${title}" added to your watchlist!`);
}

function deleteItem(id) {
    if (confirm('Are you sure you want to remove this item?')) {
        const item = watchlist.find(item => item.id === id);
        if (!item) return;
        watchlist = watchlist.filter(item => item.id !== id);
        const deletedItems = readDeletedItems();
        deletedItems[id] = nowISO();
        writeDeletedItems(deletedItems);
        saveData();
        showNotification(`"${item.title}" removed from watchlist`);
    }
}

function toggleStatus(id) {
    const item = watchlist.find(item => item.id === id);
    if (item) {
        if (item.status === 'watched') {
            item.status = 'to-watch';
            item.dateWatched = null;
            showNotification(`"${item.title}" marked as to watch`);
        } else {
            item.status = 'watched';
            item.dateWatched = nowISO();
            showNotification(`"${item.title}" marked as watched!`);
        }
        item.updatedAt = nowISO();
        saveData();
    }
}

function openGoogleSearch(title) {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(title + ' movie')}`;
    window.open(searchUrl, '_blank');
}

function renderWatchlist() {
    const watchlistEl = document.getElementById('watchlist');
    let filteredItems = watchlist;

    if (currentFilter === 'watched') {
        filteredItems = watchlist.filter(item => item.status === 'watched');
    } else if (currentFilter === 'to-watch') {
        filteredItems = watchlist.filter(item => item.status === 'to-watch');
    }

    // Sort: to-watch items first, then by date added (newest first)
    filteredItems.sort((a, b) => {
        if (a.status === 'to-watch' && b.status === 'watched') return -1;
        if (a.status === 'watched' && b.status === 'to-watch') return 1;
        return new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime();
    });

    if (filteredItems.length === 0) {
        watchlistEl.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-film"></i>
                <h3>No items found</h3>
                <p>${currentFilter === 'all' ? 'Your watchlist is empty' : `No ${currentFilter.replace('-', ' ')} items`}</p>
            </div>
        `;
        return;
    }

    watchlistEl.innerHTML = filteredItems.map(item => {
        const title = escapeHTML(item.title);
        const encodedTitle = encodeHandlerArgument(item.title);
        return `
        <div class="watchlist-item">
            <div class="item-title" onclick="openGoogleSearch(decodeURIComponent('${encodedTitle}'))">
                ${title}
            </div>
            <div class="status-badge ${item.status === 'watched' ? 'status-watched' : 'status-to-watch'}">
                ${item.status === 'watched' ? 'Watched' : 'To Watch'}
            </div>
            <div class="item-dates">
                <span class="date-added">
                    Added: ${escapeHTML(formatDate(item.dateAdded))}
                </span>
                ${item.dateWatched ? `<span class="date-added">Watched: ${escapeHTML(formatDate(item.dateWatched))}</span>` : ''}
            </div>
            <div class="item-actions">
                <button class="action-btn ${item.status === 'watched' ? 'btn-unwatch' : 'btn-watch'}" 
                        onclick="toggleStatus('${item.id}')" 
                        title="${item.status === 'watched' ? 'Mark as To Watch' : 'Mark as Watched'}">
                    <i class="fas ${item.status === 'watched' ? 'fa-undo' : 'fa-eye'}"></i>
                </button>
                <button class="action-btn btn-delete" onclick="deleteItem('${item.id}')" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
    }).join('');
}

function setFilter(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-filter="${filter}"]`).classList.add('active');
    renderWatchlist();
}

async function showSuggestions(value) {
    const suggestionsEl = document.getElementById('suggestions');
    const q = value.trim();
    if (!q) {
        hidesuggestions();
        return;
    }

    // try TMDB first if API key provided
    let titles = [];
    if (TMDB_API_KEY) {
        try {
            const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(q)}&include_adult=false`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                titles = (data.results || [])
                    .map(r => r.title)
                    .filter(Boolean);
            }
        } catch (e) {
            // ignore and fallback
        }
    }

    // fallback to local sample movies when no results or no API key
    if (!titles.length) {
        titles = sampleMovies;
    }

    // filter, de-dup against watchlist, limit
    const existing = new Set(watchlist.map(i => i.title.toLowerCase()));
    const matches = titles.filter(t => 
        t.toLowerCase().includes(q.toLowerCase()) && !existing.has(t.toLowerCase())
    ).slice(0, 8);

    if (!matches.length) {
        hidesuggestions();
        return;
    }

    suggestionsEl.innerHTML = matches.map(movie => `
        <div class="suggestion-item" onclick="selectSuggestion(decodeURIComponent('${encodeHandlerArgument(movie)}'))">
            ${escapeHTML(movie)}
        </div>
    `).join('');
    suggestionsEl.style.display = 'block';
}

function selectSuggestion(title) {
    document.getElementById('titleInput').value = title;
    hidesuggestions();
}

function hidesuggestions() {
    document.getElementById('suggestions').style.display = 'none';
}

function toggleTheme() {
    const body = document.body;
    const themeToggle = document.querySelector('.theme-toggle i');
    
    if (body.hasAttribute('data-theme')) {
        body.removeAttribute('data-theme');
        themeToggle.className = 'fas fa-moon';
        localStorage.setItem('cinetray-theme', 'light');
    } else {
        body.setAttribute('data-theme', 'dark');
        themeToggle.className = 'fas fa-sun';
        localStorage.setItem('cinetray-theme', 'dark');
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Load saved theme
    const savedTheme = localStorage.getItem('cinetray-theme');
    if (savedTheme === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        document.querySelector('.theme-toggle i').className = 'fas fa-sun';
    }

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => setFilter(btn.dataset.filter));
    });

    // Search input
    const titleInput = document.getElementById('titleInput');
    const debouncedSuggest = debounce((val) => showSuggestions(val), 300);
    titleInput.addEventListener('input', (e) => debouncedSuggest(e.target.value));
    titleInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addItem();
        }
    });

    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.position-relative')) {
            hidesuggestions();
        }
    });

    // Initialize app
    migrateWatchlistDates();
    updateStats();
    renderWatchlist();
    
    // Auth listeners
    document.getElementById('loginButton').addEventListener('click', () => {
        const email = document.getElementById('emailInput').value;
        loginOrSignUp(email);
    });
    checkUser();
    handlePWARoute();
});

function handlePWARoute() {
    const params = new URLSearchParams(window.location.search);
    const sharedTitle = params.get('title') || params.get('text') || params.get('url');
    const titleInput = document.getElementById('titleInput');
    const shouldAdd = ['add', 'share'].includes(params.get('action')) ||
        window.location.pathname.endsWith('/add') ||
        window.location.pathname.endsWith('/share');
    if (shouldAdd && sharedTitle && titleInput) {
        titleInput.value = sharedTitle.trim();
        titleInput.focus();
        showNotification('Ready to add the shared title to your watchlist.', 'info');
    }

    if (params.get('view') === 'watchlist') {
        document.getElementById('watchlist')?.scrollIntoView({ behavior: 'smooth' });
    }
}

// Enhanced PWA Service Worker with better error handling
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('sw.js');
            console.log('CineTray PWA: Service Worker registered successfully', registration.scope);
            
            // Show install prompt after successful SW registration
            setTimeout(() => showPWAInstallPrompt(), 2000);
        } catch (error) {
            console.log('CineTray PWA: Service Worker registration failed', error);
            // Even if SW fails, show install prompt for PWA
            setTimeout(() => showPWAInstallPrompt(), 1000);
        }
    });
} else {
    console.log('CineTray PWA: Service Workers not supported');
    // Show basic PWA install prompt even without SW support
    setTimeout(() => showPWAInstallPrompt(), 1000);
}

// PWA Install Prompt - Enhanced
let deferredPrompt;
const installButton = document.getElementById('install-button');
if (installButton) installButton.addEventListener('click', installPWA);

window.addEventListener('beforeinstallprompt', (e) => {
    console.log('CineTray PWA: Install prompt available');
    e.preventDefault();
    deferredPrompt = e;
    showInstallButton();
});

// Detect if app is already installed
window.addEventListener('appinstalled', (e) => {
    console.log('CineTray PWA: App was installed');
    hideInstallButton();
    showNotification('🎉 CineTray installed successfully! Launch from your home screen.');
});

function showInstallButton() {
    if (installButton && !isAppInstalled()) {
        installButton.style.display = 'flex';
    }
}

function hideInstallButton() {
    if (installButton) {
        installButton.style.display = 'none';
    }
}

function isAppInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: window-controls-overlay)').matches ||
        navigator.standalone === true;
}

async function installPWA() {
    if (deferredPrompt) {
        const promptEvent = deferredPrompt;
        deferredPrompt = null;
        hideInstallButton();
        await promptEvent.prompt();
        promptEvent.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('CineTray PWA: User accepted the install prompt');
            } else {
                console.log('CineTray PWA: User dismissed the install prompt');
                if (!isAppInstalled()) showInstallButton();
            }
        });
    }
}

function showPWAInstallPrompt() {
    if (isAppInstalled()) hideInstallButton();
}

// TWA (Trusted Web Activity) Detection and Optimization
function detectTWA() {
    // Check if running in TWA environment
    const isTWA = document.referrer.includes('android-app://') || 
                 window.matchMedia('(display-mode: standalone)').matches ||
                 navigator.standalone === true;
    
    if (isTWA) {
        console.log('CineTray: Running in TWA/PWA mode');
        document.body.classList.add('twa-mode');
        
        // Optimize for TWA
        optimizeForTWA();
    }

}

function optimizeForTWA() {
    // Add TWA-specific optimizations
    const style = document.createElement('style');
    style.textContent = `
        .twa-mode {
            --header-height: calc(2rem + env(safe-area-inset-top));
        }
        
        .twa-mode .header {
            padding-top: calc(1.5rem + env(safe-area-inset-top));
        }
        
        .twa-mode .container {
            padding-bottom: calc(0.5rem + env(safe-area-inset-bottom));
        }
        
        /* Hide install button in TWA mode */
        .twa-mode .theme-toggle[title*="Install"] {
            display: none;
        }
    `;
    document.head.appendChild(style);
}
