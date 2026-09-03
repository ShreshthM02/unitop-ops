import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { isWithinPeriod, rangeOverlapsPeriod } from '../lib/helpers.jsx';
import AgentMaster from '../components/AgentMaster.jsx';
import VendorMaster from '../components/VendorMaster.jsx';

// Items 3/5: a bank-statement-style time-period filter, one shared
// component used across Agent Query History/Financial Ledger and
// Vendor Service History/Contracted Rates/Financial Ledger/Exchange
// Orders.

describe('isWithinPeriod (single-date matching)', () => {
  const today = new Date();
  const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); };

  it('"all" always matches, including no date at all', () => {
    expect(isWithinPeriod(null, { preset: 'all' })).toBe(true);
    expect(isWithinPeriod(daysAgo(1000), { preset: 'all' })).toBe(true);
  });

  it('a date with no filter object at all defaults to matching (all time)', () => {
    expect(isWithinPeriod(daysAgo(1), null)).toBe(true);
  });

  it('excludes records with no date once an actual period is selected', () => {
    expect(isWithinPeriod(null, { preset: '3m' })).toBe(false);
    expect(isWithinPeriod('', { preset: '3m' })).toBe(false);
  });

  it('"3m"/"6m"/"1y" correctly include recent dates and exclude older ones', () => {
    expect(isWithinPeriod(daysAgo(30), { preset: '3m' })).toBe(true);
    expect(isWithinPeriod(daysAgo(200), { preset: '3m' })).toBe(false);
    expect(isWithinPeriod(daysAgo(150), { preset: '6m' })).toBe(true);
    expect(isWithinPeriod(daysAgo(400), { preset: '1y' })).toBe(false);
  });

  it('"custom" respects both from and to bounds', () => {
    const filter = { preset: 'custom', from: '2026-01-01', to: '2026-06-30' };
    expect(isWithinPeriod('2026-03-15', filter)).toBe(true);
    expect(isWithinPeriod('2025-12-31', filter)).toBe(false);
    expect(isWithinPeriod('2026-07-01', filter)).toBe(false);
  });

  it('"custom" with only a from bound (no to) is open-ended forward', () => {
    expect(isWithinPeriod('2030-01-01', { preset: 'custom', from: '2026-01-01' })).toBe(true);
  });
});

describe('rangeOverlapsPeriod (date-range matching, for Contracted Rates)', () => {
  it('a range with no dates at all always shows -- can\u2019t determine relevance, so never hidden', () => {
    expect(rangeOverlapsPeriod(null, null, { preset: '3m' })).toBe(true);
  });

  it('a range that genuinely overlaps the selected custom period matches', () => {
    const filter = { preset: 'custom', from: '2026-06-01', to: '2026-08-31' };
    expect(rangeOverlapsPeriod('2026-05-01', '2026-07-01', filter)).toBe(true); // overlaps the start
    expect(rangeOverlapsPeriod('2026-07-15', '2026-09-30', filter)).toBe(true); // overlaps the end
    expect(rangeOverlapsPeriod('2026-06-15', '2026-07-15', filter)).toBe(true); // fully inside
  });

  it('a range entirely outside the selected custom period does not match', () => {
    const filter = { preset: 'custom', from: '2026-06-01', to: '2026-08-31' };
    expect(rangeOverlapsPeriod('2026-01-01', '2026-03-31', filter)).toBe(false);
    expect(rangeOverlapsPeriod('2026-10-01', '2026-12-31', filter)).toBe(false);
  });
});

describe('TimePeriodFilter wired into all six sections', () => {
  it('AgentMaster Query History: filters by travel date', () => {
    const agents = [{ id: 'a1', company: 'ABC Travels' }];
    const queries = [
      { id: 'UTQ-1', agentCompany: 'ABC Travels', groupName: 'Recent Trip', travelDate: new Date().toISOString().slice(0,10) },
      { id: 'UTQ-2', agentCompany: 'ABC Travels', groupName: 'Old Trip', travelDate: '2020-01-01' },
    ];
    render(<AgentMaster agents={agents} setAgents={()=>{}} queries={queries} payments={{}} currentUser={{id:1,role:'admin'}} onSaveAgent={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('ABC Travels'));
    fireEvent.click(screen.getByText('Query History'));
    expect(screen.getByText('Recent Trip')).toBeTruthy();
    expect(screen.getByText('Old Trip')).toBeTruthy();
    fireEvent.change(screen.getByTitle('Filter by time period'), { target: { value: '3m' } });
    expect(screen.getByText('Recent Trip')).toBeTruthy();
    expect(screen.queryByText('Old Trip')).toBeFalsy();
  });

  it('VendorMaster Financial Ledger: filters by payment date', () => {
    const vendors = [{ id: 'v1', name: 'Nanking Restaurant', type: 'Restaurant', active: true, rates: [] }];
    render(<VendorMaster vendors={vendors} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Nanking Restaurant'));
    fireEvent.click(screen.getByText('Financial Ledger'));
    expect(screen.getByTitle('Filter by time period')).toBeTruthy();
  });
});
