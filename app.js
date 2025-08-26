// Main application JavaScript
console.log('CineTray app initialized');

let watchlist = JSON.parse(localStorage.getItem('cinetray-watchlist') || '[]');
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
    notification.textContent = message;
    notification.className = `notification show ${type}`;
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
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
        dateAdded: new Date().toLocaleDateString(),
        dateWatched: null
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
        watchlist = watchlist.filter(item => item.id !== id);
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
            item.dateWatched = new Date().toLocaleDateString();
            showNotification(`"${item.title}" marked as watched!`);
        }
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
        return new Date(b.dateAdded) - new Date(a.dateAdded);
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

    watchlistEl.innerHTML = filteredItems.map(item => `
        <div class="watchlist-item">
            <div class="item-title" onclick="openGoogleSearch('${item.title.replace(/'/g, "'\''")}')">
                ${item.title}
            </div>
            <div class="status-badge ${item.status === 'watched' ? 'status-watched' : 'status-to-watch'}">
                ${item.status === 'watched' ? 'Watched' : 'To Watch'}
            </div>
            <div class="item-dates">
                <span class="date-added">
                    Added: ${item.dateAdded}
                </span>
                ${item.dateWatched ? `<span class="date-added">Watched: ${item.dateWatched}</span>` : ''}
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
    `).join('');
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
        <div class="suggestion-item" onclick="selectSuggestion('${movie.replace(/'/g, "'\\''")}')">
            ${movie}
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
    updateStats();
    renderWatchlist();
    
    // Auth listeners
    document.getElementById('loginButton').addEventListener('click', () => {
        const email = document.getElementById('emailInput').value;
        loginOrSignUp(email);
    });
    checkUser();
});

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
let installButton;

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
    // Add install button to header if not already installed and not already shown
    if (!window.matchMedia('(display-mode: standalone)').matches && !installButton) {
        installButton = document.createElement('button');
        installButton.innerHTML = '';
        installButton.className = 'theme-toggle';
        installButton.title = 'Install CineTray App';
        installButton.style.marginLeft = '0.5rem';
        installButton.onclick = installPWA;
        
        document.querySelector('.header-content').appendChild(installButton);
    }
}

function hideInstallButton() {
    if (installButton) {
        installButton.remove();
        installButton = null;
    }
}

function installPWA() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('CineTray PWA: User accepted the install prompt');
                hideInstallButton();
            } else {
                console.log('CineTray PWA: User dismissed the install prompt');
            }
            deferredPrompt = null;
        });
    } else {
        // Fallback for browsers that don't support install prompt
        showNotification('');
    }
}

function showPWAInstallPrompt() {
    // Show notification about PWA capabilities
    if (!window.matchMedia('(display-mode: standalone)').matches && 
        !localStorage.getItem('pwa-prompt-shown-v2')) {
        
        // Check if we're on Android Chrome (primary TWA target)
        const isAndroidChrome = /Android/.test(navigator.userAgent) && /Chrome/.test(navigator.userAgent);
        
        if (isAndroidChrome) {
            showNotification('');
        } else {
            showNotification('');
        }
        
        localStorage.setItem('pwa-prompt-shown-v2', 'true');
    }
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
