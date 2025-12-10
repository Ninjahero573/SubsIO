export async function fetchQueue() {
    const response = await fetch('/api/queue');
    return await response.json();
}

export async function deleteSong(id) {
    const resp = await fetch(`/api/queue/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || 'Remove failed');
    }
    return await resp.json();
}

export async function fetchYouTubePlaylists() {
    const resp = await fetch('/api/youtube/playlists');
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Failed to load playlists');
    return data;
}

export async function fetchYouTubePlaylistItems(playlistId) {
    const resp = await fetch(`/api/youtube/playlist/${encodeURIComponent(playlistId)}/items`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Failed to load items');
    return data;
}

export async function fetchSpotifyPlaylists() {
    const resp = await fetch('/api/spotify/playlists');
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Failed to load playlists');
    return data;
}

export async function fetchSpotifyPlaylistTracks(playlistId) {
    const resp = await fetch(`/api/spotify/playlist/${encodeURIComponent(playlistId)}/tracks`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Failed to load tracks');
    return data;
}

export async function fetchSpotifyProfile() {
    const resp = await fetch('/api/spotify/profile');
    if (!resp.ok) throw new Error('Failed to fetch profile');
    return await resp.json();
}

export async function fetchYouTubeProfile() {
    const resp = await fetch('/api/youtube/profile');
    if (!resp.ok) throw new Error('Failed to fetch profile');
    return await resp.json();
}

export async function search(query, limit = 10, offset = 0) {
    const params = new URLSearchParams({ q: query, limit, offset });
    const resp = await fetch(`/api/search?${params.toString()}`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Search failed');
    return data;
}

export async function addSong(url, addedBy) {
    const resp = await fetch('/api/add_song', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ url, added_by: addedBy })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Add failed');
    return data;
}

export async function logoutYouTube() {
    return await fetch('/auth/youtube/logout', { method: 'GET' });
}

export async function logoutSpotify() {
    return await fetch('/auth/spotify/logout', { method: 'GET' });
}
