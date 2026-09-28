import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

// Item 3: "quotation text fields are facing the same old problem of
// scrolling up on clicking the cursor." Same root cause as the Cost Sheet
// fix (v1.32.0-era commits f6649cb/dbc9212/5c18a9f, and the dedicated test
// in costSheetTourLeaderSlab.test.jsx): the outer 100vh overlay panel AND
// the inner content fieldset were BOTH independently scrollable
// (overflowY:"auto" on each), so a flex:1 fieldset never actually shrinks
// to fit and scroll itself -- all real scrolling silently lands on the
// outer wrapper instead. The instant a text field is clicked, the browser's
// native "scroll focused element into view" behavior kicks in against that
// unstable outer scroll container, visibly jerking the whole panel upward
// before a single key is even pressed. The fix: only the inner fieldset
// should be a scroll container (minHeight:0 so it actually shrinks and
// scrolls itself, overflowAnchor:"none" so layout shifts don't drag its
// scroll position around), and the outer wrapper drops its own
// overflowY:"auto" entirely (set to "hidden") so it has no scroll position
// of its own to jump.

const fakeQuery = { id: 'UTQ-SCROLL-1', groupName: 'Scroll Fix Test', nights: 5, pax: 10, destination: 'Rajasthan' };
const fakeTemplate = { includes: [], excludes: [], monuments: [], showMonuments: true, greeting: '', openingLine: '', closingLine: '', signoff: '', monumentNote: '' };

function makeDb() {
  return {
    from: vi.fn(() => ({
      select: function () { return this; }, eq: function () { return this; }, order: function () { return this; },
      insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null })),
      update: vi.fn(async () => ({ data: [], error: null })),
      then: (resolve) => resolve({ data: [], error: null }),
    })),
  };
}

describe('QuotationGenerator: scroll anchoring fixed on the "content" tab (mitigates "scrolling up on clicking the cursor")', () => {
  it('the content fieldset has minHeight:0 and overflowAnchor:none -- the actual root cause fix', async () => {
    const db = makeDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} costSheetId={null} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    const fieldset = document.querySelector('fieldset');
    expect(fieldset).toBeTruthy();
    expect(fieldset.style.minHeight).toBe('0px');
    expect(fieldset.style.overflowAnchor).toBe('none');
  });

  it('the outer panel wrapper no longer has its own overflow:auto competing with the fieldset for scroll responsibility', async () => {
    const db = makeDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} costSheetId={null} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    const fieldset = document.querySelector('fieldset');
    const outer = fieldset.closest('div[style*="height: 100vh"]') || Array.from(document.querySelectorAll('div')).find(d => d.style.height === '100vh');
    expect(outer).toBeTruthy();
    expect(outer.style.overflowY).toBe('hidden');
  });

  it('the Final Price tab fieldset also has the fix (a second, separate scroll container in this component)', async () => {
    const db = makeDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
    const { getByText } = render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} costSheetId={null} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(getByText(/Final Price/));
    const fieldset = document.querySelector('fieldset');
    expect(fieldset.style.minHeight).toBe('0px');
    expect(fieldset.style.overflowAnchor).toBe('none');
  });
});
