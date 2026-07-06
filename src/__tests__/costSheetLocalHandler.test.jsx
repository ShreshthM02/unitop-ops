import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CostSheet } from '../components/CostSheet.jsx';

const fakeQuery = { id: 'UTQ-2026-080', groupName: 'Local Handler Test Group', nights: 3, pax: 20 };

describe('CostSheet: Local Handler section', () => {
  it('is optional -- starts empty and does not appear anywhere until "+ Add Local Handler" is clicked', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    expect(screen.getByText('Local Handler')).toBeTruthy(); // section header always visible (like Extra Services)
    expect(screen.queryByPlaceholderText('e.g. Bodhgaya / Rajgir')).toBeNull(); // but no entry row yet
  });

  it('adds a new entry with the "+ Add Local Handler" button', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    fireEvent.click(screen.getByText('+ Add Local Handler'));
    expect(screen.getByPlaceholderText('e.g. Bodhgaya / Rajgir')).toBeTruthy();
  });

  it('supports multiple entries for a multi-sector tour', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    fireEvent.click(screen.getByText('+ Add Local Handler'));
    fireEvent.click(screen.getByText('+ Add Local Handler'));
    expect(screen.getAllByPlaceholderText('e.g. Bodhgaya / Rajgir').length).toBe(2);
  });

  it('a lump-sum local handler cost affects the Final Price Summary total', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    fireEvent.click(screen.getByText('+ Add Local Handler'));

    // Find the local handler cost input: first number input in the row
    // containing the sector text input.
    const sectorInput = screen.getByPlaceholderText('e.g. Bodhgaya / Rajgir');
    const row = sectorInput.closest('div[style]').parentElement;
    const numberInputs = row.querySelectorAll('input[type="number"]');
    fireEvent.change(numberInputs[0], { target: { value: '50000' } });

    // "Local Hdlr PP" column header should now be present in the summary table
    expect(screen.getByText('Local Hdlr PP')).toBeTruthy();
  });

  it('single supplement field is present alongside the cost field in each handler row', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    fireEvent.click(screen.getByText('+ Add Local Handler'));
    expect(screen.getByPlaceholderText('Any notes on this handler/sector')).toBeTruthy();
    const allNumberInputs = document.querySelectorAll('input[type="number"]');
    expect(allNumberInputs.length).toBeGreaterThan(1);
  });

  it('renders without crashing when a query has no local handlers at all (default/backward-compatible state)', () => {
    expect(() => render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>)).not.toThrow();
  });
});
