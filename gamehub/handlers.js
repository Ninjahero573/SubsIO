/**
 * Gamehub Event Handlers
 * Handles button clicks and user interactions
 */

import { state } from './state.js';
import * as audiostream from '../static/js/audiostream.js';
import { showMessage } from '../static/js/toast.js';

export function setupMenuHandlers() {
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

        document.addEventListener('click', (e) => {
            if (!siteMenu.contains(e.target) && !hamburgerBtn.contains(e.target)) {
                siteMenu.classList.remove('open');
                hamburgerBtn.setAttribute('aria-expanded', 'false');
                siteMenu.setAttribute('aria-hidden', 'true');
            }
        });
    }
}

export function setupMediaControlHandlers() {
    const playPauseBtn = document.getElementById('play-pause-btn');
    const skipBtn = document.getElementById('skip-next-btn');
    const queueBtn = document.getElementById('np-toggle-queue-btn');
    const queuePanel = document.getElementById('np-queue-panel');
    const closeQueueBtn = document.getElementById('np-close-queue-btn');

    // Play/Pause button
    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', () => {
            if (state.socket) {
                state.socket.emit('toggle_playback', { playing: !state.isPlaying });
            }
        });
    }

    // Skip button
    if (skipBtn) {
        skipBtn.addEventListener('click', () => {
            if (state.socket) {
                state.socket.emit('skip_song', { direction: 'next' });
            }
        });
    }

    // Queue button
    if (queueBtn) {
        queueBtn.addEventListener('click', () => {
            if (queuePanel) {
                queuePanel.classList.toggle('open');
                const isOpen = queuePanel.classList.contains('open');
                queueBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
                queuePanel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
                
                if (isOpen && state.socket) {
                    console.log('[Gamehub] Requesting queue...');
                    state.socket.emit('request_queue');
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

export function setupAudioStreamHandlers() {
    const audioStreamBtn = document.getElementById('audio-stream-btn');
    const audioVolumePopup = document.getElementById('audio-volume-popup');
    const audioVolumeSlider = document.getElementById('audio-volume-slider');
    const audioVolumeValue = document.getElementById('audio-volume-value');

    if (!audioStreamBtn) return;

    let longPressTimer = null;
    let isLongPress = false;
    
    const startLongPress = () => {
        isLongPress = false;
        longPressTimer = setTimeout(() => {
            isLongPress = true;
            if (audioVolumePopup) {
                audioVolumePopup.classList.add('open');
            }
        }, 500);
    };
    
    const cancelLongPress = () => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    };

    // Handle click - only toggle if not a long press
    audioStreamBtn.addEventListener('click', (e) => {
        if (!isLongPress) {
            audiostream.toggleAudioStream();
        }
        isLongPress = false;
    });

    // Right-click for volume popup
    audioStreamBtn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (audioVolumePopup) {
            audioVolumePopup.classList.toggle('open');
        }
    });

    // Desktop mouse events
    audioStreamBtn.addEventListener('mousedown', () => {
        startLongPress();
    });

    audioStreamBtn.addEventListener('mouseup', () => cancelLongPress());
    audioStreamBtn.addEventListener('mouseleave', () => cancelLongPress());

    // Mobile touch events
    audioStreamBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startLongPress();
    });

    audioStreamBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        cancelLongPress();
        // Manually trigger click behavior if not a long press
        if (!isLongPress) {
            audiostream.toggleAudioStream();
        }
        isLongPress = false;
    });

    audioStreamBtn.addEventListener('touchcancel', () => {
        cancelLongPress();
        isLongPress = false;
    });

    // Volume slider
    if (audioVolumeSlider) {
        audioVolumeSlider.addEventListener('input', (e) => {
            const volume = e.target.value / 100;
            audiostream.setAudioVolume(volume);
            if (audioVolumeValue) {
                audioVolumeValue.textContent = e.target.value + '%';
            }
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

    // Close popup when tapping outside (mobile)
    document.addEventListener('touchstart', (e) => {
        if (audioVolumePopup && audioVolumePopup.classList.contains('open') &&
            !audioVolumePopup.contains(e.target) &&
            !audioStreamBtn.contains(e.target)) {
            audioVolumePopup.classList.remove('open');
        }
    });
}

export function setupWalletHandlers() {
    const walletBalance = document.getElementById('walletBalance');
    const walletReset = document.getElementById('walletReset');

    function loadWallet() {
        const saved = localStorage.getItem('arcadeWallet');
        if (saved) {
            state.walletBalance = parseFloat(saved);
            if (walletBalance) {
                walletBalance.textContent = '$' + state.walletBalance.toFixed(2);
            }
        }
    }

    function resetWallet() {
        state.walletBalance = 1000;
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
}
