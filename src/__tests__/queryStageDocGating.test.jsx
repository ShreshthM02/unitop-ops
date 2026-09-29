import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import QueryDrawerWithQuote from '../components/QueryDrawerWithQuote.jsx';

// Direct request (2026-09-29): Uploads, Editor and Tour Briefing Sheet
// must be available BEFORE a query converts to a Tour File -- only
// Invoices and Exchange Orders (real GST/financial-voucher documents
// tied to a confirmed booking) stay gated by conversion. Previously ALL
// five of these lived in one "caseFileDocs" list, hidden in full for a
// plain query.

vi.mock('../lib/supabase.js', () => ({
  db: {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => ({ then: (res) => res({ data: [], error: null }) }) }) }),
    }),
    drive: { upload: vi.fn(), delete: vi.fn(), renameFolder: vi.fn() },
  },
  realtimeClient: null,
}));

const plainQuery = {
  id: 'QRY-2026-001', tourFileId: null, groupName: 'Test Group', status: 'operations',
  cancelled: false, manualWF: [], audit: [], remarks: [],
};

const tourFileQuery = {
  ...plainQuery, id: 'QRY-2026-001', tourFileId: 'UT-3500',
};

const adminUser = { id: 1, name: 'Priya', role: 'admin' };

const baseProps = {
  onClose:()=>{}, onConvert:()=>{}, onAdvance:()=>{}, onGenerateQuote:()=>{}, onToggleWF:()=>{},
  onCancel:()=>{}, onUpdateRemarks:()=>{}, onUpdateQuery:()=>{}, onRecoverQuery:()=>{}, staff:[],
  currentUser: adminUser,
};

describe('Query-stage (pre-conversion) document gating: only Invoices/Exchange Orders remain gated', () => {
  it('shows Uploads, Editor and Tour Briefing Sheet for a query that has NOT been converted to a Tour File', () => {
    render(<QueryDrawerWithQuote {...baseProps} query={plainQuery}/>);
    fireEvent.click(screen.getByText('📋 Docs'));
    expect(screen.getByText('Uploads')).toBeTruthy();
    expect(screen.getByText('Editor')).toBeTruthy();
    expect(screen.getByText('Tour Briefing Sheet')).toBeTruthy();
  });

  it('still hides Invoices and Exchange Orders for a query that has NOT been converted', () => {
    render(<QueryDrawerWithQuote {...baseProps} query={plainQuery}/>);
    fireEvent.click(screen.getByText('📋 Docs'));
    expect(screen.queryByText('Invoices')).toBeNull();
    expect(screen.queryByText('Exchange Orders')).toBeNull();
    expect(screen.getByText(/Invoices and Exchange Orders become available/)).toBeTruthy();
  });

  it('shows all five (plus Invoices/Exchange Orders) once converted to a Tour File', () => {
    render(<QueryDrawerWithQuote {...baseProps} query={tourFileQuery}/>);
    fireEvent.click(screen.getByText('📋 Docs'));
    ['Uploads', 'Editor', 'Tour Briefing Sheet', 'Invoices', 'Exchange Orders'].forEach(label => {
      expect(screen.getByText(label)).toBeTruthy();
    });
  });

  it('clicking Uploads on a pre-conversion query opens the real Document Registry inline, not a locked/placeholder message', () => {
    render(<QueryDrawerWithQuote {...baseProps} query={plainQuery}/>);
    fireEvent.click(screen.getByText('📋 Docs'));
    fireEvent.click(screen.getByText('Uploads'));
    expect(screen.getByText('Document Registry')).toBeTruthy();
  });
});
