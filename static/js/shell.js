/**
 * Shell.js - Main application shell that persists the now-playing bar and socket connection
 * Handles page navigation without reloading the player
 */

import { elements } from './dom.js';
import { initializeSocket, setupSocketHandlers } from './socket.js';
import { setupMediaControlHandlers, setupFormHandler, setupSearchHandlers, setupBentoHandlers, setupNowPlayingQueueToggle, setupHeaderHandlers } from './handlers.js';
import { setupAuthHandlers, setupUsernameHandlers } from './auth.js';
import { initNowPlayingExpand, adjustHeaderHeight, adjustNowPlayingHeight } from './ui.js';
import { loadQueue, performSearch } from './actions.js';
import { debounce } from './utils.js';
import * as audiostream from './audiostream.js';
import { setupGamesMenuHandlers, setupGamesMediaControlHandlers, setupGamesAudioStreamHandlers, setupGamesWalletHandlers } from './games-handlers.js';
import { initBackButton, updateBackBtn } from './back-button.js';

const pageContainer = document.getElementById('page-container');
let currentPage = 'main';

// Show welcome modal on first visit
function initWelcomeModal() {
    const hasVisited = localStorage.getItem('hasVisitedBefore');
    const welcomeModal = document.getElementById('welcome-modal');
    const welcomeClose = document.getElementById('welcome-close');
    const welcomeStart = document.getElementById('welcome-start');
    
    if (!hasVisited && welcomeModal) {
        // Mark as visited
        localStorage.setItem('hasVisitedBefore', 'true');
        
        // Show modal
        welcomeModal.classList.remove('hidden');
        
        // Close handlers
        const closeWelcome = () => {
            welcomeModal.classList.add('hidden');
        };
        
        if (welcomeClose) welcomeClose.addEventListener('click', closeWelcome);
        if (welcomeStart) welcomeStart.addEventListener('click', closeWelcome);
        
        // Close on backdrop click
        welcomeModal.addEventListener('click', (e) => {
            if (e.target === welcomeModal) closeWelcome();
        });
    } else if (welcomeModal) {
        welcomeModal.classList.add('hidden');
    }
}

// Initialize the shell once on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Shell] DOMContentLoaded event fired');
    console.log('[Shell] page-container element:', document.getElementById('page-container'));
    console.log('[Shell] now-playing-bar element:', document.getElementById('now-playing-bar'));
    
    console.log('[Shell] Initializing application shell...');
    
    // Show welcome modal if first visit
    initWelcomeModal();
    
    // Initialize persistent elements (header, player bar, etc.)
    initializePersistentElements();
    
    // Initialize audio state persistence for cross-page navigation
    audiostream.initializeAudioStatePersistence();
    
    // Initialize socket connection - this persists across page changes
    initializeSocket();
    setupSocketHandlers();
    
    // Setup UI handlers that work on the persistent elements
    setupMediaControlHandlers();
    setupNowPlayingQueueToggle();
    setupHeaderHandlers();
    setupAuthHandlers();
    
    // Initialize now-playing expand
    initNowPlayingExpand();
    
    // Initialize back button for gamehub navigation
    initBackButton();
    
    // Adjust layout
    adjustHeaderHeight();
    adjustNowPlayingHeight();
    
    console.log('[Shell] Application shell initialized');
    
        // Load the page to show after startup. If we were just redirected after an
        // authentication/confirmation flow, the confirmation page sets `authRedirect`.
        // When present (value 'home') we prefer the home page instead of restoring
        // the previously visited page. This ensures sign-in returns the user to
        // the main/home view.
        let lastPage;
        try {
            const forced = localStorage.getItem('authRedirect');
            if (forced === 'home') {
                lastPage = 'main';
                localStorage.removeItem('authRedirect');
            } else {
                lastPage = localStorage.getItem('lastVisitedPage') || 'main';
            }
        } catch (e) {
            lastPage = localStorage.getItem('lastVisitedPage') || 'main';
        }
        console.log('[Shell] About to load page:', lastPage);
        await loadPageContent(lastPage);
    console.log('[Shell] Page content loaded');
    
    // Setup menu navigation
    setupMenuNavigation();
    
    // Setup resize listener
    window.addEventListener('resize', debounce(() => { 
        adjustHeaderHeight(); 
        adjustNowPlayingHeight(); 
    }, 150));
});

function initializePersistentElements() {
    // Initialize only the persistent elements that exist in shell.html
    elements.connectionIndicator = document.getElementById('connection-indicator');
    elements.indicatorDot = elements.connectionIndicator ? elements.connectionIndicator.querySelector('.indicator-dot') : null;
    elements.connectionText = document.getElementById('connection-text');
    elements.messageDiv = document.getElementById('top-notifications');
    elements.npToggleBtn = document.getElementById('np-toggle-queue-btn');
    elements.npQueuePanel = document.getElementById('np-queue-panel');
    elements.npQueueList = document.getElementById('np-queue-list');
    elements.npCloseQueueBtn = document.getElementById('np-close-queue-btn');
    elements.playPauseBtn = document.getElementById('play-pause-btn');
    elements.skipNextBtn = document.getElementById('skip-next-btn');
    elements.hamburgerBtn = document.getElementById('hamburger-btn');
    
    // Setup header title click handler
    const headerTitle = document.getElementById('header-title');
    if (headerTitle) {
        headerTitle.addEventListener('click', handleHeaderClick);
        headerTitle.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleHeaderClick();
            }
        });
    }
    
    console.log('[Shell] Persistent elements initialized');

    // Update menu title with logged-in user's display name when available
    async function updateMenuUser() {
        try {
            const el = document.getElementById('site-menu-title');
            const avatarEl = document.getElementById('menu-avatar');
            const titleEl = document.getElementById('menu-title-text');
            if (!el) return;
            const resp = await fetch('/api/me', { credentials: 'same-origin' });
            if (!resp.ok) {
                if (titleEl) titleEl.textContent = 'Menu';
                if (avatarEl) avatarEl.innerHTML = '';
                return;
            }
            const data = await resp.json().catch(() => ({}));
            const user = data && data.user;
            // Find menu controls so we can show/hide appropriately
            const menuRegister = document.getElementById('menu-register');
            const menuLogin = document.getElementById('menu-login');
            const menuLogout = document.getElementById('menu-logout');

            if (user && (user.display_name || user.email)) {
                const name = user.display_name || user.email;
                if (titleEl) titleEl.textContent = name;
                if (titleEl) titleEl.setAttribute('title', user.email || '');
                if (avatarEl) {
                    avatarEl.style.display = '';
                    avatarEl.innerHTML = '';
                    if (user.avatar_url) {
                        const img = document.createElement('img');
                        img.src = user.avatar_url;
                        img.alt = '';
                        img.className = 'menu-avatar-img';
                        avatarEl.appendChild(img);
                    } else {
                        // Initials fallback
                        const initials = (user.display_name || user.email || 'U').split(' ').map(s => s[0]||'').join('').slice(0,2).toUpperCase();
                        avatarEl.textContent = initials;
                    }
                }
                // Hide register/login and show logout when signed in
                if (menuRegister) menuRegister.style.display = 'none';
                if (menuLogin) menuLogin.style.display = 'none';
                if (menuLogout) menuLogout.style.display = '';
                // Make the header title clickable to open profile
                if (el) {
                    el.style.cursor = 'pointer';
                    el.setAttribute('role', 'button');
                    el.setAttribute('tabindex', '0');
                    el.onclick = async () => {
                        await closeMenu();
                        await loadPageContent('profile');
                    };
                    el.onkeydown = (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            el.onclick();
                        }
                    };
                }
                } else {
                if (titleEl) titleEl.textContent = 'Login / Register';
                if (titleEl) titleEl.setAttribute('title', 'Click to sign in');
                if (avatarEl) {
                    avatarEl.innerHTML = '';
                    avatarEl.style.display = 'none';
                }
                // No user: ensure register/login buttons (if present) stay hidden and hide logout
                if (menuRegister) menuRegister.style.display = 'none';
                if (menuLogin) menuLogin.style.display = 'none';
                if (menuLogout) menuLogout.style.display = 'none';
                // Make the header title clickable to open the combined auth panel
                if (el) {
                    el.style.cursor = 'pointer';
                    el.setAttribute('role', 'button');
                    el.setAttribute('tabindex', '0');
                    el.onclick = async () => {
                        // Open auth partial on login tab by default
                        window._authInitialTab = 'login';
                        await closeMenu();
                        await loadPageContent('login');
                    };
                    el.onkeydown = (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            el.onclick();
                        }
                    };
                }
            }
        } catch (e) {
            // ignore
        }
    }

    // Call once on init to populate menu title
    updateMenuUser();

    // Also refresh when the hamburger button is used
    if (elements.hamburgerBtn) {
        elements.hamburgerBtn.addEventListener('click', () => {
            // small timeout so the menu open animation can begin before fetch
            setTimeout(updateMenuUser, 80);
        });
    }

    // Delegated click handling on the page container to ensure handlers work after dynamic loads
    if (pageContainer) {
        pageContainer.addEventListener('click', async (e) => {
            const tile = e.target.closest && e.target.closest('.main-tile');
            if (tile) {
                const target = tile.getAttribute('data-target');
                if (target) {
                    if (window._shellLoadPage) await window._shellLoadPage(target);
                    return;
                }
            }

            const bentoGames = e.target.closest && e.target.closest('#bento-games');
            if (bentoGames) {
                await loadPageContent('games');
                return;
            }
        }, { capture: false });
    }
    // Keyboard activation for delegated tiles (Enter / Space)
    if (pageContainer) {
        pageContainer.addEventListener('keydown', async (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const tile = e.target.closest && e.target.closest('.main-tile');
            if (tile) {
                e.preventDefault();
                const target = tile.getAttribute('data-target');
                if (target && window._shellLoadPage) {
                    await window._shellLoadPage(target);
                }
            }
        }, { capture: false });
    }
}

async function handleHeaderClick() {
    await closeMenu();
    await loadPageContent('main');
}

function closeMenu() {
    const menu = document.getElementById('site-menu');
    const hamburgerBtn = document.getElementById('hamburger-btn');
    if (menu) {
        menu.classList.remove('open');
        hamburgerBtn.setAttribute('aria-expanded', 'false');
        menu.setAttribute('aria-hidden', 'true');
    }
}

async function loadPageContent(page, gameUrl = null) {
    try {
        console.log(`[Shell] Loading page: ${page}`);
        
        // Handle game loading
        if (page === 'game' && gameUrl) {
            console.log(`[Shell] Loading game: ${gameUrl}`);
            
            const html = await fetch('/static/partials/game-player.html').then(r => r.text());
            pageContainer.innerHTML = html;
            
            // Add game mode class to body
            document.body.classList.add('game-mode');
            
            const gameFrame = document.getElementById('gameFrame');
            if (gameFrame) {
                gameFrame.src = gameUrl;
            }
            
            // Make now-playing bar minimal in game mode
            const nowPlayingBar = document.getElementById('now-playing-bar');
            if (nowPlayingBar) {
                nowPlayingBar.classList.add('minimal');
            }
            
            // Setup exit button
            const exitBtn = document.getElementById('exitGameBtn');
            if (exitBtn) {
                exitBtn.addEventListener('click', async () => {
                    document.body.classList.remove('game-mode');
                    await loadPageContent('games');
                });
            }
            
            currentPage = 'game';
            return;
        }
        
        // Reset now-playing bar styling and remove game mode
        document.body.classList.remove('game-mode');
        const nowPlayingBar = document.getElementById('now-playing-bar');
        if (nowPlayingBar) {
            nowPlayingBar.classList.remove('minimal');
        }
        
        let contentUrl;
        if (page === 'main') {
            contentUrl = '/static/partials/main-page.html';
        } else if (page === 'music') {
            contentUrl = '/static/partials/music-page.html';
        } else if (page === 'register' || page === 'login') {
            // Use a combined auth partial and let it pick the initial tab
            window._authInitialTab = (page === 'register') ? 'register' : 'login';
            contentUrl = '/static/partials/auth.html';
        } else if (page === 'profile') {
            contentUrl = '/static/partials/profile.html';
        } else if (page === 'games') {
            contentUrl = '/static/partials/games-page.html';
        } else {
            console.warn(`[Shell] Unknown page: ${page}`);
            return;
        }
        
        console.log(`[Shell] Fetching from: ${contentUrl}`);
        const response = await fetch(contentUrl);
        console.log(`[Shell] Response status: ${response.status}, ok: ${response.ok}`);
        
        if (!response.ok) {
            throw new Error(`Failed to load ${page} content: ${response.status}`);
        }
        
        const html = await response.text();
        console.log(`[Shell] HTML received, length: ${html.length}`);
        console.log(`[Shell] page-container before insert:`, pageContainer);
        
        pageContainer.innerHTML = html;
        // Execute any inline scripts included in the partial HTML because
        // setting innerHTML doesn't run script tags. Recreate script nodes
        // so their code executes and module scripts load.
        const scripts = Array.from(pageContainer.querySelectorAll('script'));
        for (const oldScript of scripts) {
            const newScript = document.createElement('script');
            // copy attributes
            for (const attr of oldScript.attributes) {
                newScript.setAttribute(attr.name, attr.value);
            }
            // inline script content
            if (oldScript.textContent) newScript.textContent = oldScript.textContent;
            // replace the old script node so the browser will execute it
            oldScript.parentNode.replaceChild(newScript, oldScript);
        }
        currentPage = page;
        
        // Save the current page to localStorage so it persists across refreshes
        localStorage.setItem('lastVisitedPage', page);
        
        console.log(`[Shell] Page content loaded: ${page}`);
        console.log(`[Shell] page-container innerHTML length: ${pageContainer.innerHTML.length}`);
        
        // Update back button visibility based on current page
        updateBackBtn(currentPage);
        
        // Now setup page-specific handlers
        await setupPageHandlers(page);
        
    } catch (error) {
        console.error(`[Shell] Error loading page:`, error);
        pageContainer.innerHTML = `<div style="padding: 20px; color: red;">Error loading page content: ${error.message}</div>`;
    }
}

async function setupPageHandlers(page) {
    if (page === 'main') {
        // Initialize page-specific elements for main page
        elements.songForm = document.getElementById('add-song-form');
        elements.songUrlInput = document.getElementById('song-or-search');
        elements.addedByInput = document.getElementById('added-by');
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
        
        // Setup main page specific handlers
        setupFormHandler();
        setupSearchHandlers();
        setupBentoHandlers();
        setupAuthHandlers();
        setupUsernameHandlers();

        // Load main-page-specific behavior (tiles) dynamically and explicitly initialize
        try {
            const mod = await import('./main-page.js');
            if (mod && typeof mod.initMainTiles === 'function') {
                mod.initMainTiles();
            }
        } catch (err) {
            console.warn('[Shell] Failed to import or init main-page.js', err);
        }
        
        // Setup games button to navigate
        const gamesBtn = document.getElementById('bento-games');
        if (gamesBtn) {
            gamesBtn.addEventListener('click', async () => {
                await loadPageContent('games');
            });
        }
        
        // Request initial queue
        loadQueue();
        
        // Adjust heights after content loads
        setTimeout(() => {
            adjustHeaderHeight();
            adjustNowPlayingHeight();
        }, 100);
        
    } else if (page === 'games') {
        // Setup games page specific handlers
        setupGamesMenuHandlers();
        setupGamesMediaControlHandlers();
        setupGamesAudioStreamHandlers();
        setupGamesWalletHandlers();
        
        // Adjust heights
        setTimeout(() => {
            adjustHeaderHeight();
            adjustNowPlayingHeight();
        }, 100);
    } else if (page === 'music') {
        // Initialize page-specific elements for music page (same IDs as prior main page bento/search)
        elements.songForm = document.getElementById('add-song-form');
        elements.songUrlInput = document.getElementById('song-or-search');
        elements.addedByInput = document.getElementById('added-by');
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

        // Setup music page specific handlers (search, bento actions, auth)
        setupFormHandler();
        setupSearchHandlers();
        setupBentoHandlers();
        setupAuthHandlers();
        setupUsernameHandlers();

        // Setup games button to navigate
        const gamesBtn2 = document.getElementById('bento-games');
        if (gamesBtn2) {
            gamesBtn2.addEventListener('click', async () => {
                await loadPageContent('games');
            });
        }

        // Request initial queue
        loadQueue();

        // Adjust heights after content loads
        setTimeout(() => {
            adjustHeaderHeight();
            adjustNowPlayingHeight();
        }, 100);
    }
}

function setupMenuNavigation() {
    const menu = document.getElementById('site-menu');
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const siteMenuClose = document.getElementById('site-menu-close');
    const menuMain = document.getElementById('menu-main');
    const menuGames = document.getElementById('menu-games');
    
    if (menuMain) {
        menuMain.addEventListener('click', async () => {
            closeMenu();
            if (currentPage !== 'music') {
                await loadPageContent('music');
            }
        });
    }
    
    if (menuGames) {
        menuGames.addEventListener('click', async () => {
            closeMenu();
            if (currentPage !== 'games') {
                await loadPageContent('games');
            }
        });
    }
    
    if (siteMenuClose) {
        siteMenuClose.addEventListener('click', closeMenu);
    }

    // Register / Login / Logout menu handlers
    const menuRegister = document.getElementById('menu-register');
    const menuLogin = document.getElementById('menu-login');
    const menuLogout = document.getElementById('menu-logout');

    if (menuRegister) {
        menuRegister.addEventListener('click', async () => {
            closeMenu();
            if (currentPage !== 'register') {
                await loadPageContent('register');
            }
        });
    }

    if (menuLogin) {
        menuLogin.addEventListener('click', async () => {
            closeMenu();
            if (currentPage !== 'login') {
                await loadPageContent('login');
            }
        });
    }
    
    // Make the menu header (avatar + name) clickable to open Profile when signed in
    const menuTitle = document.getElementById('site-menu-title');
    if (menuTitle) {
        menuTitle.style.cursor = 'pointer';
        menuTitle.addEventListener('click', async () => {
            try {
                // Only navigate to profile when a user is signed in (check api)
                const resp = await fetch('/api/me', { credentials: 'same-origin' });
                if (!resp.ok) return;
                const data = await resp.json().catch(()=>({}));
                if (data && data.user) {
                    closeMenu();
                    if (currentPage !== 'profile') await loadPageContent('profile');
                }
            } catch (e) { /* ignore */ }
        });
    }

    if (menuLogout) {
        menuLogout.addEventListener('click', async () => {
            closeMenu();
            try {
                await fetch('/logout', { method: 'GET', credentials: 'same-origin' });
            } catch (e) {
                console.warn('Logout request failed', e);
            }
            // reload to clear any client state
            window.location.reload();
        });
    }
}

// Expose for debugging
window._shellCurrentPage = () => currentPage;
window._shellLoadPage = (page) => loadPageContent(page);
window._shellLoadGame = (gameUrl) => loadPageContent('game', gameUrl);
