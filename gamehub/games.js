/**
 * WebGames Arcade - Standalone games page
 * Connects to main SubsIO server for shared features
 */

// Initialize socket connection to main server
const socket = io('/', {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5
});

// Connection state
let isConnected = false;

// Handle connection events
socket.on('connect', () => {
    isConnected = true;
    updateConnectionStatus('Connected', 'connected');
    // Request current state from server
    socket.emit('request_current_state');
});

socket.on('disconnect', () => {
    isConnected = false;
    updateConnectionStatus('Disconnected', 'disconnected');
});

socket.on('reconnect_attempt', () => {
    updateConnectionStatus('Reconnecting...', 'connecting');
});

// Update connection indicator
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

// Hamburger menu
document.addEventListener('DOMContentLoaded', () => {
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const siteMenu = document.getElementById('site-menu');
    const siteMenuClose = document.getElementById('site-menu-close');

    if (hamburgerBtn && siteMenu) {
        hamburgerBtn.addEventListener('click', () => {
            siteMenu.classList.toggle('open');
            const isOpen = siteMenu.classList.contains('open');
            hamburgerBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            siteMenu.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
        });

        if (siteMenuClose) {
            siteMenuClose.addEventListener('click', () => {
                siteMenu.classList.remove('open');
                hamburgerBtn.setAttribute('aria-expanded', 'false');
                siteMenu.setAttribute('aria-hidden', 'true');
            });
        }

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!siteMenu.contains(e.target) && !hamburgerBtn.contains(e.target)) {
                siteMenu.classList.remove('open');
                hamburgerBtn.setAttribute('aria-expanded', 'false');
                siteMenu.setAttribute('aria-hidden', 'true');
            }
        });
    }

    // Wallet balance
    const walletBalance = document.getElementById('walletBalance');
    const walletReset = document.getElementById('walletReset');

    function loadWallet() {
        const saved = localStorage.getItem('arcadeWallet');
        if (saved) {
            walletBalance.textContent = '$' + parseFloat(saved).toFixed(2);
        }
    }

    function resetWallet() {
        localStorage.setItem('arcadeWallet', '1000');
        if (walletBalance) {
            walletBalance.textContent = '$1000.00';
        }
    }

    loadWallet();

    if (walletReset) {
        walletReset.addEventListener('click', () => {
            if (confirm('Reset wallet balance to $1000?')) {
                resetWallet();
            }
        });
    }

    // Setup audio stream button
    setupAudioStreamButton();

    // Setup music player UI and buttons
    setupMusicPlayerDisplay();
});

/**
 * Setup the audio stream button with volume control
 */
function setupAudioStreamButton() {
    const audioStreamBtn = document.getElementById('audio-stream-btn');
    const audioVolumePopup = document.getElementById('audio-volume-popup');
    const audioVolumeSlider = document.getElementById('audio-volume-slider');
    const audioVolumeValue = document.getElementById('audio-volume-value');

    if (!audioStreamBtn) return;

    // Toggle audio stream on click
    audioStreamBtn.addEventListener('click', () => {
        socket.emit('toggle_audio_stream');
    });

    // Right-click to open volume popup
    audioStreamBtn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (audioVolumePopup) {
            audioVolumePopup.classList.toggle('open');
        }
    });

    // Long-press detection (500ms) for volume control
    let pressTimer;
    audioStreamBtn.addEventListener('mousedown', () => {
        pressTimer = setTimeout(() => {
            if (audioVolumePopup) {
                audioVolumePopup.classList.add('open');
            }
        }, 500);
    });

    audioStreamBtn.addEventListener('mouseup', () => {
        clearTimeout(pressTimer);
    });

    audioStreamBtn.addEventListener('mouseleave', () => {
        clearTimeout(pressTimer);
    });

    // Volume slider
    if (audioVolumeSlider) {
        audioVolumeSlider.addEventListener('input', (e) => {
            const volume = e.target.value / 100;
            if (audioVolumeValue) {
                audioVolumeValue.textContent = e.target.value + '%';
            }
            socket.emit('set_audio_volume', { volume });
        });
    }

    // Close popup when clicking outside
    document.addEventListener('click', (e) => {
        if (audioVolumePopup && audioVolumePopup.classList.contains('open') &&
            !audioVolumePopup.contains(e.target) &&
            !audioStreamBtn.contains(e.target)) {
            audioVolumePopup.classList.remove('open');
        }
    });
}

/**
 * Setup the music player display bar and button handlers
 */
function setupMusicPlayerDisplay() {
    const npTitle = document.getElementById('np-title');
    const npArtist = document.getElementById('np-artist');
    const npThumbImg = document.getElementById('np-thumb-img');
    const npProgressFill = document.getElementById('np-progress-fill');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const skipBtn = document.getElementById('skip-next-btn');
    const queueBtn = document.getElementById('np-toggle-queue-btn');
    const queuePanel = document.getElementById('np-queue-panel');
    const closeQueueBtn = document.getElementById('np-close-queue-btn');

    // Listen for song updates
    socket.on('song_started', (song) => {
        if (npTitle) npTitle.textContent = song.title || 'Unknown Song';
        if (npArtist) npArtist.textContent = song.artist || 'Unknown Artist';
        if (npThumbImg && song.thumbnail) {
            npThumbImg.src = song.thumbnail;
            npThumbImg.style.display = 'block';
        }
    });

    // Handle current state response (initial load)
    socket.on('current_state', (data) => {
        if (data.current_song) {
            if (npTitle) npTitle.textContent = data.current_song.title || 'Unknown Song';
            if (npArtist) npArtist.textContent = data.current_song.artist || 'Unknown Artist';
            if (npThumbImg && data.current_song.thumbnail) {
                npThumbImg.src = data.current_song.thumbnail;
                npThumbImg.style.display = 'block';
            }
        }
        
        // Update play/pause state
        if (playPauseBtn) {
            if (data.is_playing) {
                playPauseBtn.classList.add('playing');
                playPauseBtn.setAttribute('aria-pressed', 'true');
            } else {
                playPauseBtn.classList.remove('playing');
                playPauseBtn.setAttribute('aria-pressed', 'false');
            }
        }
    });

    socket.on('playback_time_update', (data) => {
        if (npProgressFill && data.duration > 0) {
            const percent = (data.current_time / data.duration) * 100;
            npProgressFill.style.width = Math.min(100, percent) + '%';
        }
    });

    socket.on('playback_state_changed', (data) => {
        if (playPauseBtn) {
            if (data.is_playing) {
                playPauseBtn.classList.add('playing');
                playPauseBtn.setAttribute('aria-pressed', 'true');
            } else {
                playPauseBtn.classList.remove('playing');
                playPauseBtn.setAttribute('aria-pressed', 'false');
            }
        }
    });

    socket.on('song_finished', () => {
        if (npTitle) npTitle.textContent = 'No song currently playing';
        if (npArtist) npArtist.textContent = '';
    });

    // Listen for queue updates
    socket.on('queue_updated', (data) => {
        updateQueueDisplay(data.queue || []);
    });

    // Queue button - toggle queue panel
    if (queueBtn) {
        queueBtn.addEventListener('click', () => {
            if (queuePanel) {
                queuePanel.classList.toggle('open');
                const isOpen = queuePanel.classList.contains('open');
                queueBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
                queuePanel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
                
                // Load queue if opening
                if (isOpen) {
                    socket.emit('request_queue');
                }
            }
        });
    }

    if (closeQueueBtn) {
        closeQueueBtn.addEventListener('click', () => {
            if (queuePanel) {
                queuePanel.classList.remove('open');
                queueBtn.setAttribute('aria-expanded', 'false');
                queuePanel.setAttribute('aria-hidden', 'true');
            }
        });
    }

    // Play/Pause button
    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', () => {
            socket.emit('toggle_playback', { playing: true });
        });
    }

    // Skip button
    if (skipBtn) {
        skipBtn.addEventListener('click', () => {
            socket.emit('skip_song', { direction: 'next' });
        });
    }

    // Close queue when clicking outside
    if (queuePanel) {
        document.addEventListener('click', (e) => {
            if (queuePanel.classList.contains('open') && 
                !queuePanel.contains(e.target) && 
                !queueBtn.contains(e.target)) {
                queuePanel.classList.remove('open');
                queueBtn.setAttribute('aria-expanded', 'false');
                queuePanel.setAttribute('aria-hidden', 'true');
            }
        });
    }
}

/**
 * Update the queue display panel with queue items
 */
function updateQueueDisplay(queue) {
    const queueList = document.getElementById('np-queue-list');
    const queueCount = document.getElementById('queue-count');
    
    if (!queueList) return;
    
    // Clear the list
    queueList.innerHTML = '';
    
    if (!queue || queue.length === 0) {
        queueList.innerHTML = '<div class="queue-empty">Queue is empty</div>';
        if (queueCount) queueCount.textContent = '0';
        return;
    }
    
    // Add queue items
    queue.forEach((song, index) => {
        const item = document.createElement('div');
        item.className = 'np-queue-item';
        item.innerHTML = `
            <div class="queue-item-index">${index + 1}</div>
            <div class="queue-item-info">
                <div class="queue-item-title">${song.title || 'Unknown'}</div>
                <div class="queue-item-artist">${song.artist || 'Unknown Artist'}</div>
            </div>
        `;
        queueList.appendChild(item);
    });
    
    if (queueCount) queueCount.textContent = queue.length;
}
