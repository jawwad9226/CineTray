// js/auth.js

// WARNING: These are public-facing credentials and are not secure.
// For this project's scope (a simple app for friends), this is acceptable.
// For a production app, you would use environment variables and a server-side component.

// Require env at runtime (no hardcoded fallbacks)
const _ENV = window.ENV || {};
if (!_ENV.SUPABASE_URL || !_ENV.SUPABASE_ANON_KEY) {
    const msg = 'Missing Supabase config. Please create config.js with SUPABASE_URL and SUPABASE_ANON_KEY.';
    console.error(msg);
    // Surface to user once in UI if available
    try { showNotification(msg, 'error'); } catch (_) {}
    throw new Error(msg);
}

const SUPABASE_URL = _ENV.SUPABASE_URL;
const SUPABASE_ANON_KEY = _ENV.SUPABASE_ANON_KEY;

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

async function loginOrSignUp(email) {
    if (!email) {
        showNotification('Please enter a valid email.', 'error');
        return;
    }

    // 1. Check if user exists
    let { data: user, error } = await supabaseClient
        .from('users')
        .select('id, email')
        .eq('email', email)
        .maybeSingle(); // avoids 406 when no row

    if (error) {
        console.error('Error checking user:', error);
        showNotification('Error logging in. Please try again.', 'error');
        return;
    }

    // 2. If user doesn't exist, create them
    if (!user) {
        let { data: newUser, error: insertError } = await supabaseClient
            .from('users')
            .insert({ email: email })
            .select('id, email')
            .single();

        if (insertError) {
            console.error('Error creating user:', insertError);
            showNotification('Error creating account. Please try again.', 'error');
            return;
        }
        user = newUser;
        showNotification(`Welcome! Your account for ${email} has been created.`);
    } else {
        showNotification(`Welcome back, ${email}!`);
    }

    // 3. Store user locally and start the app
    localStorage.setItem('cinetray-user', JSON.stringify(user));
    currentUser = user;
    
    // Hide login and initialize main app
    document.getElementById('login-modal').style.display = 'none';
    document.body.style.overflow = 'auto';

    // Initial data sync
    await syncFromSupabase();
    await syncToSupabase(); // Sync any offline changes made before login
    
    // Render the watchlist with potentially merged data
    renderWatchlist();
}

function logout() {
    localStorage.removeItem('cinetray-user');
    localStorage.removeItem('cinetray-watchlist'); // Clear local data on logout
    currentUser = null;
    watchlist = [];
    renderWatchlist();
    document.getElementById('login-modal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function checkUser() {
    const user = localStorage.getItem('cinetray-user');
    if (user) {
        currentUser = JSON.parse(user);
        document.getElementById('login-modal').style.display = 'none';
        document.body.style.overflow = 'auto';
        // Sync data on load
        syncFromSupabase();
    } else {
        document.getElementById('login-modal').style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

// --- Data Sync Functions ---

async function syncToSupabase() {
    if (!currentUser || !navigator.onLine) {
        return; // Don't sync if offline or not logged in
    }

    const localWatchlist = JSON.parse(localStorage.getItem('cinetray-watchlist') || '[]');
    if (localWatchlist.length === 0) return; // Nothing to sync

    const recordsToUpsert = localWatchlist.map(item => ({
        user_id: currentUser.id,
        movie_id: item.id, // Using your existing ID as a unique movie identifier
        movie_data: {
            title: item.title,
            status: item.status,
            dateAdded: item.dateAdded,
            dateWatched: item.dateWatched
        }
    }));

    const { error } = await supabaseClient
        .from('watchlist')
        .upsert(recordsToUpsert, { onConflict: 'user_id, movie_id' });

    if (error) {
        console.error('Error syncing to Supabase:', error);
        showNotification('Could not sync data to cloud.', 'error');
    } else {
        console.log('Data successfully synced to Supabase.');
    }
}


async function syncFromSupabase() {
    if (!currentUser || !navigator.onLine) {
        return;
    }

    let { data: remoteWatchlist, error } = await supabaseClient
        .from('watchlist')
        .select('movie_id, movie_data')
        .eq('user_id', currentUser.id);

    if (error) {
        console.error('Error fetching from Supabase:', error);
        return;
    }

    let localWatchlist = JSON.parse(localStorage.getItem('cinetray-watchlist') || '[]');
    
    // Simple merge strategy: remote data overwrites local if there's a conflict.
    // A more robust strategy would use timestamps to see which is newer.
    const remoteItems = remoteWatchlist.map(item => ({
        id: item.movie_id,
        ...item.movie_data
    }));

    // Create a map of local items for quick lookup
    const localItemsMap = new Map(localWatchlist.map(item => [item.id, item]));

    // Merge remote items into the map
    remoteItems.forEach(item => {
        localItemsMap.set(item.id, item);
    });

    // Convert map back to array
    watchlist = Array.from(localItemsMap.values());
    
    saveData(); // Save the merged list locally
    console.log('Data successfully synced from Supabase.');
}

// --- Offline Sync Handling ---

window.addEventListener('online', () => {
    showNotification('You are back online! Syncing data...', 'success');
    syncToSupabase();
});

window.addEventListener('offline', () => {
    showNotification('You are offline. Changes will be saved locally.', 'warning');
});