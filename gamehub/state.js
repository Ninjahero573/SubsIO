/**
 * Gamehub State Management
 * Extends the main site's state for games-specific needs
 */

export const state = {
    // Socket connection
    socket: null,
    isConnected: false,
    
    // Playback state
    currentSong: null,
    isPlaying: false,
    currentTime: 0,
    songDuration: 0,
    
    // Audio streaming
    audioElement: null,
    isAudioStreaming: false,
    audioVolume: 0.7,
    isSyncing: false,
    
    // Queue
    queue: [],
    
    // UI state
    isQueueOpen: false,
    isMenuOpen: false,
    
    // Wallet
    walletBalance: 1000.00
};
