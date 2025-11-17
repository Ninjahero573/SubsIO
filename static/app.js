// JukeboxLED Client-side JavaScript

let socket;
let currentQueue = [];
let currentSong = null;
let isPlaying = false;
let songDuration = 0;
let currentTime = 0;

// DOM Elements (will be initialized when DOM is ready)
let songForm;
let songUrlInput;
let addedByInput;
let messageDiv;
let nowPlayingDiv;
let queueDiv;
let queueCountSpan;
let connectionStatus;
let currentUserSpan;
let changeNameBtn;
let clearNameBtn;
let youtubeLoginBtn;
let ytPlaylistsDiv;
let ytPlaylistItemsDiv;
let ytPlaylistsPanel;
// Search UI Elements
let searchInput;
let searchStatus;
let searchResultsDiv;
let linkResultsDiv;

// Media Control Elements
let mediaControlsContainer;
let playPauseBtn;
let skipNextBtn;
let playbackSlider;
let sliderFill;
let currentTimeDisplay;
let totalTimeDisplay;
let volumeSlider;
let npToggleBtn;
let npQueuePanel;
let npQueueList;
let npCloseQueueBtn;

// Initialize DOM elements
function initializeDOMElements() {
    songForm = document.getElementById('add-song-form');
    // Single combined input used for both URLs and search terms
    songUrlInput = document.getElementById('song-or-search');
    addedByInput = document.getElementById('added-by');
    // point to the floating toast container
    messageDiv = document.getElementById('top-notifications');
    nowPlayingDiv = document.getElementById('now-playing');
    queueDiv = document.getElementById('queue');
    queueCountSpan = document.getElementById('queue-count');
    connectionStatus = document.getElementById('connection-status');
    currentUserSpan = document.getElementById('current-user');
    changeNameBtn = document.getElementById('change-name-btn');
    clearNameBtn = document.getElementById('clear-name-btn');
    youtubeLoginBtn = document.getElementById('youtube-login-btn');
    ytPlaylistsDiv = document.getElementById('yt-playlists');
    ytPlaylistItemsDiv = document.getElementById('yt-playlist-items');
    ytPlaylistsPanel = document.getElementById('youtube-playlists-panel');
    // Treat the same element as the search input for convenience
    searchInput = songUrlInput;
    searchStatus = document.getElementById('search-status');
    searchResultsDiv = document.getElementById('search-results');
    linkResultsDiv = document.getElementById('link-results');
    
    // Media control elements
    mediaControlsContainer = document.getElementById('media-controls-container');
    playPauseBtn = document.getElementById('play-pause-btn');
    skipNextBtn = document.getElementById('skip-next-btn');
    playbackSlider = document.getElementById('playback-slider');
    sliderFill = document.querySelector('.slider-fill');
    currentTimeDisplay = document.getElementById('current-time');
    totalTimeDisplay = document.getElementById('total-time');
    volumeSlider = document.getElementById('volume-slider');
    npToggleBtn = document.getElementById('np-toggle-queue-btn');
    npQueuePanel = document.getElementById('np-queue-panel');
    npQueueList = document.getElementById('np-queue-list');
    npCloseQueueBtn = document.getElementById('np-close-queue-btn');
    
    if (!songForm) {
        console.error('Could not find form elements');
        return false;
    }
    return true;
}

// Initialize Socket.IO
function initializeSocket() {
    socket = io();
}

// (Socket handlers are now in setupSocketHandlers function)

// Load Queue
async function loadQueue() {
    try {
        const response = await fetch('/api/queue');
        const data = await response.json();
        updateQueue(data);

        if (data.current && data.is_playing) {
            updateNowPlaying(data.current);
        } else {
            updateNowPlaying(null);
        }

        // Refresh compact panel if it's present
        try {
            if (npQueueList) updateNPQueuePanel((data && data.queue) ? data.queue : []);
        } catch (e) {
            // ignore
        }
    } catch (error) {
        console.error('Error loading queue:', error);
    }
}

// Update Queue Display
function updateQueue(data) {
    currentQueue = data.queue || [];
    queueCountSpan.textContent = currentQueue.length;
    // Render into the new persistent panel
    updateNPQueuePanel(currentQueue);
}

// Update Now Playing Display
function updateNowPlaying(song) {
    const bar = document.getElementById('now-playing-bar');

    if (!song) {
        // If we have a compact bar, update its minimal display
        if (bar) {
            const titleEl = document.getElementById('np-title');
            const artistEl = document.getElementById('np-artist');
            const thumbImg = document.getElementById('np-thumb-img');
            const progFill = document.getElementById('np-progress-fill');
            if (titleEl) titleEl.textContent = 'No song currently playing';
            if (artistEl) artistEl.textContent = '';
            if (thumbImg) { thumbImg.style.display = 'none'; thumbImg.src = ''; }
            if (progFill) progFill.style.width = '0%';
        } else {
            if (nowPlayingDiv) nowPlayingDiv.innerHTML = `
                <div class="empty-state">
                    <span class="icon">🎵</span>
                    <p>No song currently playing</p>
                </div>
            `;
            if (nowPlayingDiv) nowPlayingDiv.classList.remove('playing');
        }
        if (mediaControlsContainer) {
            mediaControlsContainer.style.display = 'none';
        }
        currentSong = null;
        return;
    }

    // If the compact bottom bar exists, populate its small fields
    if (bar) {
        currentSong = song;
        isPlaying = true;
        const titleEl = document.getElementById('np-title');
        const artistEl = document.getElementById('np-artist');
        const thumbImg = document.getElementById('np-thumb-img');
        const progFill = document.getElementById('np-progress-fill');

        if (titleEl) titleEl.textContent = song.title || 'Unknown';
        if (artistEl) artistEl.textContent = song.artist || '';
        if (thumbImg) {
            if (song.thumbnail) {
                thumbImg.src = song.thumbnail;
                thumbImg.style.display = '';
            } else {
                thumbImg.style.display = 'none';
            }
        }

        // Prefer a real playback-time driven percent when available.
        // If the server included `current_time`/`duration` use that;
        // otherwise, show buffered/download percent while preparing.
        let pct = 0;
        if (typeof song.current_time === 'number' && typeof song.duration === 'number' && song.duration > 0) {
            pct = Math.max(0, Math.min(100, (song.current_time / song.duration) * 100));
        } else if (typeof song.progress === 'number' && song.stage !== 'playing') {
            // Use progress reported during download/buffering stages.
            pct = Math.max(0, Math.min(100, song.progress));
        } else {
            // If the song is already marked as playing but we don't yet have
            // a playback_time_update, leave the compact bar at 0% and let
            // the real-time socket updates drive it shortly after start.
            pct = 0;
        }
        if (progFill) progFill.style.width = pct + '%';

        // Update play/pause icon
        updatePlayPauseButton();
        return;
    }

    // Fallback: render full now playing card inside the page
    currentSong = song;
    songDuration = song.duration;
    isPlaying = true;
    
    if (nowPlayingDiv) {
        nowPlayingDiv.innerHTML = `
            <div class="song-card">
                ${song.thumbnail ? `<img src="${song.thumbnail}" alt="${song.title}" class="song-thumbnail">` : ''}
                <div class="song-info">
                    <div class="song-title">${escapeHtml(song.title)}</div>
                    <div class="song-artist">${escapeHtml(song.artist)}</div>
                    <div class="song-meta">
                        Added by ${escapeHtml(song.added_by)} • ${formatDuration(song.duration)}
                    </div>
                </div>
            </div>
        `;
        nowPlayingDiv.classList.add('playing');
    }

    // Show media controls
    if (mediaControlsContainer) {
        mediaControlsContainer.style.display = 'block';
        if (totalTimeDisplay) totalTimeDisplay.textContent = formatDuration(song.duration);
        if (playbackSlider) playbackSlider.max = song.duration;
    }

    // Update play button
    updatePlayPauseButton();
}

// Update Play/Pause Button
function updatePlayPauseButton() {
    if (!playPauseBtn) return;

    // Use a CSS-driven glyph by toggling the `.playing` class and
    // keep the button content empty so no emoji/images are injected.
    if (isPlaying) {
        playPauseBtn.classList.add('playing');
        playPauseBtn.setAttribute('aria-pressed', 'true');
        playPauseBtn.innerHTML = '';
    } else {
        playPauseBtn.classList.remove('playing');
        playPauseBtn.setAttribute('aria-pressed', 'false');
        playPauseBtn.innerHTML = '';
    }
}

// Format time display
function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Setup Media Control Handlers
function setupMediaControlHandlers() {
    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', () => {
            if (currentSong) {
                isPlaying = !isPlaying;
                updatePlayPauseButton();
                socket.emit('toggle_playback', { playing: isPlaying });
            } 
        });
    }
    
    if (skipNextBtn) {
        skipNextBtn.addEventListener('click', () => {
            socket.emit('skip_song', { direction: 'next' });
        });
    }
    
    if (playbackSlider) {
        // Keep scrubber as visual only; don't emit seek
        // events until server-side seeking is implemented.
        playbackSlider.addEventListener('input', (e) => {
            const value = (e.target.value - playbackSlider.min) / (playbackSlider.max - playbackSlider.min) * 100;
            if (sliderFill) {
                sliderFill.style.width = value + '%';
            }
        });
    }
    
    if (volumeSlider) {
        volumeSlider.addEventListener('change', (e) => {
            const volume = parseFloat(e.target.value) / 100;
            socket.emit('set_volume', { volume: volume });
        });
    }
}

// Render the compact queue inside the expanded bottom-panel
function updateNPQueuePanel(queue) {
    if (!npQueueList) return;
    const items = queue || [];
    if (!items.length) {
        npQueueList.innerHTML = `<div class="empty-state"><p>No songs in queue.</p></div>`;
        return;
    }
    npQueueList.innerHTML = items.map((song, i) => {
        const title = escapeHtml(song.title || 'Unknown');
        const artist = escapeHtml(song.artist || '');
        const thumb = song.thumbnail ? `<img src="${song.thumbnail}" class="song-thumbnail">` : '';
        const pos = i + 1;
        const prog = (typeof song.progress === 'number') ? song.progress : 0;
        const stage = song.stage || song.status || 'queued';
        const stageLabel = stageLabelFor(stage);
        return `
            <div class="np-queue-item" data-song-id="${song.id}">
                <div class="np-queue-number">${pos}</div>
                ${thumb}
                <div class="np-qi-info">
                    <div class="np-qi-title">${title}</div>
                    <div class="np-qi-sub">${artist} • ${formatDuration(song.duration || 0)}</div>
                    <div class="song-progress" id="np-song-progress-${song.id}" style="display:block;margin-top:6px;">
                        <div class="progress-label">
                            <span class="progress-stage">${escapeHtml(stageLabel)}</span>
                            <span class="progress-percent">${prog}%</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width:${prog}%;"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function setupNowPlayingQueueToggle() {
    if (!npToggleBtn || !npQueuePanel) return;
    npToggleBtn.addEventListener('click', () => {
        const open = npQueuePanel.classList.toggle('open');
        npToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        npQueuePanel.setAttribute('aria-hidden', open ? 'false' : 'true');
        adjustNowPlayingHeight();
        if (open) loadQueue();
    });
    if (npCloseQueueBtn) {
        npCloseQueueBtn.addEventListener('click', () => {
            npQueuePanel.classList.remove('open');
            npToggleBtn.setAttribute('aria-expanded', 'false');
            npQueuePanel.setAttribute('aria-hidden', 'true');
            adjustNowPlayingHeight();
        });
    }
}

// Show Message
// Show Message
function showMessage(text, type='info', opts={}) {
    // type: 'success' | 'error' | 'info'
    if (!messageDiv) return;

    const id = `toast-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : ''}`;
    toast.id = id;

    const msg = document.createElement('div');
    msg.className = 'toast-message';
    msg.textContent = text;

    const close = document.createElement('button');
    close.className = 'toast-close';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.innerHTML = '✕';
    close.addEventListener('click', () => {
        dismissToast(toast);
    });

    toast.appendChild(msg);
    toast.appendChild(close);

    // Insert at top so newest appear first
    messageDiv.insertAdjacentElement('afterbegin', toast);

    // Auto-dismiss after timeout unless opts.sticky
    const timeout = (opts && opts.timeout) ? opts.timeout : 5000;
    if (!opts.sticky) {
        setTimeout(() => dismissToast(toast), timeout);
    }
}

function dismissToast(el) {
    if (!el) return;
    el.style.transition = 'opacity 180ms ease, transform 180ms ease';
    el.style.opacity = '0';
    el.style.transform = 'translateY(-6px) scale(0.98)';
    setTimeout(() => { try { el.remove(); } catch(e){} }, 200);
}

// Utility Functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Map internal stage/status to a friendly label (keeps in sync with socket handler)
function stageLabelFor(stage) {
    const stageEmoji = {
        'downloading': '⬇️ Downloading audio',
        'buffering': '📦 Preparing next up',
        'playing': '🎵 Now playing',
        'analyzing': '🔍 Analyzing',
        'generating': '✨ Generating Light Show',
        'saving': '💾 Saving',
        'error': '❌ Error',
        'queued': 'Waiting'
    };
    return stageEmoji[stage] || stage || 'Waiting';
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('JukeboxLED - Initializing...');
    
    if (!initializeDOMElements()) {
        console.error('Failed to initialize DOM elements');
        return;
    }
    
    initializeSocket();
    setupSocketHandlers();
    setupNowPlayingQueueToggle();
    setupMediaControlHandlers();
    setupFormHandler();
    setupUsernameHandlers();
    setupSearchHandlers();
    setupBentoHandlers();
    setupAuthHandlers();
    setupNowPlayingExpand();
    
    console.log('JukeboxLED initialized successfully');
    loadQueue();
});

// Measure header height and update CSS variable so fixed panels clear it
function adjustHeaderHeight() {
    try {
        const header = document.querySelector('header');
        if (!header) return;
        const rect = header.getBoundingClientRect();
        const h = Math.ceil(rect.height);
        document.documentElement.style.setProperty('--header-height', h + 'px');
    } catch (e) {
        // ignore
    }
}

// Allow tapping the compact Now Playing bar on mobile to expand it and show
// full information. Clicking control buttons still functions normally.
function setupNowPlayingExpand() {
    const bar = document.getElementById('now-playing-bar');
    if (!bar) return;

    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-expanded', 'false');

    bar.addEventListener('click', (e) => {
        // Ignore clicks on control buttons or inside interactive children
        if (e.target.closest('.control-btn') || e.target.closest('button') || e.target.closest('a')) return;

        // Only allow expand/collapse on small viewports
        if (!window.matchMedia('(max-width: 600px)').matches) return;

        if (bar.classList.contains('expanded')) {
            collapseBar();
        } else {
            expandBar();
        }
    });

    // Collapse when viewport grows beyond mobile
    window.addEventListener('resize', debounce(() => {
        if (!window.matchMedia('(max-width: 600px)').matches) {
            if (bar.classList.contains('expanded')) {
                // Immediately collapse without animation on large viewports
                bar.classList.remove('expanded');
                bar.style.maxHeight = '';
                bar.setAttribute('aria-expanded', 'false');
                adjustNowPlayingHeight();
            }
        }
    }, 150));

    function expandBar() {
        // Add expanded class so layout changes (e.g. column) apply,
        // then animate max-height from current to measured full height.
        bar.classList.add('expanded');
        bar.setAttribute('aria-expanded', 'true');
        // Ensure overflow clipped during animation
        bar.style.overflow = 'hidden';

        // Measure target height after expanded layout applied
        // allow the browser a tick to apply styles
        requestAnimationFrame(() => {
            let target = Math.max(bar.scrollHeight, 160);
            // Add a small buffer to account for mobile safe-area / home indicator
            // and any extra padding so controls aren't clipped.
            const SAFE_BUFFER = 24; // px
            target += SAFE_BUFFER;
            // While animating, set the CSS variable so page bottom padding
            // follows the expanding bar and content isn't obscured.
            document.documentElement.style.setProperty('--now-playing-height', target + 'px');
            bar.style.maxHeight = target + 'px';
            // When transition finishes, remove maxHeight so it grows naturally
            const onEnd = (ev) => {
                if (ev.propertyName === 'max-height') {
                    // Keep the CSS var set while expanded (so the page leaves room).
                    bar.style.maxHeight = 'none';
                    bar.style.overflow = '';
                    bar.removeEventListener('transitionend', onEnd);
                    adjustNowPlayingHeight();
                }
            };
            bar.addEventListener('transitionend', onEnd);
        });
    }

    function collapseBar() {
        // Animate from current height down to collapsed height
        const current = Math.ceil(bar.getBoundingClientRect().height);
        // set explicit maxHeight to current to start transition
        bar.style.maxHeight = current + 'px';
        bar.style.overflow = 'hidden';
        // force reflow
        // eslint-disable-next-line no-unused-expressions
        bar.offsetHeight;
        // Target collapsed height (measure current collapsed height if possible)
        // Compute a sensible collapsed height from the bar's natural compact layout
        // by temporarily removing expanded class and measuring, then restoring.
        let collapsed = 48;
        try {
            bar.classList.remove('expanded');
            collapsed = Math.ceil(bar.getBoundingClientRect().height) || collapsed;
            // Restore expanded class for the animation start state
            bar.classList.add('expanded');
        } catch (e) {
            // fallback to default
            collapsed = 48;
        }
        requestAnimationFrame(() => {
            // Add a small buffer so collapsed state doesn't clip controls
            bar.style.maxHeight = (collapsed + 8) + 'px';
        });

        const onEnd = (ev) => {
            if (ev.propertyName === 'max-height') {
                bar.classList.remove('expanded');
                bar.style.maxHeight = '';
                bar.style.overflow = '';
                bar.setAttribute('aria-expanded', 'false');
                bar.removeEventListener('transitionend', onEnd);
                // Update the CSS var to the collapsed height so page padding shrinks
                document.documentElement.style.setProperty('--now-playing-height', (collapsed + 8) + 'px');
                adjustNowPlayingHeight();
            }
        };
        bar.addEventListener('transitionend', onEnd);
    }
}

// Simple debounce
function debounce(fn, wait = 120) {
    let t = null;
    return function(...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
    };
}

// Update header height after DOM load and when layout changes
document.addEventListener('DOMContentLoaded', () => {
    adjustHeaderHeight();
    // Re-run after a short delay to catch any late DOM changes (e.g. auth button text)
    setTimeout(adjustHeaderHeight, 300);
});

// Adjust Now Playing bar height so the page leaves room at the bottom
function adjustNowPlayingHeight() {
    try {
        const bar = document.getElementById('now-playing-bar');
        if (!bar) return;
        const h = Math.ceil(bar.getBoundingClientRect().height);
        // Set the bar height only; panel extra space is tracked separately so
        // the bottom bar visual size doesn't change when the panel opens.
        document.documentElement.style.setProperty('--now-playing-height', h + 'px');
        // The side popup doesn't require extra bottom padding; keep panel height at 0.
        document.documentElement.style.setProperty('--np-panel-height', '0px');
    } catch (e) {
        // ignore
    }
}

document.addEventListener('DOMContentLoaded', () => {
    adjustNowPlayingHeight();
    setTimeout(adjustNowPlayingHeight, 300);
});

window.addEventListener('resize', debounce(() => { adjustHeaderHeight(); adjustNowPlayingHeight(); }, 150));

// Username persistence helpers
function setupUsernameHandlers() {
    const stored = localStorage.getItem('jukebox_username');

    // Initialize display based on whether we have a stored name
    if (stored && addedByInput) {
        addedByInput.value = stored;
        // hide the input for a cleaner UI; show current name instead
        addedByInput.style.display = 'none';
        if (currentUserSpan) currentUserSpan.innerHTML = `Name: <strong>${escapeHtml(stored)}</strong>`;
        if (clearNameBtn) clearNameBtn.style.display = 'inline-block';
        if (changeNameBtn) changeNameBtn.textContent = 'Edit';
    } else {
        if (addedByInput) addedByInput.style.display = '';
        if (currentUserSpan) currentUserSpan.innerHTML = `Name: <strong>Anonymous</strong>`;
        if (clearNameBtn) clearNameBtn.style.display = 'none';
        if (changeNameBtn) changeNameBtn.textContent = 'Set';
    }

    // Edit / Save button behaviour
    if (changeNameBtn && addedByInput) {
        changeNameBtn.addEventListener('click', () => {
            // Reveal the input and let the user edit
            addedByInput.style.display = '';
            addedByInput.focus();
            changeNameBtn.textContent = 'Save';
        });
    }

    // Save name helper (used on blur or Enter)
    function saveName() {
        const val = (addedByInput && addedByInput.value) ? addedByInput.value.trim() : '';
        if (val) {
            localStorage.setItem('jukebox_username', val);
            if (currentUserSpan) currentUserSpan.innerHTML = `Name: <strong>${escapeHtml(val)}</strong>`;
            if (clearNameBtn) clearNameBtn.style.display = 'inline-block';
            if (changeNameBtn) changeNameBtn.textContent = 'Edit';
            // hide input to keep UI clean
            if (addedByInput) addedByInput.style.display = 'none';
            showMessage('Name saved', 'success');
        } else {
            // empty -> clear stored name
            localStorage.removeItem('jukebox_username');
            if (currentUserSpan) currentUserSpan.innerHTML = `Name: <strong>Anonymous</strong>`;
            if (clearNameBtn) clearNameBtn.style.display = 'none';
            if (changeNameBtn) changeNameBtn.textContent = 'Set';
            if (addedByInput) addedByInput.style.display = '';
        }
    }

    // Clear saved name
    if (clearNameBtn) {
        clearNameBtn.addEventListener('click', () => {
            localStorage.removeItem('jukebox_username');
            if (addedByInput) {
                addedByInput.value = '';
                addedByInput.style.display = '';
            }
            if (currentUserSpan) currentUserSpan.innerHTML = `Name: <strong>Anonymous</strong>`;
            if (changeNameBtn) changeNameBtn.textContent = 'Set';
            clearNameBtn.style.display = 'none';
            showMessage('Saved name cleared. You can enter a new name when adding a song.', 'success');
        });
    }

    // Save on blur and on Enter key
    if (addedByInput) {
        addedByInput.addEventListener('blur', () => {
            saveName();
        });
        addedByInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addedByInput.blur();
            }
        });
    }
}

// OAuth UI handlers
function setupAuthHandlers() {
    if (!youtubeLoginBtn) return;

    // Clicking the button redirects the browser to the server-side OAuth start
    youtubeLoginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        // Navigate to start YouTube OAuth flow
        window.location.href = '/auth/youtube/login';
    });

    // On load, check whether the user is already authenticated by calling the playlists endpoint
    (async function checkAuthStatus() {
        try {
            const resp = await fetch('/api/youtube/playlists');
            if (resp.ok) {
                    // Signed in: mark the button visually and load playlists
                    youtubeLoginBtn.classList.add('signed-in');
                    youtubeLoginBtn.disabled = true;
                    if (ytPlaylistsPanel) ytPlaylistsPanel.style.display = '';
                    loadYouTubePlaylists();
            } else {
                // Not signed in - leave button active
                    youtubeLoginBtn.classList.remove('signed-in');
                    youtubeLoginBtn.disabled = false;
                    if (ytPlaylistsPanel) ytPlaylistsPanel.style.display = 'none';
            }
        } catch (err) {
            // Network or endpoint error - keep login button enabled
                youtubeLoginBtn.classList.remove('signed-in');
                youtubeLoginBtn.disabled = false;
                if (ytPlaylistsPanel) ytPlaylistsPanel.style.display = 'none';
        }
    })();
}


// Load and render YouTube playlists
async function loadYouTubePlaylists() {
    if (!ytPlaylistsDiv) return;
    ytPlaylistsDiv.innerHTML = '<div class="loading">Loading playlists...</div>';
    try {
        const resp = await fetch('/api/youtube/playlists');
        const data = await resp.json();
        if (!resp.ok) {
            ytPlaylistsDiv.innerHTML = `<div class="error">${data.error || 'Failed to load playlists'}</div>`;
            return;
        }
        const items = data.items || [];
        if (!items.length) {
            ytPlaylistsDiv.innerHTML = '<div class="empty-state"><p>No playlists found.</p></div>';
            return;
        }
        ytPlaylistsDiv.innerHTML = items.map(p => `
            <div class="yt-playlist" data-playlist-id="${p.id}">
                <button class="yt-playlist-btn">${escapeHtml(p.title)} <small>(${p.count})</small></button>
            </div>
        `).join('');

        // Wire up click handlers
        ytPlaylistsDiv.querySelectorAll('.yt-playlist-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const el = e.currentTarget.closest('.yt-playlist');
                const pid = el && el.getAttribute('data-playlist-id');
                if (pid) loadYouTubePlaylistItems(pid);
            });
        });
    } catch (err) {
        console.error('Error loading playlists:', err);
        ytPlaylistsDiv.innerHTML = '<div class="error">Failed to load playlists</div>';
    }
}


// Load items for a playlist and show add buttons
async function loadYouTubePlaylistItems(playlistId) {
    if (!ytPlaylistItemsDiv) return;
    ytPlaylistItemsDiv.innerHTML = '<div class="loading">Loading playlist items...</div>';
    try {
        const resp = await fetch(`/api/youtube/playlist/${encodeURIComponent(playlistId)}/items`);
        const data = await resp.json();
        if (!resp.ok) {
            ytPlaylistItemsDiv.innerHTML = `<div class="error">${data.error || 'Failed to load items'}</div>`;
            return;
        }
        const items = data.items || [];
        if (!items.length) {
            ytPlaylistItemsDiv.innerHTML = '<div class="empty-state"><p>No items in this playlist.</p></div>';
            return;
        }

        ytPlaylistItemsDiv.innerHTML = items.map(it => `
            <div class="yt-playlist-item">
                ${it.thumbnail ? `<img src="${it.thumbnail}" class="song-thumbnail">` : ''}
                <div class="song-info">
                    <div class="song-title">${escapeHtml(it.title)}</div>
                </div>
                <div class="actions">
                    <button class="add-yt-video" data-video-id="${it.videoId}">Add</button>
                </div>
            </div>
        `).join('');

        // Wire add handlers
        ytPlaylistItemsDiv.querySelectorAll('.add-yt-video').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const vid = btn.getAttribute('data-video-id');
                const url = `https://www.youtube.com/watch?v=${vid}`;
                const addedBy = (addedByInput && addedByInput.value.trim()) || 'YouTube';
                btn.disabled = true;
                try {
                    const respAdd = await fetch('/api/add_song', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url, added_by: addedBy })
                    });
                    const addData = await respAdd.json();
                    if (!respAdd.ok) throw new Error(addData.error || 'Add failed');
                    showMessage('Song added to queue!', 'success');
                    if (typeof loadQueue === 'function') loadQueue();
                } catch (err) {
                    console.error('Error adding video:', err);
                    showMessage('Failed to add video to queue', 'error');
                } finally {
                    btn.disabled = false;
                }
            });
        });

    } catch (err) {
        console.error('Error loading playlist items:', err);
        ytPlaylistItemsDiv.innerHTML = '<div class="error">Failed to load playlist items</div>';
    }
}

// Search handlers
function setupSearchHandlers() {
    if (!searchInput || !searchResultsDiv) return;

    let lastQuery = '';

    async function performSearch() {
        const q = searchInput.value.trim();
        if (!q) {
            searchStatus.textContent = 'Enter a search term first';
            searchResultsDiv.innerHTML = '';
            return;
        }

        // If this is a new query, reset state
        if (q !== lastQuery) {
            lastQuery = q;
            searchResultsDiv.innerHTML = '';
        }

        searchStatus.textContent = 'Searching...';

        try {
            const params = new URLSearchParams({ q });
            const resp = await fetch(`/api/search?${params.toString()}`);
            const data = await resp.json();
            if (!resp.ok) {
                throw new Error(data.error || 'Search failed');
            }

            const results = data.results || [];
            if (!results.length) {
                searchStatus.textContent = 'No results found';
                searchResultsDiv.innerHTML = '';
                return;
            }

            searchStatus.textContent = `Found ${results.length} result${results.length === 1 ? '' : 's'}`;

            const fragment = results.map(r => `
                <div class="search-result">
                    ${r.thumbnail ? `<img src="${r.thumbnail}" alt="${escapeHtml(r.title)}" class="song-thumbnail">` : ''}
                    <div class="song-info">
                        <div class="song-title">${escapeHtml(r.title)}</div>
                        <div class="song-artist">${escapeHtml(r.artist)}</div>
                        <div class="song-meta">${formatDuration(r.duration)} • YouTube</div>
                    </div>
                    <button class="add-from-search" data-url="${r.url}">
                        <span>➕</span> Add
                    </button>
                </div>
            `).join('');

            searchResultsDiv.insertAdjacentHTML('beforeend', fragment);

            // Wire up add buttons just for new nodes
            searchResultsDiv.querySelectorAll('.add-from-search').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const url = btn.getAttribute('data-url');
                    const addedBy = (addedByInput && addedByInput.value.trim()) || 'Anonymous';
                    btn.disabled = true;

                    try {
                        const respAdd = await fetch('/api/add_song', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url, added_by: addedBy }),
                        });
                        const addData = await respAdd.json();
                        if (!respAdd.ok) {
                            throw new Error(addData.error || 'Failed to add song');
                        }
                        showMessage('Song added to queue!', 'success');
                        if (typeof loadQueue === 'function') loadQueue();
                    } catch (err) {
                        console.error('Error adding from search:', err);
                        showMessage('Failed to add song from search.', 'error');
                    } finally {
                        btn.disabled = false;
                    }
                });
            });

        } catch (err) {
            console.error('Search error:', err);
            searchStatus.textContent = 'Search failed. Please try again.';
        }

        // No pagination UI in the new layout
    }

    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                // If the user entered a URL, allow the form submit to proceed
                // so the link-preview/add flow runs. Only intercept Enter
                // and run `performSearch()` when the input looks like a
                // search term (not a URL).
                const val = (searchInput.value || '').trim();
                const looksLikeUrl = /^(https?:\/\/)|(^www\.)|youtube\.com|youtu\.be/i.test(val);
                if (looksLikeUrl) {
                    // Auto-add the URL on Enter: prevent the normal form
                    // submit and call the add endpoint directly so Enter
                    // works for both paste-link and search flows.
                    e.preventDefault();
                    const addedBy = (addedByInput && addedByInput.value.trim()) || 'Anonymous';
                    addUrl(val, addedBy);
                    return;
                }

                e.preventDefault();
                performSearch();
            }
        });
    }

    // Expose performSearch for form submit handler
    window._jukeboxPerformSearch = performSearch;
}

// Setup Socket handlers
function setupSocketHandlers() {
    socket.on('connect', () => {
        console.log('Connected to server');
        connectionStatus.textContent = 'Connected';
        connectionStatus.className = 'connected';
        loadQueue();
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        connectionStatus.textContent = 'Disconnected';
        connectionStatus.className = 'disconnected';
    });

    socket.on('queue_updated', (data) => {
        console.log('Queue updated', data);
        updateQueue(data);
        try { if (npQueueList) updateNPQueuePanel((data && data.queue) ? data.queue : []); } catch (e) {}
    });

    socket.on('song_started', (song) => {
        console.log('Song started', song);
        updateNowPlaying(song);
        showMessage(`Now playing: ${song.title}`, 'success');
        
        for (let i = 0; i < 4; i++) {
            const ledBar = document.getElementById(`led-strip-${i}`);
            if (ledBar) {
                ledBar.classList.add('active');
            }
        }
    });

    socket.on('song_finished', (song) => {
        console.log('Song finished', song);
        for (let i = 0; i < 4; i++) {
            const ledBar = document.getElementById(`led-strip-${i}`);
            if (ledBar) {
                ledBar.classList.remove('active');
            }
        }
        
        loadQueue();
    });

    socket.on('song_progress', (data) => {
        console.log('Song progress', data);
        
        if (!data || !data.song_id) return;

        // and the new panel id `np-song-progress-<id>` so updates apply live
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

        // Update time display
        if (currentTimeDisplay) {
            currentTimeDisplay.textContent = formatDuration(currentTime);
        }

        // Update slider position (if visible)
        if (playbackSlider && duration > 0) {
            playbackSlider.value = currentTime;
            const percent = (currentTime / duration) * 100;
            if (sliderFill) {
                sliderFill.style.width = percent + '%';
            }
        }

        // If the compact bottom bar is present and this update matches the
        // currently playing song, update its small seeker in real time.
        try {
            const npFill = document.getElementById('np-progress-fill');
            // Only update if the server provided song_id and it matches
            // the currentSong (guard against races when switching songs)
            if (npFill && songId && currentSong && currentSong.id === songId && duration > 0) {
                const pct = Math.max(0, Math.min(100, (currentTime / duration) * 100));
                npFill.style.width = pct + '%';
            }
        } catch (e) {
            // ignore
        }
    });

    socket.on('playback_state_changed', (data) => {
        console.log('Playback state changed', data);
        isPlaying = data.is_playing;
        updatePlayPauseButton();
    });

    socket.on('song_skipped', (data) => {
        console.log('Song skipped', data);
        loadQueue();
        showMessage('Song skipped!', 'success');
    });

    // Arduino hardware info (forwarded from bridge)
    socket.on('arduino_info', (data) => {
        try {
            console.log('Arduino info', data);
            const el = document.querySelector('.status-info');
            if (!el) return;
            // Prefer formatted info if present
            if (data.total_leds && data.segments) {
                el.textContent = `🎛️ ${data.total_leds} WS2812B LEDs across ${data.segments.length} strips (${data.segments.join('+')})`;
            } else if (data.segments) {
                const total = data.segments.reduce((a,b)=>a+b,0);
                el.textContent = `🎛️ ${total} WS2812B LEDs across ${data.segments.length} strips (${data.segments.join('+')})`;
            } else if (data.raw) {
                el.textContent = data.raw;
            }
        } catch (e) {
            // ignore
        }
    });

    // Live LED strip levels (0.0 - 1.0 per strip)
    socket.on('led_levels', (data) => {
        try {
            const levels = data.levels || [];
            for (let i = 0; i < levels.length; i++) {
                const el = document.getElementById(`led-strip-${i}`);
                if (!el) continue;
                const pct = Math.max(0, Math.min(1, Number(levels[i] || 0)));
                const percent = Math.round(pct * 100);
                // Set a dynamic filled gradient to represent current brightness
                const color = 'rgba(99,102,241,0.95)';
                const dark = 'rgba(0,0,0,0.25)';
                el.style.background = `linear-gradient(90deg, ${color} ${percent}%, ${dark} ${percent}%)`;
                // Add glow when above a small threshold
                if (pct > 0.02) {
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                }
            }
        } catch (e) {
            // ignore
        }
    });
}

// Bento menu click handlers (quick actions)
function setupBentoHandlers() {
    try {
        const bentoSearch = document.getElementById('bento-search');
        const bentoQueue = document.getElementById('bento-queue');
        const bentoNow = document.getElementById('bento-nowplaying');

        if (bentoSearch && songUrlInput) {
            bentoSearch.addEventListener('click', () => {
                songUrlInput.focus();
                // If there's text that looks like a search, trigger search
                const val = (songUrlInput.value || '').trim();
                const looksLikeUrl = /^(https?:\/\/)|(^www\.)|youtube\.com|youtu\.be/i.test(val);
                if (val && !looksLikeUrl && typeof window._jukeboxPerformSearch === 'function') {
                    window._jukeboxPerformSearch();
                }
            });
        }

        if (bentoQueue && npToggleBtn) {
            bentoQueue.addEventListener('click', () => {
                // Toggle the same panel the compact button toggles
                npToggleBtn.click();
            });
        }

        if (bentoNow) {
            bentoNow.addEventListener('click', () => {
                const bar = document.getElementById('now-playing-bar');
                if (bar) bar.scrollIntoView({ behavior: 'smooth', block: 'end' });
            });
        }
    } catch (e) {
        // ignore
    }
}

// Setup form handler
function setupFormHandler() {
    if (!songForm) return;
    
    songForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Combined input value
        const raw = (songUrlInput && songUrlInput.value) ? songUrlInput.value.trim() : '';
        // Heuristic: treat as URL if it looks like a link
        const isUrl = /^(https?:\/\/)|(^www\.)|youtube\.com|youtu\.be/i.test(raw);
        const url = isUrl ? raw : '';
        const searchQuery = isUrl ? '' : raw;
        const addedBy = addedByInput.value.trim() || 'Anonymous';
        
        // Require input
        if (!url && !searchQuery) {
            showMessage('Please enter a link or a search term', 'error');
            return;
        }
        // If a search term is provided, perform a search and show results under the input
        if (searchQuery && typeof window._jukeboxPerformSearch === 'function') {
            // Clear any previous link preview when performing search
            if (linkResultsDiv) linkResultsDiv.innerHTML = '';
            window._jukeboxPerformSearch();
        }

        // If a URL is provided, show a link preview card under the input
        if (url) {
            if (linkResultsDiv) {
                // Simple preview card: show URL and an Add button
                linkResultsDiv.innerHTML = `
                    <div class="search-result">
                        <div class="song-info">
                            <div class="song-title">Link ready to add</div>
                            <div class="song-artist">${escapeHtml(url)}</div>
                        </div>
                        <button class="add-from-link" data-url="${url}">
                            <span>➕</span> Add to Queue
                        </button>
                    </div>
                `;

                // Wire Add button to actually add the song
                const addBtn = linkResultsDiv.querySelector('.add-from-link');
                if (addBtn) {
                    addBtn.addEventListener('click', async () => {
                        addBtn.disabled = true;
                        try {
                            const response = await fetch('/api/add_song', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({ url, added_by: addedBy })
                            });
                            const data = await response.json();
                            if (response.ok) {
                                showMessage('Song added to queue!', 'success');
                                songUrlInput.value = '';
                                if (typeof loadQueue === 'function') loadQueue();
                            } else {
                                showMessage(data.error || 'Failed to add song', 'error');
                            }
                        } catch (err) {
                            console.error('Error adding link song:', err);
                            showMessage('Failed to add song. Please try again.', 'error');
                        } finally {
                            addBtn.disabled = false;
                        }
                    });
                }
            }
        }
    });
}

// Add a URL directly (used for Enter-on-URL quick-add)
async function addUrl(url, addedBy) {
    if (!url) return false;
    const by = addedBy || (addedByInput && addedByInput.value.trim()) || 'Anonymous';
    try {
        const resp = await fetch('/api/add_song', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url, added_by: by })
        });
        const data = await resp.json();
        if (!resp.ok) {
            showMessage(data.error || 'Failed to add song', 'error');
            return false;
        }
        showMessage('Song added to queue!', 'success');
        if (songUrlInput) songUrlInput.value = '';
        if (linkResultsDiv) linkResultsDiv.innerHTML = '';
        if (searchResultsDiv) searchResultsDiv.innerHTML = '';
        if (typeof loadQueue === 'function') loadQueue();
        return true;
    } catch (err) {
        console.error('Error auto-adding URL:', err);
        showMessage('Failed to add song. Please try again.', 'error');
        return false;
    }
}
