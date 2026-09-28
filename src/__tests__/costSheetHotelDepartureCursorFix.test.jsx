import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchableSelect } from '../lib/helpers.jsx';

// Item 6: "In Cost Sheet: the hotel-name input field and the last day's
// 'Departure' field don't show a cursor when clicked to amend -- clicking
// clears the whole field, forcing a full retype."
//
// Real root cause: SearchableSelect's onFocus reset `query` to "" the
// instant the field was clicked, and its displayed value switches to
// `query` the moment it opens -- so any existing free-text value (a
// hotel not on file, or the last day's "Departure" placeholder, both
// exist via `fallbackDisplay` since neither is a real vendor id) visibly
// vanished on click, before a single key was pressed. Fixed by seeding
// `query` with whatever's currently showing, so a click behaves like an
// ordinary text input: existing text stays, cursor lands where clicked.

const fakeVendors = [
  { id: 'v1', name: 'Test Hotel', type: 'Hotel', city: 'Agra', active: true },
];

function makeMockDb() {
  return {
    from: () => {
      const builder = {
        select: () => builder, eq: () => builder, order: () => builder, is: () => builder,
        then: (resolve) => resolve({ data: [], error: null }),
      };
      return builder;
    },
  };
}

describe('SearchableSelect: focusing a free-text value does not wipe it', () => {
  it('preserves the fallbackDisplay text on focus instead of clearing it', () => {
    render(
      <SearchableSelect
        value=""
        onChange={()=>{}}
        onFreeText={()=>{}}
        options={fakeVendors}
        getValue={v=>v.id}
        getLabel={v=>v.name}
        placeholder="Primary hotel…"
        fallbackDisplay="Departure"
      />
    );
    const input = screen.getByDisplayValue('Departure');
    fireEvent.focus(input);
    // The OLD bug: this would now read "" (value wiped on focus alone).
    expect(input.value).toBe('Departure');
  });

  it('preserves a selected option\'s label on focus instead of clearing it', () => {
    render(
      <SearchableSelect
        value="v1"
        onChange={()=>{}}
        options={fakeVendors}
        getValue={v=>v.id}
        getLabel={v=>v.name}
      />
    );
    const input = screen.getByDisplayValue('Test Hotel');
    fireEvent.focus(input);
    expect(input.value).toBe('Test Hotel');
  });
});

describe('Cost Sheet: the primary hotel field and the last day\'s Departure field keep their text on click', () => {
  it('the primary hotel field (free-text "Departure" on the last day) is not blanked by a focus click', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: makeMockDb(), realtimeClient: null }));
    vi.resetModules();
    const { CostSheet } = await import('../components/CostSheet.jsx');
    render(<CostSheet query={{ id: 'UTQ-1', tourFileId: 'TF-1', nights: 2 }} onClose={()=>{}} onProceedToQuotation={()=>{}} vendors={fakeVendors}/>);
    // The last day's hotel field defaults to the free-text value "Departure".
    const departureInput = screen.getByDisplayValue('Departure');
    fireEvent.focus(departureInput);
    expect(departureInput.value).toBe('Departure');
    vi.doUnmock('../lib/supabase.js');
  });
});
