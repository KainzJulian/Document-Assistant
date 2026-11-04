/**
 * Dev-only switcher for UI prototypes: one button per variant in a bar fixed at the bottom middle
 * of the viewport, above everything else on the page, overlays and native modals included.
 *
 * Copy this file into the project (for example `src/dev/prototype-switcher.ts`), adapt it to the
 * project's lint rules and mount it only in development builds. It has no dependencies and does
 * not touch the framework: the page keeps its own state and follows `subscribe`.
 */

/** What the switcher needs to know. */
export interface PrototypeSwitcherOptions {
  /** Name of the thing that is prototyped; shown left of the buttons. */
  label?: string;
  /** Query parameter that keeps the choice across reloads (1-based). */
  queryParam?: string;
  /** Variant to start with (0-based); the query parameter wins when it is set. */
  initial?: number;
}

/** The handle `mountPrototypeSwitcher` returns. */
export interface PrototypeSwitcher {
  /** The variant on screen, 0-based. */
  index(): number;
  /** Switch to a variant and tell every subscriber. */
  select(index: number): void;
  /** Call `listener` after every switch; returns the function that stops it. */
  subscribe(listener: (index: number) => void): () => void;
  /** Remove the bar and every listener. */
  destroy(): void;
}

// NOTE: 2147483647 is the largest z-index a browser accepts. It beats every ordinary overlay;
// the popover (top layer) below beats native dialogs and popovers.
const MAX_Z = '2147483647';

const TOP_LAYER = 'dialog,[popover]:not([data-prototype-switcher])';

const HOST_STYLE = [
  'position:fixed',
  'inset:auto auto calc(16px + env(safe-area-inset-bottom)) 50%',
  'transform:translateX(-50%)',
  'margin:0',
  'padding:0',
  'border:0',
  'background:transparent',
  'overflow:visible',
  'width:max-content',
  'height:auto',
  'max-width:calc(100vw - 16px)',
  'pointer-events:none',
  `z-index:${MAX_Z}`,
].join(';');

// The bar looks the same on every page, whatever the project's theme is: dark pill, light text.
const BAR_STYLE = `
  .bar { pointer-events: auto; display: flex; align-items: center; gap: 4px; padding: 4px;
    border-radius: 999px; background: #111; color: #fff;
    box-shadow: 0 4px 16px rgb(0 0 0 / .35), 0 0 0 1px rgb(255 255 255 / .25);
    font: 600 14px/1 system-ui, sans-serif; }
  .label { padding: 0 8px 0 12px; font-weight: 500; opacity: .75; white-space: nowrap;
    max-width: 30vw; overflow: hidden; text-overflow: ellipsis; }
  button { all: unset; box-sizing: border-box; min-width: 44px; height: 44px; padding: 0 12px;
    display: grid; place-items: center; border-radius: 999px; cursor: pointer; }
  button:hover { background: rgb(255 255 255 / .16); }
  button[aria-pressed="true"] { background: #fff; color: #111; }
  button:focus-visible { outline: 2px solid #7cc4ff; outline-offset: 2px; }
`;

/**
 * Show the switcher bar and return its handle.
 * @param variants - One name per variant; the order is the order of the buttons.
 * @param options - Label, query parameter and first variant.
 * @returns The handle to read and change the variant on screen.
 */
export function mountPrototypeSwitcher(
  variants: readonly string[],
  options: PrototypeSwitcherOptions = {},
): PrototypeSwitcher {
  const { label = '', queryParam = 'proto' } = options;
  const listeners = new Set<(index: number) => void>();
  const supportsPopover = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;

  const fromUrl = Number(new URL(location.href).searchParams.get(queryParam)) - 1;
  let current = clamp(Number.isInteger(fromUrl) && fromUrl >= 0 ? fromUrl : (options.initial ?? 0));

  const host = document.createElement('div');
  host.setAttribute('data-prototype-switcher', '');
  host.style.cssText = HOST_STYLE;
  if (supportsPopover) host.setAttribute('popover', 'manual');

  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = BAR_STYLE;
  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', label ? `Prototypes of ${label}` : 'Prototypes');
  if (label) {
    const text = document.createElement('span');
    text.className = 'label';
    text.textContent = label;
    bar.append(text);
  }
  const buttons = variants.map((name, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = String(i + 1);
    button.title = name;
    button.setAttribute('aria-label', `Prototype ${i + 1}: ${name}`);
    button.addEventListener('click', () => select(i));
    bar.append(button);
    return button;
  });
  root.append(style, bar);

  /**
   * Keep an index inside the list of variants.
   * @param index - Any number.
   * @returns A valid 0-based index.
   */
  function clamp(index: number): number {
    return Math.min(Math.max(0, index), Math.max(0, variants.length - 1));
  }

  /** Mark the active button and write the choice to the address. */
  function paint(): void {
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === current)));
    const url = new URL(location.href);
    url.searchParams.set(queryParam, String(current + 1));
    history.replaceState(history.state, '', url);
  }

  /**
   * Switch to a variant.
   * @param index - 0-based variant.
   */
  function select(index: number): void {
    const next = clamp(index);
    if (next === current) return;
    current = next;
    paint();
    listeners.forEach((listener) => listener(current));
  }

  /** Alt + arrow keys step through the variants without the mouse. */
  function onKey(event: KeyboardEvent): void {
    if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    select(current + (event.key === 'ArrowRight' ? 1 : -1));
  }

  // A native modal dialog makes everything outside it inert, so the bar would show above it but
  // not react. While one is open the bar lives inside it; afterwards it goes back to the body.
  // Showing the popover again puts it last in the top layer, which is what puts it on top.
  /** Move the bar to the right parent and show it above whatever is open now. */
  function promote(): void {
    let modal: Element | null = null;
    try {
      modal = document.querySelector('dialog:modal');
    } catch {
      modal = document.querySelector('dialog[open]');
    }
    const parent = modal ?? document.body;
    if (host.parentElement !== parent) parent.append(host);
    if (!supportsPopover) return;
    if (host.matches(':popover-open')) host.hidePopover();
    host.showPopover();
  }

  let queued = false;
  /** Promote once per frame, however many changes arrive. */
  function schedule(): void {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      promote();
    });
  }

  /**
   * Whether a node is, or holds, a dialog or popover other than the bar itself.
   * @param node - What changed.
   * @returns True when it can put something above the bar.
   */
  function isTopLayerNode(node: Node): boolean {
    if (!(node instanceof Element) || node === host || host.contains(node)) return false;
    return node.matches(TOP_LAYER) || node.querySelector(TOP_LAYER) !== null;
  }

  // Only dialogs and popovers matter: an unrelated change must not re-show the bar, because
  // showing it again takes the keyboard focus away from it.
  const observer = new MutationObserver((records) => {
    const relevant = records.some((record) =>
      record.type === 'attributes'
        ? isTopLayerNode(record.target)
        : [...record.addedNodes, ...record.removedNodes].some(isTopLayerNode),
    );
    if (relevant) schedule();
  });
  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['open', 'popover'],
  });
  // Popovers that open without a change of attributes (showPopover) fire this instead.
  const onToggle = (event: Event): void => {
    if (event.target !== host && isTopLayerNode(event.target as Node)) schedule();
  };
  document.addEventListener('toggle', onToggle, true);
  document.addEventListener('keydown', onKey);

  paint();
  promote();

  return {
    index: () => current,
    select,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      observer.disconnect();
      document.removeEventListener('toggle', onToggle, true);
      document.removeEventListener('keydown', onKey);
      listeners.clear();
      host.remove();
    },
  };
}
