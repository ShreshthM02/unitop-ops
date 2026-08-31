import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReportsView from '../components/ReportsView.jsx';

// recharts' ResponsiveContainer measures its own DOM node via
// ResizeObserver before rendering any chart -- jsdom doesn't implement
// that API at all, so without a polyfill no chart ever renders in these
// tests (not a bug in the component, just a jsdom gap).
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // recharts' ResponsiveContainer also reads getBoundingClientRect to size
  // itself, and skips rendering any chart into a zero-sized container --
  // jsdom's default layout gives every element 0x0, so without this it
  // silently renders nothing at all, chart-eligible or not.
  Element.prototype.getBoundingClientRect = () => ({
    width: 600, height: 220, top: 0, left: 0, bottom: 220, right: 600, x: 0, y: 0, toJSON() {},
  });
});

// 1.2: charts wherever applicable, tabular data beneath. Only reports
// with a genuine single aggregated metric per category (or, for
// Seasonality, a real time series) get one -- flat list/log reports are
// deliberately left as tables only. recharts renders into an SVG via
// ResizeObserver, which jsdom doesn't implement -- these tests check the
// chart's *data-bearing* DOM (an SVG element is present), not exact
// pixel geometry, which is what ResponsiveContainer needs a real
// layout engine for anyway.

const queries = [
  { id: 'UTQ-1', tourFileId: 'TF-1', groupName: 'Group A', destination: 'Kerala', agentCompany: 'ABC Travels', nationality: 'German', status: 'finance', date: '2026-08-01', cancelled: false },
  { id: 'UTQ-2', tourFileId: 'TF-2', groupName: 'Group B', destination: 'Goa', agentCompany: 'XYZ Tours', nationality: 'Thai', status: 'new', date: '2026-08-15', cancelled: false },
];

describe('Charts appear on aggregated-by-category reports', () => {
  it('Agent-wise Revenue renders a chart (bar)', async () => {
    render(<ReportsView queries={queries} payments={{}} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}}/>);
    fireEvent.click(screen.getByText(/Agent-wise Revenue/));
    await waitFor(() => expect(screen.getAllByText('ABC Travels').length).toBeGreaterThan(0));
    expect(document.querySelector('.recharts-wrapper')).toBeTruthy();
  });

  it('Sector Performance renders a chart (bar)', async () => {
    render(<ReportsView queries={queries} payments={{}} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}}/>);
    fireEvent.click(screen.getByText(/Sector Performance/));
    await waitFor(() => expect(screen.getAllByText('Kerala').length).toBeGreaterThan(0));
    expect(document.querySelector('.recharts-wrapper')).toBeTruthy();
  });

  it('Nationality Mix renders a pie chart', async () => {
    render(<ReportsView queries={queries} payments={{}} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}}/>);
    fireEvent.click(screen.getByText(/Nationality Mix/));
    await waitFor(() => expect(screen.getAllByText('German').length).toBeGreaterThan(0));
    expect(document.querySelector('.recharts-pie')).toBeTruthy();
  });

  it('Seasonality renders a multi-series line chart', async () => {
    render(<ReportsView queries={queries} payments={{}} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}}/>);
    fireEvent.click(screen.getByText(/Seasonality Report/));
    await waitFor(() => expect(screen.getAllByText('Queries').length).toBeGreaterThan(0));
    expect(document.querySelector('.recharts-wrapper')).toBeTruthy();
    // The three series show up as legend entries, one per metric
    expect(document.querySelector('.recharts-legend-wrapper')).toBeTruthy();
    expect(screen.getAllByText('Tour Files').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Operated').length).toBeGreaterThan(0);
  });
});

describe('Charts do not appear on flat list/log reports', () => {
  it('Query Log has no chart', async () => {
    render(<ReportsView queries={queries} payments={{}} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}}/>);
    fireEvent.click(screen.getByText(/Query Log/));
    await waitFor(() => expect(screen.getByText('UTQ-1')).toBeTruthy());
    expect(document.querySelector('.recharts-wrapper')).toBeFalsy();
  });

  it('Tour Facilitator Report has no chart', async () => {
    render(<ReportsView queries={queries} payments={{}} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}}/>);
    fireEvent.click(screen.getByText(/Tour Facilitator Report/));
    await waitFor(() => expect(screen.getByText(/No data yet/)).toBeTruthy());
    expect(document.querySelector('.recharts-wrapper')).toBeFalsy();
  });
});
