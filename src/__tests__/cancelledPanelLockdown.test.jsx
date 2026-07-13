import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockDb = {
  from: vi.fn(() => {
    const filters = {};
    const builder = {
      select: () => builder,
      eq: (col, val) => { filters[col] = val; return builder; },
      order: () => builder,
      insert: vi.fn(async (row) => ({ data: [{ ...row, id: 'x' }], error: null })),
      update: vi.fn(async () => ({ data: [], error: null })),
      then: (resolve) => resolve({ data: [], error: null }),
    };
    return builder;
  }),
};
vi.mock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));

describe('Nested panel lockdown for cancelled tour files: view-only, nothing actionable', () => {
  it('CostSheet: shows the read-only banner and disables its form fields via fieldset', async () => {
    const { CostSheet } = await import('../components/CostSheet.jsx');
    render(<CostSheet query={{ id: 'UTQ-1', groupName: 'Test' }} onClose={()=>{}} onProceedToQuotation={()=>{}} currentUser={{id:'x',name:'Priya'}} readOnly={true}/>);
    expect(screen.getByText(/viewing only, nothing here is editable/)).toBeTruthy();
    const fieldset = document.querySelector('fieldset');
    expect(fieldset).toBeTruthy();
    expect(fieldset.disabled).toBe(true);
  });

  it('CostSheet: when NOT read-only, the fieldset is enabled (no regression)', async () => {
    const { CostSheet } = await import('../components/CostSheet.jsx');
    render(<CostSheet query={{ id: 'UTQ-1', groupName: 'Test' }} onClose={()=>{}} onProceedToQuotation={()=>{}} currentUser={{id:'x',name:'Priya'}} readOnly={false}/>);
    expect(screen.queryByText(/viewing only/)).toBeNull();
    const fieldset = document.querySelector('fieldset');
    expect(fieldset.disabled).toBe(false);
  });

  it('QuotationGenerator: shows the banner and disables the Content tab fieldset', async () => {
    const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
    const fakeTemplate = { includes: [], excludes: [], monuments: [], showMonuments: true, greeting: '', openingLine: '', closingLine: '', signoff: '', monumentNote: '' };
    render(<QuotationGenerator query={{ id: 'UTQ-1', groupName:'Test' }} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}} readOnly={true}/>);
    expect(screen.getByText(/viewing only, nothing here is editable/)).toBeTruthy();
    const fieldset = document.querySelector('fieldset');
    expect(fieldset.disabled).toBe(true);
  });

  it('QuotationGenerator: the footer Save button is hidden entirely when read-only', async () => {
    const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
    const fakeTemplate = { includes: [], excludes: [], monuments: [], showMonuments: true, greeting: '', openingLine: '', closingLine: '', signoff: '', monumentNote: '' };
    render(<QuotationGenerator query={{ id: 'UTQ-1', groupName:'Test' }} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}} readOnly={true}/>);
    expect(screen.queryByText(/💾 Save v1/)).toBeNull();
  });

  it('EnhancedPaymentTracker: shows the banner and disables its fieldset', async () => {
    const { default: EnhancedPaymentTracker } = await import('../components/EnhancedPaymentTracker.jsx');
    render(<EnhancedPaymentTracker query={{ id: 'UTQ-1' }} payments={{}} onUpdatePayments={()=>{}} onClose={()=>{}} readOnly={true}/>);
    expect(screen.getByText(/viewing only, nothing here is editable/)).toBeTruthy();
    const fieldset = document.querySelector('fieldset');
    expect(fieldset.disabled).toBe(true);
  });

  it('ServicesList: shows the banner, disables status changes, and hides drag/remove affordances', async () => {
    const { ServicesList } = await import('../components/ServicesList.jsx');
    render(<ServicesList query={{ id: 'UTQ-1' }} sec={(l)=><div>{l}</div>} currentUser={{id:'x',name:'Priya'}} readOnly={true}/>);
    await waitFor(() => expect(document.querySelectorAll('select').length).toBeGreaterThan(0));
    expect(screen.getByText(/viewing only, nothing here is editable/)).toBeTruthy();
    expect(screen.queryByText('Drag ⠿ to reorder')).toBeNull();
    const fieldset = document.querySelector('fieldset');
    expect(fieldset.disabled).toBe(true);
    // Rows should not be draggable when read-only
    const row = document.querySelector('div[draggable]');
    expect(row.getAttribute('draggable')).toBe('false');
  });

  it('DocRegistryInline: shows the banner and disables the Log Document button', async () => {
    const { DocRegistryInline } = await import('../components/DocumentRegistry.jsx');
    render(<DocRegistryInline queryId="UTQ-1" tourFileId="TF-1" currentUser={{id:'x',name:'Priya'}} readOnly={true}/>);
    await waitFor(() => expect(screen.getByText('+ Log Document')).toBeTruthy());
    expect(screen.getByText(/viewing only, nothing here is editable/)).toBeTruthy();
    const fieldset = document.querySelector('fieldset');
    expect(fieldset.disabled).toBe(true);
  });

  it('DocRegistryInline: when NOT read-only, no banner and fieldset enabled (no regression)', async () => {
    const { DocRegistryInline } = await import('../components/DocumentRegistry.jsx');
    render(<DocRegistryInline queryId="UTQ-1" tourFileId="TF-1" currentUser={{id:'x',name:'Priya'}} readOnly={false}/>);
    await waitFor(() => expect(screen.getByText('+ Log Document')).toBeTruthy());
    expect(screen.queryByText(/viewing only/)).toBeNull();
    expect(document.querySelector('fieldset').disabled).toBe(false);
  });
});
