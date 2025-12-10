import { elements } from './dom.js';
import { state } from './state.js';
import { showMessage } from './toast.js';
import * as api from './api.js';
import * as ui from './ui.js';
import * as actions from './actions.js';
import { escapeHtml } from './utils.js';

export async function announceCurrentUser() {
    try {
        if (!state.socket) return;
        if (!state.socket.connected) return;
        const stored = localStorage.getItem('jukebox_username');
        let name = (stored && stored.trim()) || state.youtubeDisplayName || state.spotifyDisplayName || null;
        // If no client-side name available, try to fetch authenticated user from server
        if (!name) {
            try {
                const resp = await fetch('/api/me', { credentials: 'same-origin' });
                if (resp.ok) {
                    const js = await resp.json().catch(() => ({}));
                    const user = js && js.user;
                    if (user) name = user.display_name || user.email || null;
                }
            } catch (e) {
                // ignore
            }
        }
        if (name) {
            state.socket.emit('announce_user', { name: name });
        }
    } catch (e) {
        // ignore
    }
}

// Expose helper for non-module scripts to trigger announceCurrentUser after login
try { window.announceCurrentUser = announceCurrentUser; } catch (e) {}

export function setupAuthHandlers() {
    if (elements.youtubeLoginBtn) {
        elements.youtubeLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (elements.youtubeLoginBtn.classList.contains('signed-in')) {
                api.logoutYouTube().then(resp => {
                    showMessage('Signed out of YouTube', 'success');
                    setTimeout(() => window.location.reload(), 300);
                }).catch(err => { console.error('Logout failed', err); showMessage('Sign-out failed', 'error'); });
                return;
            }
            window.location.href = '/auth/youtube/login';
        });
    }

    if (elements.spotifyLoginBtn) {
        elements.spotifyLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (elements.spotifyLoginBtn.classList.contains('signed-in')) {
                api.logoutSpotify().then(resp => {
                    showMessage('Signed out of Spotify', 'success');
                    setTimeout(() => window.location.reload(), 300);
                }).catch(err => { console.error('Spotify logout failed', err); showMessage('Sign-out failed', 'error'); });
                return;
            }
            window.location.href = '/auth/spotify/login';
        });
    }

    checkAuthStatus();
}

async function checkAuthStatus() {
    // YouTube check
    try {
        const data = await api.fetchYouTubePlaylists(); // This might fail if not auth, returns error
        // Actually fetchYouTubePlaylists throws if not ok.
        // We need to handle success.
        if (elements.youtubeLoginBtn) {
            elements.youtubeLoginBtn.classList.add('signed-in');
            elements.youtubeLoginBtn.disabled = false;
            elements.youtubeLoginBtn.title = 'Sign out of YouTube';
            ui.setPanelVisibility('youtube','playlists',true,{focusFirst:true});
            actions.loadYouTubePlaylists();
            try {
                const pd = await api.fetchYouTubeProfile();
                state.youtubeDisplayName = pd.displayName || null;
                const stored = localStorage.getItem('jukebox_username');
                if ((!stored || stored === '') && state.youtubeDisplayName && elements.currentUserSpan) {
                    elements.currentUserSpan.innerHTML = `Name: <strong>${escapeHtml(state.youtubeDisplayName)}</strong>`;
                    if (elements.addedByInput) { elements.addedByInput.value = state.youtubeDisplayName; elements.addedByInput.style.display = 'none'; }
                    try { announceCurrentUser(); } catch (e) {}
                }
            } catch (e) { console.warn('Failed to fetch YouTube profile', e); }
        }
    } catch (err) {
        if (elements.youtubeLoginBtn) { 
            elements.youtubeLoginBtn.classList.remove('signed-in'); 
            elements.youtubeLoginBtn.disabled = false; 
            elements.youtubeLoginBtn.title = 'Sign in with YouTube';
            ui.setPanelVisibility('youtube','playlists',false); 
            ui.setPanelVisibility('youtube','items',false); 
        }
    }

    // Spotify check
    try {
        const data = await api.fetchSpotifyPlaylists();
        if (elements.spotifyLoginBtn) {
            elements.spotifyLoginBtn.classList.add('signed-in');
            elements.spotifyLoginBtn.disabled = false;
            elements.spotifyLoginBtn.title = 'Sign out of Spotify';
            ui.setPanelVisibility('spotify','playlists',true,{focusFirst:true});
            actions.loadSpotifyPlaylists();
            try {
                const pd = await api.fetchSpotifyProfile();
                state.spotifyDisplayName = pd.displayName || null;
                const stored = localStorage.getItem('jukebox_username');
                if ((!stored || stored === '') && state.spotifyDisplayName && elements.currentUserSpan) {
                    elements.currentUserSpan.innerHTML = `Name: <strong>${escapeHtml(state.spotifyDisplayName)}</strong>`;
                    if (elements.addedByInput) { elements.addedByInput.value = state.spotifyDisplayName; elements.addedByInput.style.display = 'none'; }
                    try { announceCurrentUser(); } catch (e) {}
                }
            } catch (e) { console.warn('Failed to fetch Spotify profile', e); }
        }
    } catch (err) {
        if (elements.spotifyLoginBtn) { 
            elements.spotifyLoginBtn.classList.remove('signed-in'); 
            elements.spotifyLoginBtn.disabled = false; 
            elements.spotifyLoginBtn.title = 'Sign in with Spotify';
            ui.setPanelVisibility('spotify','playlists',false); 
            ui.setPanelVisibility('spotify','items',false); 
        }
    }
}

export function setupUsernameHandlers() {
    const stored = localStorage.getItem('jukebox_username');

    if (stored && elements.addedByInput) {
        elements.addedByInput.value = stored;
        elements.addedByInput.style.display = 'none';
        if (elements.currentUserSpan) elements.currentUserSpan.innerHTML = `Name: <strong>${escapeHtml(stored)}</strong>`;
        if (elements.clearNameBtn) elements.clearNameBtn.style.display = 'inline-block';
        if (elements.changeNameBtn) elements.changeNameBtn.textContent = 'Edit';
    } else {
        if (elements.addedByInput) elements.addedByInput.style.display = '';
        if (elements.currentUserSpan) elements.currentUserSpan.innerHTML = `Name: <strong>Anonymous</strong>`;
        if (elements.clearNameBtn) elements.clearNameBtn.style.display = 'none';
        if (elements.changeNameBtn) elements.changeNameBtn.textContent = 'Set';
    }

    if (elements.changeNameBtn && elements.addedByInput) {
        elements.changeNameBtn.addEventListener('click', () => {
            elements.addedByInput.style.display = '';
            elements.addedByInput.focus();
            elements.changeNameBtn.textContent = 'Save';
        });
    }

    function saveName() {
        const val = (elements.addedByInput && elements.addedByInput.value) ? elements.addedByInput.value.trim() : '';
        if (val) {
            localStorage.setItem('jukebox_username', val);
            if (elements.currentUserSpan) elements.currentUserSpan.innerHTML = `Name: <strong>${escapeHtml(val)}</strong>`;
            if (elements.clearNameBtn) elements.clearNameBtn.style.display = 'inline-block';
            if (elements.changeNameBtn) elements.changeNameBtn.textContent = 'Edit';
            if (elements.addedByInput) elements.addedByInput.style.display = 'none';
            showMessage('Name saved', 'success');
            try { announceCurrentUser(); } catch (e) {}
        } else {
            localStorage.removeItem('jukebox_username');
            if (elements.currentUserSpan) elements.currentUserSpan.innerHTML = `Name: <strong>Anonymous</strong>`;
            if (elements.clearNameBtn) elements.clearNameBtn.style.display = 'none';
            if (elements.changeNameBtn) elements.changeNameBtn.textContent = 'Set';
            if (elements.addedByInput) elements.addedByInput.style.display = '';
        }
    }

    if (elements.clearNameBtn) {
        elements.clearNameBtn.addEventListener('click', () => {
            localStorage.removeItem('jukebox_username');
            if (elements.addedByInput) {
                elements.addedByInput.value = '';
                elements.addedByInput.style.display = '';
            }
            if (elements.currentUserSpan) elements.currentUserSpan.innerHTML = `Name: <strong>Anonymous</strong>`;
            if (elements.changeNameBtn) elements.changeNameBtn.textContent = 'Set';
            elements.clearNameBtn.style.display = 'none';
            showMessage('Saved name cleared. You can enter a new name when adding a song.', 'success');
        });
    }

    if (elements.addedByInput) {
        elements.addedByInput.addEventListener('blur', () => {
            saveName();
        });
        elements.addedByInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                elements.addedByInput.blur();
            }
        });
    }
}
