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

function deletedWatchlistKey() {
    return `cinetray-deleted-watchlist-${currentUser?.id || 'anonymous'}`;
}

function readDeletedItems() {
    try {
        const stored = JSON.parse(localStorage.getItem(deletedWatchlistKey()) || '{}');
        return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    } catch (error) {
        console.warn('Invalid deletion queue; starting with an empty queue.', error);
        localStorage.removeItem(deletedWatchlistKey());
        return {};
    }
}

function writeDeletedItems(items) {
    localStorage.setItem(deletedWatchlistKey(), JSON.stringify(items));
}

function showLoginError(message) {
    const errorEl = document.getElementById('login-error');
    if (errorEl) errorEl.textContent = message;
    showNotification(message, 'error');
}

async function loginOrSignUp(email) {
    const emailInput = document.getElementById('emailInput');
    const loginButton = document.getElementById('loginButton');
    const normalizedEmail = email.trim().toLowerCase();

    if (!emailInput.checkValidity() || !normalizedEmail) {
        showLoginError('Please enter a valid email address.');
        return;
    }

    loginButton.disabled = true;
    loginButton.textContent = 'Signing in...';
    showLoginError('');

    try {
        let { data: user, error } = await supabaseClient
            .from('users')
            .select('id, email')
            .eq('email', normalizedEmail)
            .maybeSingle();

        if (error) throw error;

        if (!user) {
            const { data: newUser, error: insertError } = await supabaseClient
                .from('users')
                .insert({ email: normalizedEmail })
                .select('id, email')
                .single();

            if (insertError) throw insertError;
            user = newUser;
            showNotification(`Welcome! Your account for ${normalizedEmail} has been created.`, 'success');
        } else {
            showNotification(`Welcome back, ${normalizedEmail}!`, 'success');
        }

        localStorage.setItem('cinetray-user', JSON.stringify(user));
        currentUser = user;

        document.getElementById('login-modal').style.display = 'none';
        document.body.style.overflow = 'auto';

        await syncFromSupabase();
        await syncToSupabase();
        renderWatchlist();
    } catch (error) {
        console.error('Login failed:', error);
        showLoginError('Unable to sign in right now. Check your connection and try again.');
    } finally {
        loginButton.disabled = false;
        loginButton.textContent = 'Login';
    }
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
        try {
            currentUser = JSON.parse(user);
        } catch (error) {
            console.warn('Invalid saved user; showing login.', error);
            localStorage.removeItem('cinetray-user');
            currentUser = null;
        }
    }
    if (currentUser) {
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

    const localWatchlist = Array.isArray(watchlist) ? watchlist : [];
    const deletedItems = readDeletedItems();

    const recordsToUpsert = localWatchlist.map(item => ({
        user_id: currentUser.id,
        movie_id: item.id, // Using your existing ID as a unique movie identifier
        movie_data: {
            title: item.title,
            status: item.status,
            dateAdded: item.dateAdded,
            dateWatched: item.dateWatched,
            updatedAt: item.updatedAt || new Date().toISOString()
        }
    }));

    if (recordsToUpsert.length) {
        const { error } = await supabaseClient
            .from('watchlist')
            .upsert(recordsToUpsert, { onConflict: 'user_id, movie_id' });

        if (error) {
            console.error('Error syncing to Supabase:', error);
            showNotification('Could not sync data to cloud.', 'error');
            return;
        }
    }

    const deletedIds = Object.keys(deletedItems);
    if (deletedIds.length) {
        const { error } = await supabaseClient
            .from('watchlist')
            .delete()
            .eq('user_id', currentUser.id)
            .in('movie_id', deletedIds);
        if (error) {
            console.error('Error syncing deleted items:', error);
            showNotification('Could not sync deleted items to cloud.', 'error');
            return;
        }
        writeDeletedItems({});
    }
    console.log('Data successfully synced to Supabase.');
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

    const localWatchlist = Array.isArray(watchlist) ? watchlist : [];
    const deletedItems = readDeletedItems();
    const remoteItems = remoteWatchlist.map(item => ({
        id: item.movie_id,
        ...item.movie_data
    }));

    const localItemsMap = new Map(localWatchlist.map(item => [item.id, item]));
    remoteItems.forEach(remoteItem => {
        const localItem = localItemsMap.get(remoteItem.id);
        const deletedAt = deletedItems[remoteItem.id];
        const remoteUpdatedAt = new Date(remoteItem.updatedAt || 0).getTime();
        const localUpdatedAt = new Date(localItem?.updatedAt || 0).getTime();

        if (deletedAt && remoteUpdatedAt <= new Date(deletedAt).getTime()) {
            localItemsMap.delete(remoteItem.id);
            return;
        }
        delete deletedItems[remoteItem.id];
        if (!localItem || remoteUpdatedAt > localUpdatedAt) {
            localItemsMap.set(remoteItem.id, remoteItem);
        }
    });

    Object.keys(deletedItems).forEach(id => localItemsMap.delete(id));
    watchlist = Array.from(localItemsMap.values());
    writeDeletedItems(deletedItems);
    localStorage.setItem('cinetray-watchlist', JSON.stringify(watchlist));
    updateStats();
    renderWatchlist();
    await syncToSupabase();
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