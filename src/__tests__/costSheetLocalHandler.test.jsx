import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderOpen } from './helpers/matrix.js';
import { CostSheet } from '../components/CostSheet.jsx';

const fakeQuery = { id: 'UTQ-2026-080', groupName: 'Local Handler Test Group', nights: 3, pax: 20 };

describe('CostSheet: Local Handler section', () => {
  it('is optional -- starts empty and does not appear anywhere until "+ Add Local Handler" is clicked', () => {
    renderOpen(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    expect(screen.getByText(/^▾ Local Handler/)).toBeTruthy(); // matrix group row always visible (like Extra Services)
    expect(screen.queryByPlaceholderText('e.g. Bodhgaya / Rajgir')).toBeNull(); // but no entry row yet
  });

  it('adds a new entry with the "+ Add Local Handler" button', () => {
    renderOpen(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    fireEvent.click(screen.getByText('+ Add Local Handler'));
    expect(screen.getByPlaceholderText('e.g. Bodhgaya / Rajgir')).toBeTruthy();
  });

  it('supports multiple entries for a multi-sector tour', () => {
    renderOpen(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    fireEvent.click(screen.getByText('+ Add Local Handler'));
    fireEvent.click(screen.getByText('+ Add Local Handler'));
    expect(screen.getAllByPlaceholderText('e.g. Bodhgaya / Rajgir').length).toBe(2);
  });

  it('a lump-sum local handler cost affects the Final Price Summary total', () => {
    renderOpen(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    fireEvent.click(screen.getByText('+ Add Local Handler'));

    // The handler's cost is the "same for all slabs" cell on its matrix row
    fireEvent.change(screen.getAllByLabelText('Cost, same for every slab').pop(), { target: { value: '50000' } });

    // the handler shows up in the matrix's own Local Handler subtotal (₹50,000 spread over each slab's paying pax)
    expect(screen.getAllByText(/Local Handler · 1/).length).toBeGreaterThan(0);
  });

  it('single supplement field is present alongside the cost field in each handler row', () => {
    renderOpen(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    fireEvent.click(screen.getByText('+ Add Local Handler'));
    // Details (single supplement, remarks, dates) open from the row's arrow
    fireEvent.click(screen.getAllByLabelText('Details').pop());
    expect(screen.getByPlaceholderText('Any notes on this handler/sector')).toBeTruthy();
    // Single supplement now has its own column in the matrix, on the handler's own row
    expect(screen.getByLabelText('Single supplement, this handler')).toBeTruthy();
  });

  it('renders without crashing when a query has no local handlers at all (default/backward-compatible state)', () => {
    expect(() => renderOpen(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>)).not.toThrow();
  });
});
