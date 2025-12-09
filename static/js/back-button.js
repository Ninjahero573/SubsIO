/**
 * back-button.js - Manages the back button visibility for gamehub pages
 * Shows/hides the back button based on the current page in the SPA
 */

export function initBackButton() {
    createBackBtn();
}

export function updateBackBtn(currentPage) {
    const btn = document.getElementById('back-btn') || createBackBtn();
    if (!btn) return;
    
    // Show back button on games and music pages
    if (currentPage === 'games' || currentPage === 'music') {
        btn.style.display = 'inline-flex';
        btn.setAttribute('aria-hidden', 'false');
        btn.title = 'Back';
        btn.setAttribute('aria-label', 'Back');
    } else {
        btn.style.display = 'none';
        btn.setAttribute('aria-hidden', 'true');
    }
}

function createBackBtn() {
    const existing = document.getElementById('back-btn');
    if (existing) return existing;
    
    const headerLeft = document.querySelector('.header-left');
    if (!headerLeft) return null;
    
    const btn = document.createElement('button');
    btn.id = 'back-btn';
    btn.className = 'back-btn';
    btn.setAttribute('aria-label', 'Back');
    btn.title = 'Back';
    btn.style.display = 'none';
    btn.type = 'button';
    
    // Use SVG icon
    btn.innerHTML = '<img src="/static/icons/back-arrow.svg" alt="Back" />';
    
    btn.onclick = handleBackClick;
    
    headerLeft.appendChild(btn);
    return btn;
}

function handleBackClick(e) {
    e.preventDefault();
    e.stopPropagation();
    console.log('[BackButton] Back button clicked');
    // In SPA, navigate to main page via the exposed shell function
    if (window._shellLoadPage && typeof window._shellLoadPage === 'function') {
        console.log('[BackButton] Calling _shellLoadPage("main")');
        window._shellLoadPage('main');
    } else {
        console.log('[BackButton] _shellLoadPage not available, navigating to /');
        window.location.href = '/';
    }
}
