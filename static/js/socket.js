import { state } from './state.js';
import { elements } from './dom.js';
import * as ui from './ui.js';
import * as actions from './actions.js';
import { showMessage } from './toast.js';
import { announceCurrentUser } from './auth.js';
import { formatDuration } from './utils.js';
import * as audiostream from './audiostream.js';

export function initializeSocket() {
    state.socket = io();
}

export function setupSocketHandlers() {
    const socket = state.socket;
    if (!socket) return;

    socket.on('connect', () => {
        console.log('Connected to server');
        if (elements.connectionStatus) {
            elements.connectionStatus.textContent = 'Connected';
            elements.connectionStatus.className = 'connected';
        }
        if (elements.indicatorDot) {
            elements.indicatorDot.classList.remove('disconnected', 'connecting');
            elements.indicatorDot.classList.add('connected');
            elements.indicatorDot.setAttribute('aria-hidden', 'false');
        }
        if (elements.connectionText) {
            elements.connectionText.textContent = 'Connected';
            elements.connectionText.classList.remove('disconnected', 'connecting');
            elements.connectionText.classList.add('connected');
        }
        if (elements.connectionIndicator) {
            elements.connectionIndicator.classList.remove('disconnected', 'connecting');
            elements.connectionIndicator.classList.add('connected');
            elements.connectionIndicator.removeAttribute('aria-disabled');
        }
        try { announceCurrentUser(); } catch (e) {}
        actions.loadQueue();
        try { startPresencePoll(); } catch (e) {}
    });

    socket.on('reconnect_attempt', () => {
        try {
            if (elements.connectionIndicator) {
                elements.connectionIndicator.classList.remove('connected', 'disconnected');
                elements.connectionIndicator.classList.add('connecting');
                elements.connectionIndicator.setAttribute('aria-disabled', 'true');
            }
        } catch (e) {}
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        if (elements.connectionStatus) {
            elements.connectionStatus.textContent = 'Disconnected';
            elements.connectionStatus.className = 'disconnected';
        }
        if (elements.indicatorDot) {
            elements.indicatorDot.classList.remove('connected', 'connecting');
            elements.indicatorDot.classList.add('disconnected');
            elements.indicatorDot.setAttribute('aria-hidden', 'true');
        }
        if (elements.connectionText) {
            elements.connectionText.textContent = 'Disconnected';
            elements.connectionText.classList.remove('connected', 'connecting');
            elements.connectionText.classList.add('disconnected');
        }
        if (elements.connectionIndicator) {
            elements.connectionIndicator.classList.remove('connected', 'connecting');
            elements.connectionIndicator.classList.add('disconnected');
            elements.connectionIndicator.setAttribute('aria-disabled', 'true');
        }
        try { stopPresencePoll(); } catch (e) {}
    });

    socket.on('queue_updated', (data) => {
        console.log('Queue updated', data);
        ui.updateQueue(data, { onDelete: actions.removeSong });
    });

    socket.on('song_started', (song) => {
        console.log('Song started', song);
        ui.updateNowPlaying(song);
        showMessage(`Now playing: ${song.title}`, 'success');
        
        for (let i = 0; i < 4; i++) {
            const ledBar = document.getElementById(`led-strip-${i}`);
            if (ledBar) {
                ledBar.classList.add('active');
            }
        }
        
        // Handle audio streaming for new song
        audiostream.handleSongStarted(song);
    });

    socket.on('song_finished', (song) => {
        console.log('Song finished', song);
        for (let i = 0; i < 4; i++) {
            const ledBar = document.getElementById(`led-strip-${i}`);
            if (ledBar) {
                ledBar.classList.remove('active');
            }
        }
        
        // Handle audio streaming cleanup
        audiostream.handleSongFinished();
        
        actions.loadQueue();
    });

    socket.on('song_progress', (data) => {
        // console.log('Song progress', data); // Too noisy
        if (!data || !data.song_id) return;

        const container = document.getElementById(`song-progress-${data.song_id}`) || document.getElementById(`np-song-progress-${data.song_id}`);
        if (!container) return;

        const progressFill = container.querySelector('.progress-fill');
        const progressStage = container.querySelector('.progress-stage');
        const progressPercent = container.querySelector('.progress-percent');
        if (!progressFill || !progressStage || !progressPercent) return;

        container.style.display = 'block';

        const progress = data.progress || 0;
        progressFill.style.width = progress + '%';
        progressPercent.textContent = progress + '%';

        const stageEmoji = {
            'downloading': '⬇️ Downloading audio',
            'buffering': '📦 Preparing next up',
            'playing': '🎵 Now playing',
            'analyzing': '🔍 Analyzing',
            'generating': '✨ Generating Light Show',
            'saving': '💾 Saving',
            'error': '❌ Error'
        };

        progressStage.textContent = stageEmoji[data.stage] || data.stage;
    });

    socket.on('song_error', (data) => {
        console.error('Song error', data);
        showMessage(`Error playing ${data.song.title}: ${data.error}`, 'error');
    });

    socket.on('playback_time_update', (data) => {
        const currentTime = data.current_time || 0;
        const duration = data.duration || 0;
        const songId = data.song_id || null;

        // Update state
        state.currentTime = currentTime;
        state.songDuration = duration;

        if (elements.currentTimeDisplay) {
            elements.currentTimeDisplay.textContent = formatDuration(currentTime);
        }

        if (elements.playbackSlider && duration > 0) {
            elements.playbackSlider.value = currentTime;
            const percent = (currentTime / duration) * 100;
            if (elements.sliderFill) {
                elements.sliderFill.style.width = percent + '%';
            }
        }

        try {
            const npFill = document.getElementById('np-progress-fill');
            if (npFill && songId && state.currentSong && state.currentSong.id === songId && duration > 0) {
                const pct = Math.max(0, Math.min(100, (currentTime / duration) * 100));
                npFill.style.width = pct + '%';
            }
        } catch (e) {}

        // Sync audio stream position with server
        audiostream.syncAudioPosition(currentTime, duration);
    });

    socket.on('playback_state_changed', (data) => {
        console.log('Playback state changed', data);
        state.isPlaying = data.is_playing;
        ui.updatePlayPauseButton();
        
        // Sync audio stream play/pause state
        audiostream.handlePlaybackStateChanged(data.is_playing);
    });

    socket.on('song_skipped', (data) => {
        console.log('Song skipped', data);
        actions.loadQueue();
        showMessage('Song skipped!', 'success');
    });

    socket.on('arduino_info', (data) => {
        try {
            console.log('Arduino info', data);
            const el = document.querySelector('.status-info');
            if (!el) return;
            if (data.total_leds && data.segments) {
                el.textContent = `🎛️ ${data.total_leds} WS2812B LEDs across ${data.segments.length} strips (${data.segments.join('+')})`;
            } else if (data.segments) {
                const total = data.segments.reduce((a,b)=>a+b,0);
                el.textContent = `🎛️ ${total} WS2812B LEDs across ${data.segments.length} strips (${data.segments.join('+')})`;
            } else if (data.raw) {
                el.textContent = data.raw;
            }
        } catch (e) {}
    });

    socket.on('led_levels', (data) => {
        try {
            const levels = data.levels || [];
            for (let i = 0; i < levels.length; i++) {
                const el = document.getElementById(`led-strip-${i}`);
                if (!el) continue;
                const pct = Math.max(0, Math.min(1, Number(levels[i] || 0)));
                const percent = Math.round(pct * 100);
                const color = 'rgba(99,102,241,0.95)';
                const dark = 'rgba(0,0,0,0.25)';
                el.style.background = `linear-gradient(90deg, ${color} ${percent}%, ${dark} ${percent}%)`;
                if (pct > 0.02) {
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                }
            }
        } catch (e) {}
    });

    socket.on('user_list', (data) => {
        const users = (data && data.users) ? data.users : [];
        state.cachedUserList = users;
        const existing = document.getElementById('presence-popup');
        if (existing) {
            updatePresencePopup(users);
        }
    });

    if (elements.connectionIndicator) {
        elements.connectionIndicator.style.cursor = 'pointer';
        elements.connectionIndicator.setAttribute('aria-haspopup', 'true');
        elements.connectionIndicator.setAttribute('aria-expanded', 'false');
        elements.connectionIndicator.addEventListener('click', (e) => {
            e.stopPropagation();
                if (elements.connectionIndicator.classList.contains('disconnected') || elements.connectionIndicator.classList.contains('connecting')) {
                    try { showMessage('Cannot view users while disconnected or connecting', 'info'); } catch (e) {}
                    return;
                }
            const existing = document.getElementById('presence-popup');
            if (existing) {
                try { existing.remove(); } catch (e) {}
                elements.connectionIndicator.setAttribute('aria-expanded', 'false');
                return;
            }

            elements.connectionIndicator.setAttribute('aria-expanded', 'true');
            showPresencePopup([], true);
            try { socket.emit('request_user_list'); } catch (err) { showPresencePopup([], false); }
        });
    }
}

function startPresencePoll() {
    try {
        if (state.presencePollInterval) return;
        if (state.socket && state.socket.connected && !(elements.connectionIndicator && elements.connectionIndicator.classList.contains('disconnected'))) {
            try { state.socket.emit('request_user_list'); } catch (e) {}
        }
        state.presencePollInterval = setInterval(() => {
            if (!state.socket || !state.socket.connected) return;
            if (elements.connectionIndicator && elements.connectionIndicator.classList.contains('disconnected')) return;
            try { state.socket.emit('request_user_list'); } catch (e) {}
        }, 15000);
    } catch (e) { /* ignore */ }
}

function stopPresencePoll() {
    try { if (state.presencePollInterval) { clearInterval(state.presencePollInterval); state.presencePollInterval = null; } } catch (e) {}
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
        if (elements.connectionIndicator) {
            const rect = elements.connectionIndicator.getBoundingClientRect();
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
        try { if (elements.connectionIndicator) elements.connectionIndicator.setAttribute('aria-expanded', 'false'); } catch (e) {}
    }
}
