/**
 * Gamehub Socket.IO Management
 * Connects to main server and handles real-time updates
 */

import { state } from './state.js';
import { state as mainState } from '../static/js/state.js';
import * as audiostream from '../static/js/audiostream.js';

export function initializeSocket() {
    state.socket = io('/', {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5
    });
    
    return state.socket;
}

export function setupSocketHandlers() {
    if (!state.socket) return;
    
    // Connection events
    state.socket.on('connect', () => {
        state.isConnected = true;
        updateConnectionStatus('Connected', 'connected');
        state.socket.emit('request_current_state');
    });

    state.socket.on('disconnect', () => {
        state.isConnected = false;
        updateConnectionStatus('Disconnected', 'disconnected');
    });

    state.socket.on('reconnect_attempt', () => {
        updateConnectionStatus('Reconnecting...', 'connecting');
    });
    
    // Playback events
    state.socket.on('song_started', (song) => {
        state.currentSong = song;
        mainState.currentSong = song;
        updateNowPlaying(song);
    });
    
    state.socket.on('song_finished', () => {
        state.currentSong = null;
        mainState.currentSong = null;
        updateNowPlaying(null);
    });
    
    state.socket.on('playback_time_update', (data) => {
        state.currentTime = data.current_time;
        state.songDuration = data.duration;
        mainState.currentTime = data.current_time;
        mainState.songDuration = data.duration;
        updateProgress(data.current_time, data.duration);
    });
    
    state.socket.on('playback_state_changed', (data) => {
        state.isPlaying = data.is_playing;
        mainState.isPlaying = data.is_playing;
        updatePlayPauseButton();
    });
    
    // State requests
    state.socket.on('current_state', (data) => {
        console.log('[Gamehub] Received current_state:', data);
        if (data.current_song) {
            state.currentSong = data.current_song;
            mainState.currentSong = data.current_song;
            updateNowPlaying(data.current_song);
        }
        state.isPlaying = data.is_playing;
        mainState.isPlaying = data.is_playing;
        updatePlayPauseButton();
        
        // Attempt to resume audio stream after state sync
        audiostream.attemptResumeAudioStream();
    });
    
    state.socket.on('queue_updated', (data) => {
        console.log('[Gamehub] Queue updated event received:', data);
        state.queue = data.queue || [];
        console.log('[Gamehub] Queue data:', state.queue);
        console.log('[Gamehub] Queue length:', state.queue.length);
        updateQueueDisplay(state.queue);
    });

    state.socket.on('user_list', (data) => {
        const users = (data && data.users) ? data.users : [];
        state.cachedUserList = users;
        const existing = document.getElementById('presence-popup');
        if (existing) {
            updatePresencePopup(users);
        }
    });

    const connectionIndicator = document.getElementById('connection-indicator');
    if (connectionIndicator) {
        connectionIndicator.style.cursor = 'pointer';
        connectionIndicator.setAttribute('aria-haspopup', 'true');
        connectionIndicator.setAttribute('aria-expanded', 'false');
        connectionIndicator.addEventListener('click', (e) => {
            e.stopPropagation();
            if (connectionIndicator.classList.contains('disconnected') || connectionIndicator.classList.contains('connecting')) {
                console.log('[Gamehub] Cannot view users while disconnected or connecting');
                return;
            }
            const existing = document.getElementById('presence-popup');
            if (existing) {
                try { existing.remove(); } catch (e) {}
                connectionIndicator.setAttribute('aria-expanded', 'false');
                return;
            }

            connectionIndicator.setAttribute('aria-expanded', 'true');
            showPresencePopup([], true);
            try { state.socket.emit('request_user_list'); } catch (err) { showPresencePopup([], false); }
        });
    }
}

function updateConnectionStatus(text, className) {
    const indicator = document.getElementById('connection-indicator');
    const indicatorDot = document.querySelector('.indicator-dot');
    const connectionText = document.getElementById('connection-text');
    
    if (indicator) {
        indicator.className = `connection-indicator ${className}`;
    }
    if (indicatorDot) {
        indicatorDot.className = `indicator-dot ${className}`;
    }
    if (connectionText) {
        connectionText.textContent = text;
        connectionText.className = `connection-text ${className}`;
    }
}

function updateNowPlaying(song) {
    const npTitle = document.getElementById('np-title');
    const npArtist = document.getElementById('np-artist');
    const npThumbImg = document.getElementById('np-thumb-img');
    
    if (!song) {
        if (npTitle) npTitle.textContent = 'No song currently playing';
        if (npArtist) npArtist.textContent = '';
        if (npThumbImg) npThumbImg.style.display = 'none';
        return;
    }
    
    if (npTitle) npTitle.textContent = song.title || 'Unknown Song';
    if (npArtist) npArtist.textContent = song.artist || 'Unknown Artist';
    if (npThumbImg && song.thumbnail) {
        npThumbImg.src = song.thumbnail;
        npThumbImg.style.display = 'block';
    }
}

function updateProgress(currentTime, duration) {
    const npProgressFill = document.getElementById('np-progress-fill');
    if (npProgressFill && duration > 0) {
        const percent = (currentTime / duration) * 100;
        npProgressFill.style.width = Math.min(100, percent) + '%';
    }
}

function updatePlayPauseButton() {
    const playPauseBtn = document.getElementById('play-pause-btn');
    if (playPauseBtn) {
        if (state.isPlaying) {
            playPauseBtn.classList.add('playing');
            playPauseBtn.setAttribute('aria-pressed', 'true');
        } else {
            playPauseBtn.classList.remove('playing');
            playPauseBtn.setAttribute('aria-pressed', 'false');
        }
    }
}

function updateQueueDisplay(queue) {
    const queueList = document.getElementById('np-queue-list');
    const queueCount = document.getElementById('queue-count');
    
    console.log('[updateQueueDisplay] queue:', queue);
    
    if (!queueList) {
        console.error('[updateQueueDisplay] Queue list element not found!');
        return;
    }
    
    // Ensure queue is an array
    if (!Array.isArray(queue)) {
        console.error('[updateQueueDisplay] Queue is not an array:', queue);
        queue = [];
    }
    
    queueList.innerHTML = '';
    
    if (queue.length === 0) {
        console.log('[updateQueueDisplay] Queue is empty');
        queueList.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-secondary);">Queue is empty</div>';
        if (queueCount) queueCount.textContent = '0';
        return;
    }
    
    console.log('[updateQueueDisplay] Adding', queue.length, 'items to queue');
    queue.forEach((song, index) => {
        const item = document.createElement('div');
        item.className = 'np-queue-item';
        
        const durationStr = song.duration ? formatDuration(song.duration) : '';
        const addedBy = song.added_by || 'Anonymous';
        const status = song.status || 'queued';
        const progress = song.progress || 0;
        
        // Determine status icon and text
        let statusIcon = '⏳';
        let statusText = 'Queued';
        
        if (status === 'downloading') {
            statusIcon = '📥';
            statusText = `Downloading ${progress}%`;
        } else if (status === 'analyzing') {
            statusIcon = '🔍';
            statusText = `Analyzing ${progress}%`;
        } else if (status === 'generating') {
            statusIcon = '✨';
            statusText = `Generating ${progress}%`;
        } else if (status === 'ready' || status === 'downloaded') {
            statusIcon = '✅';
            statusText = `Downloaded, in queue 100%`;
        } else if (status === 'playing') {
            statusIcon = '▶️';
            statusText = 'Now playing';
        } else if (status === 'error') {
            statusIcon = '❌';
            statusText = 'Error';
        }
        
        console.log(`[Queue Item ${index}] Title: ${song.title}, Status: ${statusText}, Added by: ${addedBy}`);
        
        // Build the HTML: left sidebar (number + delete), thumbnail, info on right
        item.innerHTML = `
            <div class="np-queue-left">
                <div class="np-queue-number">${index + 1}</div>
                <button class="queue-delete-btn" data-song-index="${index}" title="Remove from queue">🗑️</button>
            </div>
            ${song.thumbnail ? `<img src="${song.thumbnail}" alt="thumbnail" class="song-thumbnail">` : '<div style="width:56px; height:56px; background: rgba(255,255,255,0.1); border-radius:6px; flex-shrink:0;"></div>'}
            <div class="np-qi-info">
                <div class="np-qi-title">${song.title || 'Unknown'}</div>
                <div class="np-qi-sub">${song.artist || 'Unknown Artist'} • ${durationStr} • Added by ${addedBy}</div>
                <div class="np-qi-status" style="font-size: 11px; margin-top: 4px; color: var(--text-secondary);">${statusIcon} ${statusText}</div>
            </div>
        `;
        
        queueList.appendChild(item);
        console.log('[Queue Item Appended]', item);
        
        // Add delete button handler
        const deleteBtn = item.querySelector('.queue-delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                console.log(`[Delete] Removing song at index ${index}`);
                if (state.socket) {
                    state.socket.emit('remove_from_queue', { index });
                }
            });
        }
    });
    
    if (queueCount) queueCount.textContent = queue.length;
}

// Helper function to format duration
function formatDuration(seconds) {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function updatePresencePopup(users) {
    const popup = document.getElementById('presence-popup');
    if (!popup) return;
    const header = popup.querySelector('.presence-header');
    const list = popup.querySelector('.presence-list');
    if (header) header.textContent = `Connected users (${(users && users.length) ? users.length : 0})`;
    if (!list) return;
    list.innerHTML = '';
    if (!users || !users.length) {
        const li = document.createElement('div');
        li.className = 'presence-item empty';
        li.textContent = 'No other users connected';
        list.appendChild(li);
        return;
    }
    users.forEach(u => {
        const li = document.createElement('div');
        li.className = 'presence-item';
        const name = u.name || u.short_id || 'Anonymous';
        const id = u.short_id ? ` (${u.short_id})` : '';
        li.textContent = name + id;
        list.appendChild(li);
    });
}

function showPresencePopup(users, loading = false) {
    const existing = document.getElementById('presence-popup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.id = 'presence-popup';
    popup.className = 'presence-popup';

    const header = document.createElement('div');
    header.className = 'presence-header';
    header.textContent = loading ? 'Connected users — loading…' : `Connected users (${users.length})`;
    popup.appendChild(header);

    const list = document.createElement('div');
    list.className = 'presence-list';

    if (loading) {
        const li = document.createElement('div');
        li.className = 'presence-item loading';
        li.textContent = 'Loading...';
        list.appendChild(li);
    } else if (!users || !users.length) {
        const li = document.createElement('div');
        li.className = 'presence-item empty';
        li.textContent = 'No other users connected';
        list.appendChild(li);
    } else {
        users.forEach(u => {
            const li = document.createElement('div');
            li.className = 'presence-item';
            const name = u.name || u.short_id || 'Anonymous';
            const id = u.short_id ? ` (${u.short_id})` : '';
            li.textContent = name + id;
            list.appendChild(li);
        });
    }

    popup.appendChild(list);

    const close = document.createElement('button');
    close.className = 'presence-close';
    close.setAttribute('aria-label', 'Close');
    close.innerHTML = '✕';
    close.addEventListener('click', () => closePresencePopup(popup));
    popup.appendChild(close);

    document.body.appendChild(popup);

    requestAnimationFrame(() => {
        try { popup.classList.add('open'); } catch (e) {}
    });

    try {
        const connectionIndicator = document.getElementById('connection-indicator');
        if (connectionIndicator) {
            const rect = connectionIndicator.getBoundingClientRect();
            const top = rect.bottom + 8;
            const left = Math.min(window.innerWidth - 12 - popup.offsetWidth, Math.max(8, rect.left));
            popup.style.position = 'fixed';
            popup.style.right = 'auto';
            popup.style.bottom = 'auto';
            popup.style.left = `${left}px`;
            popup.style.top = `${top}px`;
        } else {
            popup.style.position = 'fixed';
            popup.style.left = 'auto';
            popup.style.top = '56px';
            popup.style.right = '14px';
            popup.style.bottom = 'auto';
        }
    } catch (e) {}

    setTimeout(() => {
        document.addEventListener('click', onDocClick);
        document.addEventListener('keydown', onDocKey);
    }, 0);

    function onDocClick(ev) {
        if (!popup.contains(ev.target)) closePresencePopup(popup);
    }
    function onDocKey(ev) {
        if (ev.key === 'Escape') closePresencePopup(popup);
    }

    function closePresencePopup(el) {
        try { document.removeEventListener('click', onDocClick); } catch (e) {}
        try { document.removeEventListener('keydown', onDocKey); } catch (e) {}
        try { el.remove(); } catch (e) {}
        try { 
            const connectionIndicator = document.getElementById('connection-indicator');
            if (connectionIndicator) connectionIndicator.setAttribute('aria-expanded', 'false'); 
        } catch (e) {}
    }
}
