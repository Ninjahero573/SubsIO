import { elements } from './dom.js';

export function showMessage(text, type='info', opts={}) {
    if (!elements.messageDiv) return;

    const id = `toast-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : ''}`;
    toast.id = id;

    const msg = document.createElement('div');
    msg.className = 'toast-message';
    msg.textContent = text;

    const close = document.createElement('button');
    close.className = 'toast-close';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.innerHTML = '✕';
    close.addEventListener('click', () => {
        dismissToast(toast);
    });

    toast.appendChild(msg);
    toast.appendChild(close);

    elements.messageDiv.insertAdjacentElement('afterbegin', toast);

    const timeout = (opts && opts.timeout) ? opts.timeout : 5000;
    if (!opts.sticky) {
        setTimeout(() => dismissToast(toast), timeout);
    }
}

export function dismissToast(el) {
    if (!el) return;
    el.style.transition = 'opacity 180ms ease, transform 180ms ease';
    el.style.opacity = '0';
    el.style.transform = 'translateY(-6px) scale(0.98)';
    setTimeout(() => { try { el.remove(); } catch(e){} }, 200);
}
