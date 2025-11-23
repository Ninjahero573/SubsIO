import { elements } from './dom.js';
import { escapeHtml, formatDuration, stageLabelFor, debounce } from './utils.js';
import { state } from './state.js';

const panelMap = {
    youtube: {
        playlists: () => elements.ytPlaylistsPanel,
        items: () => elements.ytPlaylistItemsDiv
    },
    spotify: {
        playlists: () => elements.spPlaylistsDiv, // Wait, app.js had spPlaylistsDiv mapped to playlists?
        // In app.js:
        // spotify: { playlists: () => spPlaylistsDiv, items: () => spPlaylistItemsDiv }
        // But spPlaylistsDiv is the container inside the panel?
        // Let's check app.js again.
        // ytPlaylistsPanel is the SECTION. ytPlaylistsDiv is the container.
        // In app.js: youtube: { playlists: () => ytPlaylistsPanel }
        // spotify: { playlists: () => spPlaylistsDiv } -> This looks inconsistent in app.js or I misread.
        // Let's look at app.js:
        // ytPlaylistsPanel = document.getElementById('youtube-playlists-panel');
        // spPlaylistsDiv = document.getElementById('sp-playlists');
        // spPlaylistItemsDiv = document.getElementById('sp-playlist-tracks');
        // panelMap = { youtube: { playlists: () => ytPlaylistsPanel ... } }
        // spotify: { playlists: () => spPlaylistsDiv ... }
        // This means for YouTube it toggles the whole panel, for Spotify it toggles the list container?
        // I'll stick to what app.js had.
        items: () => elements.spPlaylistItemsDiv
    }
};

// Fix panelMap to match app.js exactly but using elements
const getPanelElement = (service, section) => {
    if (service === 'youtube') {
        if (section === 'playlists') return elements.ytPlaylistsPanel;
        if (section === 'items') return elements.ytPlaylistItemsDiv;
    }
    if (service === 'spotify') {
        if (section === 'playlists') return elements.spPlaylistsDiv; // This seems wrong in original code if it's meant to be the panel, but I'll follow it.
        // Actually, looking at index.html, spotify-playlists-panel is the section.
        // app.js: spPlaylistsDiv = document.getElementById('sp-playlists');
        // app.js: setPanelVisibility('spotify','playlists',false);
        // If I want to hide the panel, I should probably target the panel.
        // But I will stick to the original logic to not break it.
        if (section === 'items') return elements.spPlaylistItemsDiv;
    }
    return null;
};

export function setPanelVisibility(service, section, visible, opts = {}) {
    const el = getPanelElement(service, section);
    if (!el) return;
    if (visible) {
        el.style.display = '';
        el.setAttribute('aria-hidden', 'false');
        if (opts.focusFirst) {
            const focusable = el.querySelector('button, [tabindex], a');
            if (focusable) focusable.focus();
        }
    } else {
        el.style.display = 'none';
        el.setAttribute('aria-hidden', 'true');
    }
}

export function updateQueue(data, callbacks = {}) {
    state.currentQueue = data.queue || [];
    if (elements.queueCountSpan) elements.queueCountSpan.textContent = state.currentQueue.length;
    updateNPQueuePanel(state.currentQueue, callbacks);
}

export function updateNowPlaying(song) {
    const bar = document.getElementById('now-playing-bar'); // elements.nowPlayingBar? I didn't add it to dom.js, let's use getElementById or add it.
    // I'll use getElementById for now or rely on elements if I added it. I didn't add 'now-playing-bar' to elements.
    // Let's use the one in elements.nowPlayingDiv which is 'now-playing' (the left part).
    // Wait, app.js has `const bar = document.getElementById('now-playing-bar');` inside updateNowPlaying.
    
    if (!song) {
        if (bar) {
            const titleEl = document.getElementById('np-title');
            const artistEl = document.getElementById('np-artist');
            const thumbImg = document.getElementById('np-thumb-img');
            const progFill = document.getElementById('np-progress-fill');
            if (titleEl) titleEl.textContent = 'No song currently playing';
            if (artistEl) artistEl.textContent = '';
            if (thumbImg) { thumbImg.style.display = 'none'; thumbImg.src = ''; }
            if (progFill) progFill.style.width = '0%';
        } else {
            if (elements.nowPlayingDiv) elements.nowPlayingDiv.innerHTML = `
                <div class="empty-state">
                    <span class="icon">🎵</span>
                    <p>No song currently playing</p>
                </div>
            `;
            if (elements.nowPlayingDiv) elements.nowPlayingDiv.classList.remove('playing');
        }
        if (elements.mediaControlsContainer) {
            elements.mediaControlsContainer.style.display = 'none';
        }
        state.currentSong = null;
        return;
    }

    if (bar) {
        state.currentSong = song;
        state.isPlaying = true;
        const titleEl = document.getElementById('np-title');
        const artistEl = document.getElementById('np-artist');
        const thumbImg = document.getElementById('np-thumb-img');
        const progFill = document.getElementById('np-progress-fill');

        if (titleEl) titleEl.textContent = song.title || 'Unknown';
        if (artistEl) {
            const artistHtml = escapeHtml(song.artist || '');
            const addedByHtml = song.added_by ? ` • <span class="np-added-by-inline">Added by ${escapeHtml(song.added_by)}</span>` : '';
            artistEl.innerHTML = artistHtml + addedByHtml;
        }
        if (thumbImg) {
            if (song.thumbnail) {
                thumbImg.src = song.thumbnail;
                thumbImg.style.display = '';
            } else {
                thumbImg.style.display = 'none';
            }
        }

        let pct = 0;
        if (typeof song.current_time === 'number' && typeof song.duration === 'number' && song.duration > 0) {
            pct = Math.max(0, Math.min(100, (song.current_time / song.duration) * 100));
        } else if (typeof song.progress === 'number' && song.stage !== 'playing') {
            pct = Math.max(0, Math.min(100, song.progress));
        }
        if (progFill) progFill.style.width = pct + '%';

        updatePlayPauseButton();
        return;
    }

    // Fallback
    state.currentSong = song;
    state.songDuration = song.duration;
    state.isPlaying = true;
    
    if (elements.nowPlayingDiv) {
        elements.nowPlayingDiv.innerHTML = `
            <div class="song-card">
                ${song.thumbnail ? `<img src="${song.thumbnail}" alt="${song.title}" class="song-thumbnail">` : ''}
                <div class="song-info">
                    <div class="song-title">${escapeHtml(song.title)}</div>
                    <div class="song-artist">${escapeHtml(song.artist)}</div>
                    <div class="song-meta">
                        Added by ${escapeHtml(song.added_by)} • ${formatDuration(song.duration)}
                    </div>
                </div>
            </div>
        `;
        elements.nowPlayingDiv.classList.add('playing');
    }

    if (elements.mediaControlsContainer) {
        elements.mediaControlsContainer.style.display = 'block';
        if (elements.totalTimeDisplay) elements.totalTimeDisplay.textContent = formatDuration(song.duration);
        if (elements.playbackSlider) elements.playbackSlider.max = song.duration;
    }

    updatePlayPauseButton();
}

export function updatePlayPauseButton() {
    if (!elements.playPauseBtn) return;
    if (state.isPlaying) {
        elements.playPauseBtn.classList.add('playing');
        elements.playPauseBtn.setAttribute('aria-pressed', 'true');
        elements.playPauseBtn.innerHTML = '';
    } else {
        elements.playPauseBtn.classList.remove('playing');
        elements.playPauseBtn.setAttribute('aria-pressed', 'false');
        elements.playPauseBtn.innerHTML = '';
    }
}

export function updateNPQueuePanel(queue, callbacks = {}) {
    if (!elements.npQueueList) return;
    const items = queue || [];
    if (!items.length) {
        elements.npQueueList.innerHTML = `<div class="empty-state"><p>No songs in queue.</p></div>`;
        return;
    }
    elements.npQueueList.innerHTML = items.map((song, i) => {
        const title = escapeHtml(song.title || 'Unknown');
        const artist = escapeHtml(song.artist || '');
        const thumb = song.thumbnail ? `<img src="${song.thumbnail}" class="song-thumbnail">` : '';
        const pos = i + 1;
        const prog = (typeof song.progress === 'number') ? song.progress : 0;
        const stage = song.stage || song.status || 'queued';
        const stageLabel = stageLabelFor(stage);
        return `
            <div class="np-queue-item" data-song-id="${song.id}">
                <div class="np-queue-left">
                    <div class="np-queue-number">${pos}</div>
                    <button class="queue-delete-btn" title="Remove from queue" aria-label="Remove from queue" data-remove-id="${song.id}">🗑</button>
                </div>
                ${thumb}
                <div class="np-qi-info">
                    <div class="np-qi-title">${title}</div>
                    <div class="np-qi-sub">${artist} • ${formatDuration(song.duration || 0)}${song.added_by ? ` • Added by ${escapeHtml(song.added_by)}` : ''}</div>
                    <div class="song-progress" id="np-song-progress-${song.id}" style="display:block;margin-top:6px;">
                        <div class="progress-label">
                            <span class="progress-stage">${escapeHtml(stageLabel)}</span>
                            <span class="progress-percent">${prog}%</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width:${prog}%;"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (callbacks.onDelete) {
        elements.npQueueList.querySelectorAll('.queue-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = btn.getAttribute('data-remove-id');
                if (id) callbacks.onDelete(id, btn);
            });
        });
    }
}

export function adjustHeaderHeight() {
    try {
        const header = document.querySelector('header');
        if (!header) return;
        const rect = header.getBoundingClientRect();
        const h = Math.ceil(rect.height);
        document.documentElement.style.setProperty('--header-height', h + 'px');
    } catch (e) {}
}

export function adjustNowPlayingHeight() {
    try {
        const bar = document.getElementById('now-playing-bar');
        if (!bar) return;
        const h = Math.ceil(bar.getBoundingClientRect().height);
        document.documentElement.style.setProperty('--now-playing-height', h + 'px');
        document.documentElement.style.setProperty('--np-panel-height', '0px');
    } catch (e) {}
}

export function initNowPlayingExpand() {
    const bar = document.getElementById('now-playing-bar');
    if (!bar) return;

    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-expanded', 'false');

    bar.addEventListener('click', (e) => {
        if (e.target.closest('.control-btn') || e.target.closest('button') || e.target.closest('a')) return;
        if (!window.matchMedia('(max-width: 600px)').matches) return;

        if (bar.classList.contains('expanded')) {
            collapseBar(bar);
        } else {
            expandBar(bar);
        }
    });

    window.addEventListener('resize', debounce(() => {
        if (!window.matchMedia('(max-width: 600px)').matches) {
            if (bar.classList.contains('expanded')) {
                bar.classList.remove('expanded');
                bar.style.maxHeight = '';
                bar.setAttribute('aria-expanded', 'false');
                adjustNowPlayingHeight();
            }
        }
    }, 150));
}

function expandBar(bar) {
    bar.classList.add('expanded');
    bar.setAttribute('aria-expanded', 'true');
    bar.style.overflow = 'hidden';

    requestAnimationFrame(() => {
        let target = Math.max(bar.scrollHeight, 160);
        const SAFE_BUFFER = 24;
        target += SAFE_BUFFER;
        document.documentElement.style.setProperty('--now-playing-height', target + 'px');
        bar.style.maxHeight = target + 'px';
        const onEnd = (ev) => {
            if (ev.propertyName === 'max-height') {
                bar.style.maxHeight = 'none';
                bar.style.overflow = '';
                bar.removeEventListener('transitionend', onEnd);
                adjustNowPlayingHeight();
            }
        };
        bar.addEventListener('transitionend', onEnd);
    });
}

function collapseBar(bar) {
    const current = Math.ceil(bar.getBoundingClientRect().height);
    bar.style.maxHeight = current + 'px';
    bar.style.overflow = 'hidden';
    // eslint-disable-next-line no-unused-expressions
    bar.offsetHeight;
    let collapsed = 48;
    try {
        bar.classList.remove('expanded');
        collapsed = Math.ceil(bar.getBoundingClientRect().height) || collapsed;
        bar.classList.add('expanded');
    } catch (e) {
        collapsed = 48;
    }
    requestAnimationFrame(() => {
        bar.style.maxHeight = (collapsed + 8) + 'px';
    });

    const onEnd = (ev) => {
        if (ev.propertyName === 'max-height') {
            bar.classList.remove('expanded');
            bar.style.maxHeight = '';
            bar.style.overflow = '';
            bar.setAttribute('aria-expanded', 'false');
            bar.removeEventListener('transitionend', onEnd);
            document.documentElement.style.setProperty('--now-playing-height', (collapsed + 8) + 'px');
            adjustNowPlayingHeight();
        }
    };
    bar.addEventListener('transitionend', onEnd);
}

export function renderYouTubePlaylists(items, callbacks = {}) {
    if (!elements.ytPlaylistsDiv) return;
    if (!items || !items.length) {
        elements.ytPlaylistsDiv.innerHTML = '<div class="empty-state"><p>No playlists found.</p></div>';
        return;
    }
    elements.ytPlaylistsDiv.innerHTML = items.map(p => {
        const thumb = p.thumbnail || (p.thumbnails && p.thumbnails[0] && p.thumbnails[0].url) || '';
        const title = escapeHtml(p.title || 'Playlist');
        const count = typeof p.count === 'number' ? ` <small>(${p.count})</small>` : '';
        return `
        <div class="yt-playlist" data-playlist-id="${p.id}">
            <button class="yt-playlist-btn" aria-label="${title}">
                ${thumb ? `<img src="${thumb}" alt="${title}" class="yt-playlist-art">` : `<div class="yt-playlist-art placeholder"></div>`}
                <div class="yt-playlist-title">${title}${count}</div>
            </button>
        </div>
        `;
    }).join('');

    if (callbacks.onSelect) {
        elements.ytPlaylistsDiv.querySelectorAll('.yt-playlist-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const el = e.currentTarget.closest('.yt-playlist');
                const pid = el && el.getAttribute('data-playlist-id');
                if (pid) callbacks.onSelect(pid);
            });
            btn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    btn.click();
                }
            });
        });
    }
}

export function renderYouTubePlaylistItems(items, callbacks = {}) {
    if (!elements.ytPlaylistItemsDiv) return;
    if (!items || !items.length) {
        elements.ytPlaylistItemsDiv.innerHTML = '<div class="empty-state"><p>No items in this playlist.</p></div>';
        return;
    }

    elements.ytPlaylistItemsDiv.innerHTML = items.map(it => `
        <div class="yt-playlist-item">
            ${it.thumbnail ? `<img src="${it.thumbnail}" class="song-thumbnail">` : ''}
            <div class="song-info">
                <div class="song-title">${escapeHtml(it.title)}</div>
            </div>
            <div class="actions">
                <button class="add-yt-video" data-video-id="${it.videoId}">Add</button>
            </div>
        </div>
    `).join('');

    if (callbacks.onAdd) {
        elements.ytPlaylistItemsDiv.querySelectorAll('.add-yt-video').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const vid = btn.getAttribute('data-video-id');
                if (vid) callbacks.onAdd(vid, btn);
            });
        });
    }
}

export function renderSpotifyPlaylists(items, callbacks = {}) {
    if (!elements.spPlaylistsDiv) return;
    if (!items || !items.length) {
        elements.spPlaylistsDiv.innerHTML = '<div class="empty-state"><p>No playlists found.</p></div>';
        return;
    }
    elements.spPlaylistsDiv.innerHTML = items.map(p => {
        const thumb = p.thumbnail || '';
        // Spotify server returns `name` for playlists; fall back to `title` if present
        const titleRaw = p.name || p.title || 'Playlist';
        const title = escapeHtml(titleRaw);
        const count = typeof p.count === 'number' ? ` <small>(${p.count})</small>` : '';
        return `
        <div class="yt-playlist" data-playlist-id="${p.id}">
            <button class="yt-playlist-btn" aria-label="${title}">
                ${thumb ? `<img src="${thumb}" alt="${title}" class="yt-playlist-art">` : `<div class="yt-playlist-art placeholder"></div>`}
                <div class="yt-playlist-title">${title}${count}</div>
            </button>
        </div>
        `;
    }).join('');

    if (callbacks.onSelect) {
        elements.spPlaylistsDiv.querySelectorAll('.yt-playlist-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const el = e.currentTarget.closest('.yt-playlist');
                const pid = el && el.getAttribute('data-playlist-id');
                if (pid) callbacks.onSelect(pid);
            });
            btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); } });
        });
    }
}

export function renderSpotifyPlaylistTracks(items, callbacks = {}) {
    if (!elements.spPlaylistItemsDiv) return;
    if (!items || !items.length) {
        elements.spPlaylistItemsDiv.innerHTML = '<div class="empty-state"><p>No items in this playlist.</p></div>';
        return;
    }

    elements.spPlaylistItemsDiv.innerHTML = items.map(it => {
        // Spotify track objects may be provided with `name` instead of `title`.
        const trackTitleRaw = it.title || it.name || '';
        const trackArtists = Array.isArray(it.artists) ? it.artists.join(', ') : (it.artists || '');
        const trackTitle = escapeHtml(trackTitleRaw);
        const trackArtistsEsc = escapeHtml(trackArtists);
        return `
        <div class="yt-playlist-item">
            ${it.thumbnail ? `<img src="${it.thumbnail}" class="song-thumbnail">` : ''}
            <div class="song-info">
                <div class="song-title">${trackTitle}</div>
                <div class="song-artist">${trackArtistsEsc}</div>
            </div>
            <div class="actions">
                <button class="add-sp-track" data-track-id="${it.id}" data-title="${trackTitle}" data-artists="${trackArtistsEsc}">Add</button>
            </div>
        </div>
    `}).join('');

    if (callbacks.onAdd) {
        elements.spPlaylistItemsDiv.querySelectorAll('.add-sp-track').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const title = btn.getAttribute('data-title');
                const artists = btn.getAttribute('data-artists');
                if (title) callbacks.onAdd({ title, artists }, btn);
            });
        });
    }
}

export function renderSearchResults(results, callbacks = {}) {
    if (!elements.searchResultsDiv) return;
    const fragment = results.map(r => `
        <div class="search-result">
            ${r.thumbnail ? `<img src="${r.thumbnail}" alt="${escapeHtml(r.title)}" class="song-thumbnail">` : ''}
            <div class="song-info">
                <div class="song-title">${escapeHtml(r.title)}</div>
                <div class="song-artist">${escapeHtml(r.artist)}</div>
                <div class="song-meta">${formatDuration(r.duration)} • YouTube</div>
            </div>
            <button class="add-from-search" data-url="${r.url}">
                <span>➕</span> Add
            </button>
        </div>
    `).join('');

    elements.searchResultsDiv.insertAdjacentHTML('beforeend', fragment);

    if (callbacks.onAdd) {
        const buttons = elements.searchResultsDiv.querySelectorAll('.add-from-search:not([data-wired])');
        buttons.forEach(btn => {
            btn.setAttribute('data-wired', 'true');
            btn.addEventListener('click', () => {
                const url = btn.getAttribute('data-url');
                if (url) callbacks.onAdd(url, btn);
            });
        });
    }
}

export function startAdding(btn) {
    if (!btn) return false;
    if (btn.dataset.adding === '1') return false;
    btn.dataset.adding = '1';
    try { btn.disabled = true; } catch (e) {}
    btn.classList.add('adding');
    btn.setAttribute('aria-busy', 'true');
    return true;
}

export function finishAdding(btn) {
    if (!btn) return;
    delete btn.dataset.adding;
    try { btn.disabled = false; } catch (e) {}
    btn.classList.remove('adding');
    btn.removeAttribute('aria-busy');
}
