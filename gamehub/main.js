/**
 * Gamehub Main Entry Point
 * Initializes all modules and sets up the games arcade
 */

import { initializeSocket, setupSocketHandlers } from './socket.js';
import { setupMenuHandlers, setupMediaControlHandlers, setupAudioStreamHandlers, setupWalletHandlers } from './handlers.js';
import { elements } from '../static/js/dom.js';
import * as audiostream from '../static/js/audiostream.js';

function initializeGamehub() {
    // Setup toast notifications container
    elements.messageDiv = document.getElementById('top-notifications');
    
    // Initialize audio state persistence for cross-page navigation
    audiostream.initializeAudioStatePersistence();
    
    // Initialize socket connection
    initializeSocket();
    
    // Setup socket event handlers
    setupSocketHandlers();
    
    // Setup UI handlers
    setupMenuHandlers();
    setupMediaControlHandlers();
    setupAudioStreamHandlers();
    setupWalletHandlers();
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializeGamehub);
