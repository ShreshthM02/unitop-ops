import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const fakeQuery = { id: 'UTQ-2026-2000', groupName: 'Pagination Test Group' };

function makeDb() {
  return {
    from: vi.fn(() => {
      const builder = {
        select: () => builder, eq: () => builder, order: () => builder,
        insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'x' }], error: null })),
        update: vi.fn(async () => ({ data: [], error: null })),
        then: (resolve) => resolve({ data: [], error: null }),
      };
      return builder;
    }),
  };
}

describe('MealPlanDocument: migrated to the new async, paginated print builder', () => {
  it('the preview tab loads the async paginated HTML into an iframe without crashing', async () => {
    const db = makeDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: MealPlanDocument } = await import('../components/MealPlanDocument.jsx');
    render(<MealPlanDocument query={fakeQuery} template={{}} onClose={()=>{}} currentUser={{id:'x'}}/>);
    fireEvent.click(screen.getByText('👁 Preview'));
    // The iframe should eventually receive real HTML content (not empty,
    // not a stringified Promise) once the async builder resolves.
    await waitFor(() => {
      const iframe = document.querySelector('iframe[title="doc-preview"]');
      expect(iframe).toBeTruthy();
      expect(iframe.srcdoc).toContain('Meal Plan');
      expect(iframe.srcdoc).not.toContain('[object Promise]');
    });
  });

  it('the toggle bar (now inside the Preview tab, not always visible) shows the single combined "Header + Footer on all pages" toggle, not two separate ones', async () => {
    const db = makeDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: MealPlanDocument } = await import('../components/MealPlanDocument.jsx');
    render(<MealPlanDocument query={fakeQuery} template={{}} onClose={()=>{}} currentUser={{id:'x'}}/>);
    fireEvent.click(screen.getByText('👁 Preview'));
    expect(screen.getByText('Header + Footer on all pages')).toBeTruthy();
    expect(screen.queryByText('Header on all pages')).toBeNull();
    expect(screen.queryByText('Footer on all pages')).toBeNull();
  });

  it('clicking Print/PDF does not throw even though the builder is now async', async () => {
    const db = makeDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: MealPlanDocument } = await import('../components/MealPlanDocument.jsx');
    const originalOpen = window.open;
    window.open = vi.fn(() => ({ document: { write: vi.fn(), close: vi.fn(), readyState: 'complete' }, print: vi.fn() }));
    render(<MealPlanDocument query={fakeQuery} template={{}} onClose={()=>{}} currentUser={{id:'x'}}/>);
    // Print now lives inside the shared ExportMenu dropdown.
    fireEvent.click(screen.getByText('\u2b07 Export \u25be'));
    expect(() => fireEvent.click(screen.getByText('📕 PDF'))).not.toThrow();
    await waitFor(() => expect(window.open).toHaveBeenCalled());
    window.open = originalOpen;
  });
});

describe('MealPlanDocument: table-splitting wiring (real component, confirms the row data reaches the new splittable table block correctly)', () => {
  it('the printed output contains a real table with the actual row data, not a stringified [object Object]', async () => {
    const db = makeDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: MealPlanDocument } = await import('../components/MealPlanDocument.jsx');
    render(<MealPlanDocument query={fakeQuery} template={{}} onClose={()=>{}} currentUser={{id:'x'}}/>);
    fireEvent.click(screen.getByText('👁 Preview'));
    await waitFor(() => {
      const iframe = document.querySelector('iframe[title="doc-preview"]');
      expect(iframe.srcdoc).toContain('<thead>');
      expect(iframe.srcdoc).toContain('Itinerary / Movement');
      expect(iframe.srcdoc).not.toContain('[object Object]');
    });
  });
});
