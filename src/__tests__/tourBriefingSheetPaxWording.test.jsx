import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TourBriefingSheet from '../components/TourBriefingSheet.jsx';

// Same "pax pax" bug as Kanban/Dashboard: paxDisplay already includes
// the word "pax" when constructed (e.g. "7 pax"), so appending another
// literal " PAX" produced "7 pax PAX".

describe('Tour Briefing Sheet subject line: no doubled-up "pax pax"', () => {
  it('does not append PAX again when paxDisplay already includes it', () => {
    const query = { id: 'UTQ-1', tourFileId: 'TF-1', paxDisplay: '7 pax', travelDate: '2026-08-01' };
    render(<TourBriefingSheet query={query} template={{}} facilitators={[]} onClose={()=>{}} currentUser={{id:'x'}}/>);
    const subjectInput = screen.getByDisplayValue(/GROUP FROM/);
    expect(subjectInput.value).toContain('7 pax');
    expect(subjectInput.value).not.toMatch(/pax pax/i);
  });
});
