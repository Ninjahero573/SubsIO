import * as api from './api.js';
import * as ui from './ui.js';
import { state } from './state.js';
import { showMessage } from './toast.js';
import { elements } from './dom.js';
import * as audiostream from './audiostream.js';

export async function loadQueue() {
    try {
        const data = await api.fetchQueue();
        ui.updateQueue(data, { onDelete: removeSong });

        // Sync the playing state from the server
        state.isPlaying = data.is_playing || false;

        if (data.current && data.is_playing) {
            ui.updateNowPlaying(data.current);
        } else {
            ui.updateNowPlaying(null);
        }
        
        // Update button to reflect current playing state
        ui.updatePlayPauseButton();
        
        // Attempt to resume audio stream if it was playing before navigation
        audiostream.attemptResumeAudioStream();
    } catch (error) {
        console.error('Error loading queue:', error);
    }
}

export async function removeSong(id, btn) {
    if (btn) btn.disabled = true;
    try {
        await api.deleteSong(id);
        showMessage('Song removed from queue', 'success');
        await loadQueue();
    } catch (err) {
        console.error('Failed to remove song', err);
        showMessage('Failed to remove song', 'error');
        if (btn) btn.disabled = false;
    }
}

export async function addSong(url, btn) {
    if (btn && !ui.startAdding(btn)) return;
    // Prefer the server-side authenticated user's display name when available.
    let addedBy = null;
    try {
        const meResp = await fetch('/api/me', { credentials: 'same-origin' });
        if (meResp.ok) {
            const meData = await meResp.json().catch(() => ({}));
            if (meData && meData.user) addedBy = meData.user.display_name || meData.user.email || null;
        }
    } catch (e) {
        addedBy = null;
    }
    // If not authenticated server-side, fall back to connected service display names or anonymous
    if (!addedBy) addedBy = state.youtubeDisplayName || state.spotifyDisplayName || 'Anonymous';

    try {
        await api.addSong(url, addedBy);
        showMessage('Song added to queue!', 'success');
        await loadQueue();
    } catch (err) {
        console.error('Error adding song:', err);
        showMessage('Failed to add song', 'error');
    } finally {
        if (btn) ui.finishAdding(btn);
    }
}

export async function loadYouTubePlaylists() {
    if (!elements.ytPlaylistsDiv) return;
    elements.ytPlaylistsDiv.innerHTML = '<div class="loading">Loading playlists...</div>';
    try {
        const data = await api.fetchYouTubePlaylists();
        ui.renderYouTubePlaylists(data.items || [], { onSelect: loadYouTubePlaylistItems });
    } catch (err) {
        console.error('Error loading playlists:', err);
        elements.ytPlaylistsDiv.innerHTML = '<div class="error">Failed to load playlists</div>';
    }
}

export async function loadYouTubePlaylistItems(playlistId) {
    if (!elements.ytPlaylistItemsDiv) return;
    ui.setPanelVisibility('youtube', 'items', true);
    elements.ytPlaylistItemsDiv.innerHTML = '<div class="loading">Loading playlist items...</div>';
    try {
        const data = await api.fetchYouTubePlaylistItems(playlistId);
        ui.renderYouTubePlaylistItems(data.items || [], { 
            onAdd: (videoId, btn) => addSong(`https://www.youtube.com/watch?v=${videoId}`, btn) 
        });
    } catch (err) {
        console.error('Error loading playlist items:', err);
        elements.ytPlaylistItemsDiv.innerHTML = '<div class="error">Failed to load playlist items</div>';
    }
}

export async function loadSpotifyPlaylists() {
    if (!elements.spPlaylistsDiv) return;
    elements.spPlaylistsDiv.innerHTML = '<div class="loading">Loading playlists...</div>';
    try {
        const data = await api.fetchSpotifyPlaylists();
        ui.renderSpotifyPlaylists(data.items || [], { onSelect: loadSpotifyPlaylistTracks });
    } catch (err) {
        console.error('Error loading Spotify playlists:', err);
        elements.spPlaylistsDiv.innerHTML = '<div class="error">Failed to load playlists</div>';
    }
}

export async function loadSpotifyPlaylistTracks(playlistId) {
    if (!elements.spPlaylistItemsDiv) return;
    ui.setPanelVisibility('spotify', 'items', true);
    elements.spPlaylistItemsDiv.innerHTML = '<div class="loading">Loading playlist tracks...</div>';
    try {
        const data = await api.fetchSpotifyPlaylistTracks(playlistId);
        ui.renderSpotifyPlaylistTracks(data.items || [], { 
            onAdd: async (trackInfo, btn) => {
                if (!ui.startAdding(btn)) return;
                const query = `${trackInfo.title} ${trackInfo.artists}`.trim();
                try {
                    const s = await api.search(query, 1);
                    if (!s.results || !s.results.length) throw new Error('No matching YouTube result found');
                    const url = s.results[0].url;
                    // Prefer server-side authenticated user name for attribution
                    let addedBy = null;
                    try {
                        const meResp = await fetch('/api/me', { credentials: 'same-origin' });
                        if (meResp.ok) {
                            const meData = await meResp.json().catch(() => ({}));
                            if (meData && meData.user) addedBy = meData.user.display_name || meData.user.email || null;
                        }
                    } catch (e) {
                        addedBy = null;
                    }
                    if (!addedBy) addedBy = state.spotifyDisplayName || 'Spotify';
                    await api.addSong(url, addedBy);
                    showMessage('Song added to queue!', 'success');
                    await loadQueue();
                } catch (err) {
                    console.error('Error adding Spotify track:', err);
                    showMessage('Failed to add track to queue', 'error');
                } finally {
                    ui.finishAdding(btn);
                }
            }
        });
    } catch (err) {
        console.error('Error loading Spotify playlist tracks:', err);
        elements.spPlaylistItemsDiv.innerHTML = '<div class="error">Failed to load playlist tracks</div>';
    }
}

export async function performSearch(reset = false) {
    const q = elements.searchInput.value.trim();
    if (!q) {
        elements.searchStatus.textContent = 'Enter a search term first';
        elements.searchResultsDiv.innerHTML = '';
        if (elements.searchMoreBtn) elements.searchMoreBtn.style.display = 'none';
        return;
    }

    // Use state for search pagination
    if (reset) {
        state.searchCache = [];
        state.searchCachePos = 0;
        elements.searchResultsDiv.innerHTML = '';
        if (elements.searchMoreBtn) elements.searchMoreBtn.style.display = 'none';
    }

    elements.searchStatus.textContent = (state.searchCachePos === 0) ? 'Searching...' : 'Loading more results...';
    if (elements.searchMoreBtn) {
        elements.searchMoreBtn.disabled = true;
        elements.searchMoreBtn.classList.add('loading');
    }

    try {
        const data = await api.search(q, 10, state.searchCachePos);
        const results = data.results || [];
        
        if (!results.length && state.searchCachePos === 0) {
            elements.searchStatus.textContent = 'No results found';
            elements.searchResultsDiv.innerHTML = '';
            if (elements.searchMoreBtn) elements.searchMoreBtn.style.display = 'none';
            return;
        }

        ui.renderSearchResults(results, { 
            onAdd: (url, btn) => addSong(url, btn) 
        });

        state.searchCachePos += results.length;

        if (results.length === 10) {
            if (elements.searchMoreBtn) elements.searchMoreBtn.style.display = '';
            elements.searchStatus.textContent = `Showing ${state.searchCachePos}+ results`;
        } else {
            if (elements.searchMoreBtn) elements.searchMoreBtn.style.display = 'none';
            elements.searchStatus.textContent = `Showing ${state.searchCachePos} result${state.searchCachePos === 1 ? '' : 's'}`;
        }

    } catch (err) {
        console.error('Search error:', err);
        elements.searchStatus.textContent = 'Search failed. Please try again.';
        if (elements.searchMoreBtn) elements.searchMoreBtn.style.display = 'none';
    } finally {
        if (elements.searchMoreBtn) {
            elements.searchMoreBtn.disabled = false;
            elements.searchMoreBtn.classList.remove('loading');
        }
    }
}
