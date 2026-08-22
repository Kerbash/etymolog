/**
 * scrollDebug — dev-only instrumentation for the "mouse wheel does not scroll,
 * but dragging the scrollbar thumb does" report.
 *
 * That symptom has exactly two root causes, and this catches both:
 *
 *  1. A **non-passive** `wheel` / `mousewheel` / `touchmove` listener somewhere
 *     that calls `preventDefault()`. Only a non-passive listener can cancel a
 *     scroll; a component that binds "zoom on wheel" to `window`/`document`
 *     instead of to its own element blocks the wheel for the WHOLE page while
 *     leaving the scrollbar thumb (a pointer drag, not a wheel event) working.
 *
 *  2. A nested scroll container under the pointer that is already at its scroll
 *     limit and whose `overscroll-behavior` is not `auto`, so the wheel never
 *     chains up to the document that actually has the overflow.
 *
 * Activate it by opening any page with `?scrollDebug=1`, or run
 * `localStorage.setItem('etymolog:scrollDebug','1')` once and reload. Then open
 * the console and spin the wheel over the area that will not move. It prints:
 *
 *   - every non-passive wheel/touch listener as it is registered, with the
 *     stack that registered it (this is why {@link installScrollDebug} must run
 *     at the very top of `main.tsx`, before React mounts and binds anything);
 *   - a `console.trace()` each time `preventDefault()` hits a wheel event — the
 *     exact handler blocking the scroll;
 *   - on each wheel, the scroll-container chain under the pointer: who owns the
 *     scroll, whether it is maxed out, and whether `overscroll-behavior` is
 *     trapping it.
 *
 * `window.__scrollDebug.report()` dumps the collected listeners on demand;
 * `window.__scrollDebug.chainAt(x, y)` inspects a point without scrolling.
 *
 * The whole module is a no-op unless the flag is set, so it is safe to call
 * unconditionally from the entrypoint.
 */

const FLAG_KEY = 'etymolog:scrollDebug';
const TAG = '[scrollDebug]';
const WHEEL_TYPES = new Set(['wheel', 'mousewheel', 'DOMMouseScroll', 'touchmove']);

/** A reference taken BEFORE we wrap the prototype, for our own listeners. */
const nativeAddEventListener = EventTarget.prototype.addEventListener;

let installed = false;

interface WheelListenerRecord {
    type: string;
    target: string;
    passive: boolean;
    capture: boolean;
    stack: string;
}

interface ChainRow {
    node: string;
    overflowY: string;
    overscrollY: string;
    height: string;
    scrollH: number;
    clientH: number;
    scrollTop: number;
    /** Can this node scroll further DOWN (the common wheel direction)? */
    canScrollDown: boolean;
    /** Owns a scrollbar (overflow auto/scroll AND actually overflowing)? */
    isScroller: boolean;
    /** overscroll-behavior stops the scroll chaining past this node. */
    trapsChaining: boolean;
}

const records: WheelListenerRecord[] = [];

function shouldActivate(): boolean {
    try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('scrollDebug') === '1') return true;
        return window.localStorage.getItem(FLAG_KEY) === '1';
    } catch {
        return false;
    }
}

function describe(target: EventTarget | null): string {
    if (target === window) return 'window';
    if (target instanceof Document) return 'document';
    if (target instanceof HTMLElement) {
        const id = target.id ? `#${target.id}` : '';
        const cls =
            typeof target.className === 'string' && target.className.trim()
                ? '.' + target.className.trim().split(/\s+/).slice(0, 3).join('.')
                : '';
        return `${target.tagName.toLowerCase()}${id}${cls}`;
    }
    if (target instanceof Element) return target.tagName.toLowerCase();
    return String(target);
}

function optionPassive(options: boolean | AddEventListenerOptions | undefined): boolean {
    if (typeof options === 'object' && options) return options.passive === true;
    return false;
}

function optionCapture(options: boolean | AddEventListenerOptions | undefined): boolean {
    if (typeof options === 'boolean') return options;
    if (typeof options === 'object' && options) return options.capture === true;
    return false;
}

/** Wrap addEventListener so every wheel/touch registration is recorded. */
function wrapAddEventListener(): void {
    const original = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (
        this: EventTarget,
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | AddEventListenerOptions,
    ): void {
        if (WHEEL_TYPES.has(type)) {
            const passive = optionPassive(options);
            const record: WheelListenerRecord = {
                type,
                target: describe(this),
                passive,
                capture: optionCapture(options),
                stack: new Error().stack ?? '',
            };
            records.push(record);
            if (!passive) {
                console.warn(
                    `${TAG} non-passive "${type}" on ${record.target} — CAN block wheel scrolling.\n` +
                        record.stack.split('\n').slice(1, 5).join('\n'),
                );
            }
        }
        return original.call(this, type, listener, options);
    } as typeof EventTarget.prototype.addEventListener;
}

/** Trace the exact call site whenever a wheel scroll is cancelled. */
function wrapPreventDefault(): void {
    const original = Event.prototype.preventDefault;
    Event.prototype.preventDefault = function (this: Event): void {
        if (WHEEL_TYPES.has(this.type)) {
            console.warn(`${TAG} preventDefault() on "${this.type}" — wheel scroll blocked by:`);
            console.trace(`${TAG} preventDefault call site`);
        }
        return original.call(this);
    };
}

function rowFor(el: Element): ChainRow {
    const cs = getComputedStyle(el);
    const scrollH = el.scrollHeight;
    const clientH = el.clientHeight;
    const overflows = scrollH > clientH + 1;
    const scrollableOverflow = cs.overflowY === 'auto' || cs.overflowY === 'scroll';
    const isDocScroller = el === document.scrollingElement;
    return {
        node: describe(el),
        overflowY: cs.overflowY,
        overscrollY: cs.overscrollBehaviorY,
        height: cs.height,
        scrollH,
        clientH,
        scrollTop: Math.round(el.scrollTop),
        canScrollDown: overflows && el.scrollTop + clientH < scrollH - 1,
        isScroller: overflows && (scrollableOverflow || isDocScroller),
        trapsChaining:
            overflows &&
            scrollableOverflow &&
            cs.overscrollBehaviorY !== 'auto' &&
            el.scrollTop + clientH >= scrollH - 1,
    };
}

function scrollChain(start: Element | null): ChainRow[] {
    const rows: ChainRow[] = [];
    let el: Element | null = start;
    while (el) {
        rows.push(rowFor(el));
        el = el.parentElement;
    }
    return rows;
}

let lastLog = 0;
function onWheelDiagnostic(event: Event): void {
    const e = event as WheelEvent;
    const now = performance.now();
    if (now - lastLog < 350) return; // throttle — one report per gesture is plenty
    lastLog = now;

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const chain = scrollChain(el);
    const owner = chain.find((r) => r.isScroller);
    const trap = chain.find((r) => r.trapsChaining && !r.canScrollDown);

    console.groupCollapsed(
        `${TAG} wheel Δy=${e.deltaY} over ${el ? describe(el) : 'null'}` +
            (trap ? '  ⚠ TRAPPED' : ''),
    );
    console.log(
        'scrollingElement:',
        document.scrollingElement ? describe(document.scrollingElement) : 'null',
        '| this event defaultPrevented so far:',
        e.defaultPrevented,
    );
    console.log(
        'first scroll owner under pointer:',
        owner ? `${owner.node} (canScrollDown=${owner.canScrollDown})` : 'NONE — wheel should chain to the document',
    );
    if (trap) {
        console.warn(
            `${TAG} ${trap.node} is maxed out and overscroll-behavior-y=${trap.overscrollY} — ` +
                'it is eating the wheel instead of letting it chain to the document.',
        );
    }
    console.table(chain);
    console.groupEnd();
}

interface ScrollDebugApi {
    report(): WheelListenerRecord[];
    chainAt(x: number, y: number): ChainRow[];
    snapshot(): Record<string, unknown>;
}

function snapshot(): Record<string, unknown> {
    const de = document.documentElement;
    const body = document.body;
    return {
        scrollingElement: document.scrollingElement ? describe(document.scrollingElement) : null,
        html: rowFor(de),
        body: rowFor(body),
        windowInnerHeight: window.innerHeight,
        nonPassiveWheelListeners: records.filter((r) => !r.passive).length,
    };
}

/**
 * Install the scroll diagnostics. No-op unless `?scrollDebug=1` or the
 * `etymolog:scrollDebug` localStorage flag is set. Idempotent under
 * React StrictMode's double invocation. Call at the top of `main.tsx`.
 */
export function installScrollDebug(): void {
    if (installed || !shouldActivate()) return;
    installed = true;

    wrapAddEventListener();
    wrapPreventDefault();
    // Registered through the pre-wrap reference so it does not record itself.
    nativeAddEventListener.call(window, 'wheel', onWheelDiagnostic, { passive: true, capture: true });

    const api: ScrollDebugApi = {
        report: () => {
            console.table(
                records.map((r) => ({
                    type: r.type,
                    target: r.target,
                    passive: r.passive,
                    capture: r.capture,
                })),
            );
            return records;
        },
        chainAt: (x, y) => scrollChain(document.elementFromPoint(x, y)),
        snapshot: () => {
            const s = snapshot();
            console.log(TAG, s);
            return s;
        },
    };
    (window as unknown as { __scrollDebug?: ScrollDebugApi }).__scrollDebug = api;

    console.log(
        `${TAG} armed. Spin the wheel over the area that will not scroll. ` +
            'Watch for a red preventDefault trace (a blocker) or a "TRAPPED" wheel report ' +
            '(a nested container eating it). window.__scrollDebug.report() lists wheel listeners.',
    );
    console.log(TAG, snapshot());
}
