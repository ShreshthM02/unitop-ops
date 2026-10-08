import { describe, it, expect, vi } from 'vitest';
import { waitForPrintReady, printWindowWhenReady } from '../lib/LetterheadControls.jsx';

// A minimal stand-in for the popup window the print helper receives.
function fakeWin({ images = [], readyState = 'complete', fonts } = {}) {
  const listeners = {};
  return {
    document: {
      readyState,
      images,
      querySelectorAll: () => [],
      fonts,
    },
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    fire: (ev) => (listeners[ev] || []).forEach(f => f()),
    getComputedStyle: () => ({ backgroundImage: 'none' }),
    focus: vi.fn(),
    print: vi.fn(),
  };
}
function fakeImg({ complete = false } = {}) {
  const l = {};
  return {
    complete, naturalWidth: complete ? 10 : 0,
    decode: vi.fn(async () => {}),
    addEventListener: (ev, fn) => { (l[ev] = l[ev] || []).push(fn); },
    fire: (ev) => (l[ev] || []).forEach(f => f()),
  };
}

describe('print waits until the page is fully drawn', () => {
  it('does not print while an image is still loading, then prints once it has', async () => {
    const img = fakeImg({ complete: false });
    const win = fakeWin({ images: [img] });
    const p = printWindowWhenReady(win, { settleMs: 0 });
    await new Promise(r => setTimeout(r, 30));
    expect(win.print).not.toHaveBeenCalled();
    img.complete = true; img.naturalWidth = 10; img.fire('load');
    await p;
    expect(win.print).toHaveBeenCalledTimes(1);
    expect(img.decode).toHaveBeenCalled();
  });

  it('waits for web fonts to be ready', async () => {
    let resolveFonts;
    const fonts = { ready: new Promise(r => { resolveFonts = r; }) };
    const win = fakeWin({ fonts });
    const p = printWindowWhenReady(win, { settleMs: 0 });
    await new Promise(r => setTimeout(r, 30));
    expect(win.print).not.toHaveBeenCalled();
    resolveFonts();
    await p;
    expect(win.print).toHaveBeenCalledTimes(1);
  });

  it('waits for the document itself to finish loading', async () => {
    const win = fakeWin({ readyState: 'loading' });
    const p = printWindowWhenReady(win, { settleMs: 0 });
    await new Promise(r => setTimeout(r, 30));
    expect(win.print).not.toHaveBeenCalled();
    win.document.readyState = 'complete';
    win.fire('load');
    await p;
    expect(win.print).toHaveBeenCalledTimes(1);
  });

  it('a broken image does not block printing', async () => {
    const img = fakeImg({ complete: false });
    const win = fakeWin({ images: [img] });
    const p = printWindowWhenReady(win, { settleMs: 0 });
    img.fire('error');
    await p;
    expect(win.print).toHaveBeenCalledTimes(1);
  });

  it('prints anyway after the ceiling if something never settles', async () => {
    const img = fakeImg({ complete: false });
    const win = fakeWin({ images: [img] });
    await printWindowWhenReady(win, { timeoutMs: 50, settleMs: 0 });
    expect(win.print).toHaveBeenCalledTimes(1);
  });

  it('an already-loaded page prints promptly', async () => {
    const win = fakeWin({ images: [fakeImg({ complete: true })] });
    await printWindowWhenReady(win, { settleMs: 0 });
    expect(win.print).toHaveBeenCalledTimes(1);
  });
});
