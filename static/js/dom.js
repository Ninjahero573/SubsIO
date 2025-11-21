export const elements = {
    songForm: null,
    songUrlInput: null,
    addedByInput: null,
    messageDiv: null,
    nowPlayingDiv: null,
    queueDiv: null,
    queueCountSpan: null,
    connectionStatus: null,
    connectionIndicator: null,
    indicatorDot: null,
    connectionText: null,
    currentUserSpan: null,
    changeNameBtn: null,
    clearNameBtn: null,
    youtubeLoginBtn: null,
    spotifyLoginBtn: null,
    ytPlaylistsDiv: null,
    ytPlaylistItemsDiv: null,
    ytPlaylistsPanel: null,
    spPlaylistsDiv: null,
    spPlaylistItemsDiv: null,
    searchInput: null,
    searchStatus: null,
    searchResultsDiv: null,
    linkResultsDiv: null,
    searchMoreBtn: null,
    mediaControlsContainer: null,
    playPauseBtn: null,
    skipNextBtn: null,
    playbackSlider: null,
    sliderFill: null,
    currentTimeDisplay: null,
    totalTimeDisplay: null,
    volumeSlider: null,
    npToggleBtn: null,
    npQueuePanel: null,
    npQueueList: null,
    npCloseQueueBtn: null,
    hamburgerBtn: null,
    ledStrips: []
};

export function initializeDOMElements() {
    elements.songForm = document.getElementById('add-song-form');
    elements.songUrlInput = document.getElementById('song-or-search');
    elements.addedByInput = document.getElementById('added-by');
    elements.messageDiv = document.getElementById('top-notifications');
    elements.nowPlayingDiv = document.getElementById('now-playing');
    elements.queueDiv = document.getElementById('queue');
    elements.queueCountSpan = document.getElementById('queue-count');
    elements.connectionStatus = document.getElementById('connection-status');
    elements.connectionIndicator = document.getElementById('connection-indicator');
    elements.indicatorDot = elements.connectionIndicator ? elements.connectionIndicator.querySelector('.indicator-dot') : null;
    elements.connectionText = document.getElementById('connection-text');
    elements.currentUserSpan = document.getElementById('current-user');
    elements.changeNameBtn = document.getElementById('change-name-btn');
    elements.clearNameBtn = document.getElementById('clear-name-btn');
    elements.youtubeLoginBtn = document.getElementById('youtube-login-btn');
    elements.spotifyLoginBtn = document.getElementById('spotify-login-btn');
    elements.ytPlaylistsDiv = document.getElementById('yt-playlists');
    elements.ytPlaylistItemsDiv = document.getElementById('yt-playlist-items');
    elements.ytPlaylistsPanel = document.getElementById('youtube-playlists-panel');
    elements.spPlaylistsDiv = document.getElementById('sp-playlists');
    elements.spPlaylistItemsDiv = document.getElementById('sp-playlist-tracks');
    
    elements.searchInput = elements.songUrlInput;
    elements.searchStatus = document.getElementById('search-status');
    elements.searchResultsDiv = document.getElementById('search-results');
    elements.linkResultsDiv = document.getElementById('link-results');
    elements.searchMoreBtn = document.getElementById('search-more-btn');
    
    elements.mediaControlsContainer = document.getElementById('media-controls-container');
    elements.playPauseBtn = document.getElementById('play-pause-btn');
    elements.skipNextBtn = document.getElementById('skip-next-btn');
    elements.playbackSlider = document.getElementById('playback-slider');
    elements.sliderFill = document.querySelector('.slider-fill');
    elements.currentTimeDisplay = document.getElementById('current-time');
    elements.totalTimeDisplay = document.getElementById('total-time');
    elements.volumeSlider = document.getElementById('volume-slider');
    elements.npToggleBtn = document.getElementById('np-toggle-queue-btn');
    elements.npQueuePanel = document.getElementById('np-queue-panel');
    elements.npQueueList = document.getElementById('np-queue-list');
    elements.npCloseQueueBtn = document.getElementById('np-close-queue-btn');
    elements.hamburgerBtn = document.getElementById('hamburger-btn');

    for (let i = 0; i < 4; i++) {
        elements.ledStrips.push(document.getElementById(`led-strip-${i}`));
    }

    if (!elements.songForm) {
        console.error('Could not find form elements');
        return false;
    }

    try {
        if (elements.connectionIndicator) {
            if (elements.connectionIndicator.classList.contains('connecting') || elements.connectionIndicator.classList.contains('disconnected')) {
                elements.connectionIndicator.setAttribute('aria-disabled', 'true');
            } else {
                elements.connectionIndicator.removeAttribute('aria-disabled');
            }
        }
    } catch (e) {}
    
    return true;
}
