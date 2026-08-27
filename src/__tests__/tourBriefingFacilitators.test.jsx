import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TourBriefingSheet from '../components/TourBriefingSheet.jsx';

const fakeQuery = { id: 'UTQ-2026-090', groupName: 'Facilitator Test Group', tourFileId: 'TF-2026-090' };
const facilitators = [
  { id: 'FAC-001', name: 'Prithvi', contactPhone: '+91-9800000001', email: '', languages: 'English, Hindi', areas: 'Bodhgaya, Rajgir', notes: '', active: true },
  { id: 'FAC-002', name: 'Ashutosh', contactPhone: '+91-9800000002', email: '', languages: 'English, Thai', areas: 'Bodhgaya', notes: '', active: true },
  { id: 'FAC-003', name: 'Retired Guide', contactPhone: '', email: '', languages: '', areas: '', notes: '', active: false },
];

// The preview HTML is now built asynchronously (buildPaginatedLetterheadDocument
// requires real DOM measurement), so this must wait for the iframe's srcdoc
// to actually contain the expected content rather than reading it synchronously
// right after the click.
async function getPreviewHTML(container, expectedSubstring) {
  fireEvent.click(screen.getByText('👁 Preview'));
  await waitFor(() => {
    const iframe = container.querySelector('iframe');
    const html = iframe.getAttribute('srcdoc') || iframe.srcdoc;
    expect(html).toContain(expectedSubstring);
  });
  const iframe = container.querySelector('iframe');
  return iframe.getAttribute('srcdoc') || iframe.srcdoc;
}

describe('TourBriefingSheet: facilitator selection (replaces free-text name)', () => {
  it('shows a dropdown of active facilitators instead of a free-text name field', () => {
    render(<TourBriefingSheet query={fakeQuery} facilitators={facilitators} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Tour Facilitators'));
    const select = document.querySelector('select');
    const options = Array.from(select.querySelectorAll('option')).map(o => o.textContent);
    expect(options).toContain('Prithvi');
    expect(options).toContain('Ashutosh');
  });

  it('does not list inactive facilitators as selectable', () => {
    render(<TourBriefingSheet query={fakeQuery} facilitators={facilitators} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Tour Facilitators'));
    const select = document.querySelector('select');
    const options = Array.from(select.querySelectorAll('option')).map(o => o.textContent);
    expect(options).not.toContain('Retired Guide');
  });

  it('selecting a facilitator auto-fills Contact from the master record\'s real contactPhone field (2026-08-27: previously read a "phone" field that never matched real vendor data\'s "contactPhone", so this silently never worked -- "Area" is no longer part of the 3-field Description/Name/Contact spec, so it is not auto-filled anymore)', () => {
    render(<TourBriefingSheet query={fakeQuery} facilitators={facilitators} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Tour Facilitators'));
    const select = document.querySelector('select');
    fireEvent.change(select, { target: { value: 'FAC-001' } });
    expect(screen.getByDisplayValue('+91-9800000001')).toBeTruthy();
  });

  it('the selected facilitator\'s name reaches the print output (via the linked id, not free text)', async () => {
    const { container } = render(<TourBriefingSheet query={fakeQuery} facilitators={facilitators} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Tour Facilitators'));
    const select = document.querySelector('select');
    fireEvent.change(select, { target: { value: 'FAC-002' } });
    const html = await getPreviewHTML(container, 'Ashutosh');
    expect(html).toContain('Ashutosh');
  });

  it('shows a helpful hint when the facilitators master list is empty', () => {
    render(<TourBriefingSheet query={fakeQuery} facilitators={[]} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Tour Facilitators'));
    expect(screen.getByText(/Master Data → Tour Facilitators/)).toBeTruthy();
  });

  it('renders without crashing when facilitators prop is not passed at all', () => {
    expect(() => render(<TourBriefingSheet query={fakeQuery} onClose={()=>{}}/>)).not.toThrow();
  });
});
