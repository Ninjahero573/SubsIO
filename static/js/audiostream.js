import { state } from './state.js';
import { showMessage } from './toast.js';

/**
 * Persist audio stream state to sessionStorage so it survives page navigation
 */
function persistAudioState() {
    if (state.audioElement && state.isAudioStreaming) {
        sessionStorage.setItem('audioStreamState', JSON.stringify({
            isStreaming: true,
            currentTime: state.audioElement.currentTime || 0,
            timestamp: Date.now()
        }));
    }
}

/**
 * Restore audio stream state from sessionStorage
 */
function restoreAudioState() {
    const saved = sessionStorage.getItem('audioStreamState');
    if (!saved) return null;
    
    try {
        const state_data = JSON.parse(saved);
        // Only restore if saved recently (within 5 minutes) and streaming was active
        if (state_data.isStreaming && (Date.now() - state_data.timestamp) < 300000) {
            return state_data;
        }
    } catch (e) {
        console.error('Failed to restore audio state:', e);
    }
    return null;
}

/**
 * Start streaming audio from the server
 */
export function startAudioStream(silent = false) {
    if (!state.currentSong || !state.currentSong.id) {
        if (!silent) {
            showMessage('No song is currently playing', 'error');
        }
        return false;
    }

    try {
        // Create audio element if it doesn't exist
        if (!state.audioElement) {
            state.audioElement = new Audio();
            state.audioElement.volume = state.audioVolume;
            state.audioElement.preload = 'auto';
            
            // Add event listeners only once
            state.audioElement.addEventListener('error', (e) => {
                if (!state.isAudioStreaming) return; // Ignore errors if not streaming
                
                const error = e.target.error;
                console.error('Audio error event:', {
                    code: error?.code,
                    message: error?.message,
                    src: e.target.src,
                    networkState: e.target.networkState,
                    readyState: e.target.readyState
                });
                
                // Only show error if it's a real problem (not just song ending)
                if (error) {
                    if (error.code === MediaError.MEDIA_ERR_ABORTED) {
                        console.log('Playback aborted (normal)');
                    } else if (error.code === MediaError.MEDIA_ERR_NETWORK) {
                        showMessage('Network error loading audio', 'error');
                        cleanupAudioStream();
                    } else if (error.code === MediaError.MEDIA_ERR_DECODE) {
                        showMessage('Audio decode error', 'error');
                        cleanupAudioStream();
                    } else if (error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
                        showMessage('Audio file not found or not supported', 'error');
                        cleanupAudioStream();
                    }
                }
            });

            state.audioElement.addEventListener('loadstart', () => {
                console.log('Audio load started');
            });

            state.audioElement.addEventListener('loadedmetadata', () => {
                console.log('Audio metadata loaded, duration:', state.audioElement.duration);
            });

            state.audioElement.addEventListener('canplay', () => {
                console.log('Audio ready to play');
            });

            state.audioElement.addEventListener('waiting', () => {
                console.log('Audio buffering...');
            });

            state.audioElement.addEventListener('playing', () => {
                console.log('Audio playing');
            });

            state.audioElement.addEventListener('ended', () => {
                console.log('Audio ended');
            });
        }

        // Set audio source to the current song
        const audioUrl = `/api/audio/${state.currentSong.id}`;
        console.log('Loading audio from:', audioUrl);
        console.log('Current song:', state.currentSong);
        
        // Check if the song has been downloaded (check status)
        if (state.currentSong.status && state.currentSong.status !== 'playing' && state.currentSong.status !== 'ready') {
            console.log('Song not ready yet, status:', state.currentSong.status);
            if (!silent) {
                showMessage('Song is still downloading, please wait...', 'info');
            }
            return false;
        }
        
        // Set the source and try to play
        // The error handler will catch if the file doesn't exist
        state.audioElement.src = audioUrl;
        
        // Sync with current playback position after a short delay
        const seekTime = state.currentTime;
        if (seekTime > 0 && seekTime < (state.songDuration || Infinity)) {
            console.log('Will seek to position:', seekTime);
            // Wait for metadata to load before seeking
            const seekWhenReady = () => {
                if (state.audioElement.readyState >= 2) {
                    state.audioElement.currentTime = seekTime;
                    console.log('Seeked to:', seekTime);
                } else {
                    state.audioElement.addEventListener('loadedmetadata', () => {
                        state.audioElement.currentTime = seekTime;
                        console.log('Seeked to:', seekTime);
                    }, { once: true });
                }
            };
            seekWhenReady();
        }

        // Play the audio
        const playPromise = state.audioElement.play();
        
        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    const wasStreaming = state.isAudioStreaming;
                    state.isAudioStreaming = true;
                    updateAudioStreamButton(true);
                    persistAudioState();
                    
                    // Only show message if this is a new stream, not a song change
                    if (!silent && !wasStreaming) {
                        showMessage('Joined audio stream 🔊', 'success');
                    }
                    console.log('Audio streaming started');
                })
                .catch((error) => {
                    console.error('Playback failed:', error.name, error.message);
                    
                    // Handle different error types
                    if (error.name === 'NotAllowedError') {
                        if (!silent) {
                            showMessage('Click the speaker button to start audio', 'info');
                        }
                        console.log('Autoplay blocked - user interaction required');
                    } else if (error.name === 'NotSupportedError') {
                        if (!silent) {
                            showMessage('Audio format not supported', 'error');
                        }
                    } else if (!silent) {
                        showMessage('Could not start audio: ' + error.name, 'error');
                    }
                    
                    state.isAudioStreaming = false;
                    updateAudioStreamButton(false);
                });
        } else {
            // play() returned undefined - old browser?
            state.isAudioStreaming = true;
            updateAudioStreamButton(true);
            persistAudioState();
            if (!silent) {
                showMessage('Joined audio stream 🔊', 'success');
            }
        }

        return true;
    } catch (error) {
        console.error('Error starting audio stream:', error);
        if (!silent) {
            showMessage('Failed to start audio stream', 'error');
        }
        return false;
    }
}

/**
 * Clean up audio stream without user message
 */
function cleanupAudioStream() {
    if (state.audioElement) {
        state.audioElement.pause();
        state.audioElement.currentTime = 0;
    }
    
    state.isAudioStreaming = false;
    updateAudioStreamButton(false);
    console.log('Audio streaming cleaned up');
}

/**
 * Stop streaming audio (user-initiated)
 */
export function stopAudioStream() {
    if (!state.isAudioStreaming) return; // Already stopped
    
    if (state.audioElement) {
        state.audioElement.pause();
        state.audioElement.currentTime = 0;
    }
    
    state.isAudioStreaming = false;
    updateAudioStreamButton(false);
    sessionStorage.removeItem('audioStreamState');
    showMessage('Left audio stream 🔇', 'success');
    console.log('Audio streaming stopped');
}

/**
 * Toggle audio streaming on/off
 */
export function toggleAudioStream() {
    if (state.isAudioStreaming) {
        stopAudioStream();
    } else {
        startAudioStream();
    }
}

/**
 * Attempt to resume audio streaming after page navigation
 * Call this on page load to restore audio if it was playing
 */
export function attemptResumeAudioStream() {
    const savedState = restoreAudioState();
    if (!savedState) return;
    
    // Give a moment for socket state to sync, then attempt to resume
    setTimeout(() => {
        if (state.currentSong && state.currentSong.id) {
            console.log('Resuming audio stream from page navigation');
            startAudioStream(true); // silent=true to avoid duplicate messages
        }
    }, 500);
}

/**
 * Periodically persist audio state while streaming
 */
export function initializeAudioStatePersistence() {
    // Save audio position every 2 seconds while streaming
    setInterval(() => {
        if (state.isAudioStreaming && state.audioElement) {
            persistAudioState();
        }
    }, 2000);
}

/**
 * Sync browser audio with server playback position
 */
export function syncAudioPosition(serverTime, duration) {
    if (!state.isAudioStreaming || !state.audioElement) {
        return;
    }

    // Avoid sync loops
    if (state.isSyncing) {
        return;
    }

    // Don't sync if audio isn't loaded yet
    if (state.audioElement.readyState < 2) {
        return;
    }

    const localTime = state.audioElement.currentTime;
    const timeDiff = Math.abs(localTime - serverTime);

    // Only sync if difference is significant (more than 1 second to avoid glitches)
    if (timeDiff > 1.0) {
        state.isSyncing = true;
        console.log(`Syncing audio: local=${localTime.toFixed(2)}s, server=${serverTime.toFixed(2)}s, diff=${timeDiff.toFixed(2)}s`);
        
        try {
            state.audioElement.currentTime = serverTime;
        } catch (e) {
            console.error('Failed to sync audio position:', e);
        }
        
        // Release sync lock after a short delay
        setTimeout(() => {
            state.isSyncing = false;
        }, 200);
    }
}

/**
 * Handle when a new song starts
 */
export function handleSongStarted(song) {
    if (state.isAudioStreaming && song && song.id) {
        console.log('New song started, switching audio stream:', song.title);
        
        // Update current song
        state.currentSong = song;
        
        // Stop current audio without showing message
        if (state.audioElement) {
            state.audioElement.pause();
            state.audioElement.currentTime = 0;
        }
        
        // Start new song after a brief delay to let server start
        // Use silent=true to avoid showing "Joined audio stream" for song changes
        setTimeout(() => {
            if (state.isAudioStreaming) { // Check if still streaming
                startAudioStream(true);
            }
        }, 300);
    } else if (song && song.id) {
        // Not streaming, but update current song for UI
        state.currentSong = song;
    }
}

/**
 * Handle when song finishes
 */
export function handleSongFinished() {
    if (state.isAudioStreaming && state.audioElement) {
        console.log('Song finished');
        // Just pause, don't stop streaming - wait for next song
        state.audioElement.pause();
        state.audioElement.currentTime = 0;
    }
}

/**
 * Handle playback state changes (play/pause)
 */
export function handlePlaybackStateChanged(isPlaying) {
    if (!state.isAudioStreaming || !state.audioElement) {
        return;
    }

    console.log('Playback state changed:', isPlaying ? 'playing' : 'paused');

    if (isPlaying) {
        // Only play if we have a valid source
        if (state.audioElement.src && state.audioElement.readyState >= 2) {
            state.audioElement.play().catch(err => {
                console.error('Failed to resume audio:', err);
            });
        }
    } else {
        state.audioElement.pause();
    }
}

/**
 * Set audio volume
 */
export function setAudioVolume(volume) {
    // Clamp volume between 0 and 1
    const clampedVolume = Math.max(0, Math.min(1, volume));
    state.audioVolume = clampedVolume;
    
    if (state.audioElement) {
        state.audioElement.volume = clampedVolume;
    }
    
    console.log(`Audio volume set to ${Math.round(clampedVolume * 100)}%`);
}

/**
 * Update the audio stream button UI
 */
function updateAudioStreamButton(isStreaming) {
    const btn = document.getElementById('audio-stream-btn');
    if (!btn) return;

    if (isStreaming) {
        btn.textContent = '🔊';
        btn.title = 'Leave audio stream';
        btn.setAttribute('aria-pressed', 'true');
        btn.classList.add('active');
    } else {
        btn.textContent = '🔇';
        btn.title = 'Join audio stream';
        btn.setAttribute('aria-pressed', 'false');
        btn.classList.remove('active');
    }
}
