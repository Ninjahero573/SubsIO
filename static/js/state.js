export const state = {
    socket: null,
    currentQueue: [],
    currentSong: null,
    isPlaying: false,
    songDuration: 0,
    currentTime: 0,
    youtubeDisplayName: null,
    spotifyDisplayName: null,
    searchCache: [],
    searchCachePos: 0,
    presencePollInterval: null,
    cachedUserList: [],
    // Audio streaming state
    audioElement: null,
    isAudioStreaming: false,
    audioVolume: 0.7,
    isSyncing: false
};
