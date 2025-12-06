import { elements } from './dom.js';
import { state } from './state.js';
import * as actions from './actions.js';
import * as ui from './ui.js';
import { showMessage } from './toast.js';
import { escapeHtml } from './utils.js';
import * as audiostream from './audiostream.js';

export function setupMediaControlHandlers() {
    if (elements.playPauseBtn) {
        elements.playPauseBtn.addEventListener('click', () => {
            if (state.currentSong) {
                state.isPlaying = !state.isPlaying;
                ui.updatePlayPauseButton();
                if (state.socket) state.socket.emit('toggle_playback', { playing: state.isPlaying });
            } 
        });
    }
    
    if (elements.skipNextBtn) {
        elements.skipNextBtn.addEventListener('click', () => {
            if (state.socket) state.socket.emit('skip_song', { direction: 'next' });
        });
    }
    
    // Audio stream toggle button
    const audioStreamBtn = document.getElementById('audio-stream-btn');
    if (audioStreamBtn) {
        let longPressTimer = null;
        let isLongPress = false;
        const volumePopup = document.getElementById('audio-volume-popup');
        
        const startLongPress = () => {
            isLongPress = false;
            longPressTimer = setTimeout(() => {
                isLongPress = true;
                if (volumePopup) {
                    volumePopup.classList.add('visible');
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
            if (volumePopup) {
                volumePopup.classList.toggle('visible');
            }
        });
        
        // Desktop mouse events
        audioStreamBtn.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left click only
                startLongPress();
            }
        });
        
        audioStreamBtn.addEventListener('mouseup', () => {
            cancelLongPress();
        });
        
        audioStreamBtn.addEventListener('mouseleave', () => {
            cancelLongPress();
        });
        
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
        
        // Volume slider control
        const volumeSlider = document.getElementById('audio-volume-slider');
        const volumeValue = document.getElementById('audio-volume-value');
        
        if (volumeSlider && volumeValue) {
            volumeSlider.addEventListener('input', (e) => {
                const volume = parseInt(e.target.value);
                volumeValue.textContent = volume + '%';
                audiostream.setAudioVolume(volume / 100);
            });
        }
        
        // Close volume popup when clicking outside
        document.addEventListener('click', (e) => {
            if (volumePopup && 
                !volumePopup.contains(e.target) && 
                !audioStreamBtn.contains(e.target)) {
                volumePopup.classList.remove('visible');
            }
        });
    }
    
    if (elements.playbackSlider) {
        elements.playbackSlider.addEventListener('input', (e) => {
            const value = (e.target.value - elements.playbackSlider.min) / (elements.playbackSlider.max - elements.playbackSlider.min) * 100;
            if (elements.sliderFill) {
                elements.sliderFill.style.width = value + '%';
            }
        });
    }
    
    if (elements.volumeSlider) {
        elements.volumeSlider.addEventListener('change', (e) => {
            const volume = parseFloat(e.target.value) / 100;
            if (state.socket) state.socket.emit('set_volume', { volume: volume });
        });
    }
}

export function setupNowPlayingQueueToggle() {
    if (!elements.npToggleBtn || !elements.npQueuePanel) return;
    elements.npToggleBtn.addEventListener('click', () => {
        const open = elements.npQueuePanel.classList.toggle('open');
        elements.npToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        elements.npQueuePanel.setAttribute('aria-hidden', open ? 'false' : 'true');
        ui.adjustNowPlayingHeight();
        if (open) actions.loadQueue();
    });
    if (elements.npCloseQueueBtn) {
        elements.npCloseQueueBtn.addEventListener('click', () => {
            elements.npQueuePanel.classList.remove('open');
            elements.npToggleBtn.setAttribute('aria-expanded', 'false');
            elements.npQueuePanel.setAttribute('aria-hidden', 'true');
            ui.adjustNowPlayingHeight();
        });
    }
}

export function setupFormHandler() {
    if (!elements.songForm) return;
    
    elements.songForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const raw = (elements.songUrlInput && elements.songUrlInput.value) ? elements.songUrlInput.value.trim() : '';
        const isUrl = /^(https?:\/\/)|(^www\.)|youtube\.com|youtu\.be/i.test(raw);
        const url = isUrl ? raw : '';
        const searchQuery = isUrl ? '' : raw;
        
        if (!url && !searchQuery) {
            showMessage('Please enter a link or a search term', 'error');
            return;
        }

        if (searchQuery) {
            if (elements.linkResultsDiv) elements.linkResultsDiv.innerHTML = '';
            actions.performSearch(true);
        }

        if (url) {
            if (elements.linkResultsDiv) {
                elements.linkResultsDiv.innerHTML = `
                    <div class="search-result">
                        <div class="song-info">
                            <div class="song-title">Link ready to add</div>
                            <div class="song-artist">${escapeHtml(url)}</div>
                        </div>
                        <button class="add-from-link" data-url="${url}">
                            <span>➕</span> Add to Queue
                        </button>
                    </div>
                `;

                const addBtn = elements.linkResultsDiv.querySelector('.add-from-link');
                if (addBtn) {
                    addBtn.addEventListener('click', () => actions.addSong(url, addBtn));
                }
            }
        }
    });
}

export function setupSearchHandlers() {
    if (!elements.searchInput || !elements.searchResultsDiv) return;

    if (elements.searchMoreBtn) {
        elements.searchMoreBtn.addEventListener('click', () => {
            actions.performSearch(false);
        });
    }
}

export function setupBentoHandlers() {
    try {
        const bentoSearch = document.getElementById('bento-search');
        const bentoQueue = document.getElementById('bento-queue');
        const bentoNow = document.getElementById('bento-nowplaying');

        if (bentoSearch && elements.songUrlInput) {
            bentoSearch.addEventListener('click', () => {
                elements.songUrlInput.focus();
                const val = (elements.songUrlInput.value || '').trim();
                const looksLikeUrl = /^(https?:\/\/)|(^www\.)|youtube\.com|youtu\.be/i.test(val);
                if (val && !looksLikeUrl) {
                    actions.performSearch(true);
                }
            });
        }

        // Queue button removed - replaced with games button (navigates via href)

        if (bentoNow) {
            bentoNow.addEventListener('click', () => {
                const bar = document.getElementById('now-playing-bar');
                if (bar) bar.scrollIntoView({ behavior: 'smooth', block: 'end' });
            });
        }
    } catch (e) {}
}

export function setupHeaderHandlers() {
    try {
        const hamburger = document.getElementById('hamburger-btn');
        const siteMenu = document.getElementById('site-menu');
        const siteMenuClose = document.getElementById('site-menu-close');

        function closeSiteMenu() {
            if (!hamburger || !siteMenu) return;
            hamburger.setAttribute('aria-expanded', 'false');
            siteMenu.classList.remove('open');
            siteMenu.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('menu-open');
        }

        function openSiteMenu() {
            if (!hamburger || !siteMenu) return;
            hamburger.setAttribute('aria-expanded', 'true');
            siteMenu.classList.add('open');
            siteMenu.setAttribute('aria-hidden', 'false');
            document.body.classList.add('menu-open');
            // focus first focusable
            const first = siteMenu.querySelector('button, [tabindex]');
            if (first) first.focus();
        }

        if (hamburger) {
            hamburger.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const expanded = hamburger.getAttribute('aria-expanded') === 'true';
                if (expanded) closeSiteMenu(); else openSiteMenu();
            });
        }

        if (siteMenuClose) {
            siteMenuClose.addEventListener('click', (ev) => { ev.stopPropagation(); closeSiteMenu(); });
        }

        // close when clicking outside the menu
        document.addEventListener('click', (ev) => {
            if (!siteMenu) return;
            if (!siteMenu.classList.contains('open')) return;
            const path = ev.composedPath ? ev.composedPath() : (ev.path || []);
            if (path && (path.indexOf(siteMenu) !== -1 || path.indexOf(hamburger) !== -1)) return;
            // otherwise close
            closeSiteMenu();
        });

        // close on Escape
        document.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape' && siteMenu && siteMenu.classList.contains('open')) {
                closeSiteMenu();
            }
        });
    } catch (e) {}
}
