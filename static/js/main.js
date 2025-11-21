import { initializeDOMElements } from './dom.js';
import { initializeSocket, setupSocketHandlers } from './socket.js';
import { setupMediaControlHandlers, setupFormHandler, setupSearchHandlers, setupBentoHandlers, setupNowPlayingQueueToggle, setupHeaderHandlers } from './handlers.js';
import { setupAuthHandlers, setupUsernameHandlers } from './auth.js';
import { initNowPlayingExpand, adjustHeaderHeight, adjustNowPlayingHeight } from './ui.js';
import { loadQueue, performSearch } from './actions.js';
import { debounce } from './utils.js';

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
    setupHeaderHandlers();
    setupAuthHandlers();
    initNowPlayingExpand();
    
    console.log('JukeboxLED initialized successfully');
    loadQueue();

    adjustHeaderHeight();
    setTimeout(adjustHeaderHeight, 300);
    adjustNowPlayingHeight();
    setTimeout(adjustNowPlayingHeight, 300);
});

window.addEventListener('resize', debounce(() => { 
    adjustHeaderHeight(); 
    adjustNowPlayingHeight(); 
}, 150));

// Expose for debugging or external calls if needed
window._jukeboxPerformSearch = () => performSearch(true);
