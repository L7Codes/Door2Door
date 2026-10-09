import { $ } from './dom';

type ActionHandler = (action: string, el: HTMLElement) => void;

let handler: ActionHandler = () => {};
let onClose: (() => void) | null = null;
let toastTimer = 0;

export const sheet = {
  onAction(fn: ActionHandler): void {
    handler = fn;
  },
  show(html: string, closed?: () => void): void {
    const s = $('sheet');
    onClose = closed ?? null;
    s.innerHTML = '<div class="grab" aria-hidden="true"></div>' + html;
    s.hidden = false;
    $('scrim').hidden = false;
    s.scrollTop = 0;
    requestAnimationFrame(() => s.classList.add('open'));
  },
  /** Swap content without replaying the slide-up. */
  swap(html: string): void {
    const s = $('sheet');
    s.innerHTML = '<div class="grab" aria-hidden="true"></div>' + html;
    s.scrollTop = 0;
  },
  /** Tuck the sheet away without ending what it was doing. */
  hideKeep(): void {
    const s = $('sheet');
    s.classList.remove('open');
    s.hidden = true;
    $('scrim').hidden = true;
  },
  showAgain(): void {
    const s = $('sheet');
    s.hidden = false;
    $('scrim').hidden = false;
    requestAnimationFrame(() => s.classList.add('open'));
  },
  close(): void {
    const s = $('sheet');
    s.classList.remove('open');
    s.hidden = true;
    s.innerHTML = '';
    $('scrim').hidden = true;
    const cb = onClose;
    onClose = null;
    cb?.();
  },
  isOpen(): boolean {
    return !$('sheet').hidden;
  }
};

export function initSheet(): void {
  $('sheet').addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (el) handler(el.dataset['a'] ?? '', el);
  });
  $('scrim').addEventListener('click', () => sheet.close());
}

export function toast(text: string, action?: { label: string; run: () => void }, ms = 4500): void {
  const t = $('toast');
  t.innerHTML = '';
  const span = document.createElement('span');
  span.textContent = text;
  t.appendChild(span);
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => {
      t.hidden = true;
      action.run();
    };
    t.appendChild(b);
  }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.hidden = true), ms);
}

export function notice(text: string | null, onTap?: () => void): void {
  const n = $('notice');
  if (!text) {
    n.hidden = true;
    return;
  }
  n.textContent = text;
  n.hidden = false;
  n.onclick = onTap ?? null;
}
