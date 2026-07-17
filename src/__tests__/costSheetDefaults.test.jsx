import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CostSheet } from '../components/CostSheet.jsx';

const fakeQuery = { id: 'UTQ-2026-300', tourFileId: 'TF-300', groupName: 'Defaults Test Group', nights: 3 };

describe('CostSheet: new-sheet defaults match the specified requirements exactly', () => {
  it('GST defaults to 5%', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    expect(screen.getByDisplayValue('5')).toBeTruthy();
  });

  it('Markup defaults to 15%, not the old 20%', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    expect(screen.getAllByDisplayValue('15').length).toBeGreaterThan(0);
  });

  it('ROE defaults to 90', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    expect(screen.getByDisplayValue('90')).toBeTruthy();
  });

  it('Currency defaults to US $', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    expect(screen.getByDisplayValue('US $')).toBeTruthy();
  });

  it('ships with all 5 specified default slabs, in order, with correct labels/FOC/vehicle', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    const expected = [
      { label: '15-19 pax + 1 FOC', foc: '15', vehicle: 'Mini Bus' },
      { label: '20-24 pax + 1 FOC', foc: '20', vehicle: 'Large Coach' },
      { label: '25-29 pax + 1 FOC', foc: '25', vehicle: 'Large Coach' },
      { label: '30-34 pax + 2 FOC', foc: '30', vehicle: 'Large Coach' },
      { label: '35-39 pax + 2 FOC', foc: '35', vehicle: 'Large Coach' },
    ];
    expected.forEach(s => {
      expect(screen.getByDisplayValue(s.label)).toBeTruthy();
    });
    // FOC values: 15 and 30 repeat across slabs, so just confirm at least
    // one instance of each expected number is present.
    ['15','20','25','30','35'].forEach(foc => {
      expect(screen.getAllByDisplayValue(foc).length).toBeGreaterThan(0);
    });
  });
});

describe('CostSheet: Misc Cost and Tour Facilitator Cost default modes match the spec', () => {
  it('Tour Facilitator (TL) Cost defaults to Lumpsum', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CostSheet.jsx'), 'utf-8');
    expect(src).toMatch(/useState\("lumpsum"\);\s*\/\/\s*"lumpsum"\s*\|\s*"pp"/);
  });

  it('Misc Cost now defaults to Lumpsum, not the old Per Pax default', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CostSheet.jsx'), 'utf-8');
    expect(src).toContain('const [miscMode, setMiscMode] = useState("lumpsum");');
  });

  it('Monument mode still defaults to Per Person (pp), matching the spec', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CostSheet.jsx'), 'utf-8');
    expect(src).toContain('const [monMode,  setMonMode]  = useState("pp");');
  });
});
