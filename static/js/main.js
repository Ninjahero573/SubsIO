import { initializeDOMElements } from './dom.js';
import { initializeSocket, setupSocketHandlers } from './socket.js';
import { setupMediaControlHandlers, setupFormHandler, setupSearchHandlers, setupBentoHandlers, setupNowPlayingQueueToggle, setupHeaderHandlers } from './handlers.js';
import { setupAuthHandlers, setupUsernameHandlers } from './auth.js';
import { initNowPlayingExpand, adjustHeaderHeight, adjustNowPlayingHeight } from './ui.js';
import { loadQueue, performSearch } from './actions.js';
import { debounce } from './utils.js';
import * as audiostream from './audiostream.js';

function adjustPlaylistBoxMaxHeights() {
    try {
        const selectors = [
            '.bento-card .yt-playlists',
            '.bento-card .yt-playlist-items',
            '.bento-card .sp-playlists',
            '.bento-card .sp-playlist-tracks'
        ];
        selectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                // compute width to constrain height to the same value
                const w = Math.round(el.getBoundingClientRect().width);
                if (w && w > 0) {
                    // Choose a multiplier depending on screen width so the "max-height == width"
                    // behavior can be tuned per breakpoint. On large screens we use 1 (square),
                    // on medium we allow slightly less height, and on small screens we reduce further.
                    let mult = 1.0;
                    const winW = window.innerWidth || document.documentElement.clientWidth || 0;
                    if (winW >= 1200) {
                        mult = 1.0; // desktop: square
                    } else if (winW >= 900) {
                        mult = 1.0; // large tablet / small desktop: square
                    } else if (winW >= 700) {
                        mult = 0.95; // medium: a touch shorter to fit
                    } else if (winW >= 480) {
                        mult = 0.85; // slightly larger than phone
                    } else {
                        mult = 0.7; // small phones: don't force too-tall boxes
                    }
                    const desired = Math.round(w * mult);
                    el.style.setProperty('--box-max-h', desired + 'px');
                } else {
                    el.style.removeProperty('--box-max-h');
                }
            });
        });
        // Note: column-equalization removed — CSS grid now handles matching column heights.
    } catch (e) {
        // ignore
    }
}

// (No mutation observer needed — CSS grid handles dynamic layout)

document.addEventListener('DOMContentLoaded', () => {
    console.log('JukeboxLED - Initializing...');
    
    if (!initializeDOMElements()) {
        console.error('Failed to initialize DOM elements');
        return;
    }
    
    // Initialize audio state persistence for cross-page navigation
    audiostream.initializeAudioStatePersistence();
    
    initializeSocket();
    setupSocketHandlers();
    setupNowPlayingQueueToggle();
    setupMediaControlHandlers();
    setupFormHandler();
    setupUsernameHandlers();
    setupSearchHandlers();
    setupBentoHandlers();
    setupHeaderHandlers();
    setupAuthHandlers();
    initNowPlayingExpand();
    
    console.log('JukeboxLED initialized successfully');
    loadQueue();

    adjustHeaderHeight();
    setTimeout(adjustHeaderHeight, 300);
    adjustNowPlayingHeight();
    setTimeout(adjustNowPlayingHeight, 300);
    // Adjust playlist box max-heights (so max-height == width) after initial layout
    setTimeout(adjustPlaylistBoxMaxHeights, 350);
    // Run again a bit later in case remote data populates after initial paint
    setTimeout(adjustPlaylistBoxMaxHeights, 800);
});

window.addEventListener('resize', debounce(() => { 
    adjustHeaderHeight(); 
    adjustNowPlayingHeight(); 
    adjustPlaylistBoxMaxHeights();
}, 150));

// Expose for debugging or external calls if needed
window._jukeboxPerformSearch = () => performSearch(true);
// Expose playlist height adjuster for debugging / manual trigger
window._jukeboxAdjustPlaylistHeights = () => adjustPlaylistBoxMaxHeights();
