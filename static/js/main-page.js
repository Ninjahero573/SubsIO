// main-page.js — expose initMainTiles to attach behaviors to main tiles
function handleTileClick(e) {
    var btn = e.currentTarget;
    var target = btn.getAttribute('data-target');
    if (!target) return;
    if (window._shellLoadPage && typeof window._shellLoadPage === 'function') {
        window._shellLoadPage(target);
    } else if (target === 'music') {
        window.location.href = '/';
    } else if (target === 'games') {
        window.location.href = '/gamehub';
    }
}

export function initMainTiles() {
    var tiles = document.querySelectorAll('.main-tile');
    tiles.forEach(function (t) {
        t.setAttribute('tabindex', '0');
        // avoid double-binding by removing existing listeners if present
        t.removeEventListener('click', handleTileClick);
        t.addEventListener('click', handleTileClick);
        t.addEventListener('keydown', function (evt) {
            if (evt.key === 'Enter' || evt.key === ' ') {
                evt.preventDefault();
                t.click();
            }
        });
    });
}

// Default export for backward compatibility
export default { initMainTiles };
