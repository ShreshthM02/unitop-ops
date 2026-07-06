import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GanttView from '../components/GanttView.jsx';
import QueryDrawerWithQuote from '../components/QueryDrawerWithQuote.jsx';

const queries = [
  {
    id: 'UTQ-2026-100', tourFileId: 'TF-2026-100', status: 'operations', cancelled: false,
    travelDate: `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-10`,
    nights: 5, agentCompany: 'Uni Travel', destination: 'Kashmir', pax: 21, assignedTo: 1,
  },
];

describe('Movement Chart: clickable Tour Number', () => {
  it('calls onOpenQuery with the underlying query object when the Tour File cell is clicked', () => {
    const onOpenQuery = vi.fn();
    render(<GanttView queries={queries} tours={[]} onOpenQuery={onOpenQuery}/>);
    fireEvent.click(screen.getByText('📋 Movement Chart'));
    fireEvent.click(screen.getByText('TF-2026-100'));
    expect(onOpenQuery).toHaveBeenCalledTimes(1);
    expect(onOpenQuery.mock.calls[0][0].id).toBe('UTQ-2026-100');
  });

  it('does not crash when onOpenQuery is not passed at all', () => {
    render(<GanttView queries={queries} tours={[]}/>);
    fireEvent.click(screen.getByText('📋 Movement Chart'));
    expect(() => fireEvent.click(screen.getByText('TF-2026-100'))).not.toThrow();
  });
});

describe('QueryDrawerWithQuote: Uploads consolidated into Docs', () => {
  const tourFileQuery = { id: 'UTQ-2026-050', tourFileId: 'TF-2026-050', groupName: 'Test', status: 'operations', manualWF: [], audit: [], remarks: [] };

  it('no longer shows a separate top-level Uploads tab', () => {
    render(<QueryDrawerWithQuote query={tourFileQuery} onClose={()=>{}} onConvert={()=>{}} onAdvance={()=>{}} onGenerateQuote={()=>{}} onToggleWF={()=>{}} onCancel={()=>{}} onUpdateRemarks={()=>{}} currentUser={{id:1,name:'Test'}}/>);
    expect(screen.queryByText('📁 Uploads')).toBeNull();
  });

  it('clicking the Uploads tile inside Docs reveals the document registry inline, without leaving the Docs tab', () => {
    render(<QueryDrawerWithQuote query={tourFileQuery} onClose={()=>{}} onConvert={()=>{}} onAdvance={()=>{}} onGenerateQuote={()=>{}} onToggleWF={()=>{}} onCancel={()=>{}} onUpdateRemarks={()=>{}} currentUser={{id:1,name:'Test'}}/>);
    fireEvent.click(screen.getByText('📋 Docs'));
    expect(screen.queryByText('Document Registry')).toBeNull(); // collapsed by default
    fireEvent.click(screen.getByText('Uploads'));
    expect(screen.getByText('Document Registry')).toBeTruthy(); // now expanded, still in Docs
    expect(screen.getByText('📋 Docs').closest('button').style.color).not.toBe(''); // still on Docs tab (sanity: no crash/tab switch)
  });

  it('clicking Uploads again collapses it', () => {
    render(<QueryDrawerWithQuote query={tourFileQuery} onClose={()=>{}} onConvert={()=>{}} onAdvance={()=>{}} onGenerateQuote={()=>{}} onToggleWF={()=>{}} onCancel={()=>{}} onUpdateRemarks={()=>{}} currentUser={{id:1,name:'Test'}}/>);
    fireEvent.click(screen.getByText('📋 Docs'));
    fireEvent.click(screen.getByText('Uploads'));
    expect(screen.getByText('Document Registry')).toBeTruthy();
    fireEvent.click(screen.getByText('Uploads'));
    expect(screen.queryByText('Document Registry')).toBeNull();
  });
});
