export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function debounce(fn, wait = 120) {
    let t = null;
    return function(...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
    };
}

export function stageLabelFor(stage) {
    const stageEmoji = {
        'downloading': '⬇️ Downloading audio',
        'buffering': '📦 Preparing next up',
        'downloaded': '✅ Downloaded, in queue',
        'playing': '🎵 Now playing',
        'analyzing': '🔍 Analyzing',
        'generating': '✨ Generating Light Show',
        'saving': '💾 Saving',
        'error': '❌ Error',
        'queued': 'Waiting'
    };
    return stageEmoji[stage] || stage || 'Waiting';
}
