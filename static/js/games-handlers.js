/**
 * Games Page Handlers - Used by shell when displaying games page
 * Handles button clicks and user interactions for games section
 */

import * as audiostream from './audiostream.js';
import { showMessage } from './toast.js';

let gameState = {
    walletBalance: 1000
};

export function setupGamesMenuHandlers() {
    // Menu is handled by shell, nothing needed here
}

export function setupGamesMediaControlHandlers() {
    const queueBtn = document.getElementById('np-toggle-queue-btn');
    const queuePanel = document.getElementById('np-queue-panel');
    const closeQueueBtn = document.getElementById('np-close-queue-btn');

    // Queue button
    if (queueBtn && queuePanel) {
        queueBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            queuePanel.classList.toggle('open');
            const isOpen = queuePanel.classList.contains('open');
            queueBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            queuePanel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
        });
    }

    if (closeQueueBtn && queuePanel) {
        closeQueueBtn.addEventListener('click', () => {
            queuePanel.classList.remove('open');
            queueBtn.setAttribute('aria-expanded', 'false');
            queuePanel.setAttribute('aria-hidden', 'true');
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

export function setupGamesAudioStreamHandlers() {
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
}

export function setupGamesWalletHandlers() {
    const walletBalance = document.getElementById('walletBalance');
    const walletReset = document.getElementById('walletReset');

    function loadWallet() {
        const saved = localStorage.getItem('arcadeWallet');
        if (saved) {
            gameState.walletBalance = parseFloat(saved);
            if (walletBalance) {
                walletBalance.textContent = '$' + gameState.walletBalance.toFixed(2);
            }
        }
    }

    function resetWallet() {
        gameState.walletBalance = 1000;
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
