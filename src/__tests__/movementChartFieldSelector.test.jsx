import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GanttView from '../components/GanttView.jsx';

const query = {
  id: 'UTQ-1', tourFileId: 'TF-1', groupName: 'Test Group', status: 'operations',
  cancelled: false, travelDate: new Date().toISOString().split('T')[0], nights: 3,
};
const vendors = [{ id: 'v1', name: 'Delhi Coaches' }];
const tourExecutions = {
  'UTQ-1': {
    arrFlightDetails: 'AI-101 10:00', depFlightDetails: 'AI-102 18:00',
    days: [{ route: 'Delhi – Agra', hotelName: 'Taj View', rooms: '2 Twin' }],
    transporters: [{ vendorId: 'v1', sector: 'Delhi' }],
  },
};

function openMovementChart() {
  fireEvent.click(screen.getByText(/Movement Chart/));
}

describe('Movement Chart field selector', () => {
  it('extra columns are hidden by default', () => {
    render(<GanttView queries={[query]} tours={[]} onOpenQuery={()=>{}} staff={[]} vendors={vendors} tourExecutions={tourExecutions}/>);
    openMovementChart();
    expect(screen.queryByText('Route')).toBeNull();
    expect(screen.queryByText('Transporter')).toBeNull();
  });

  it('clicking Columns reveals the checklist with all 5 optional fields', () => {
    render(<GanttView queries={[query]} tours={[]} onOpenQuery={()=>{}} staff={[]} vendors={vendors} tourExecutions={tourExecutions}/>);
    openMovementChart();
    fireEvent.click(screen.getByText(/☰ Columns/));
    expect(screen.getByText('Arr. Flight')).toBeTruthy();
    expect(screen.getByText('Dep. Flight')).toBeTruthy();
    expect(screen.getByText('Route')).toBeTruthy();
    expect(screen.getByText('Rooming')).toBeTruthy();
    expect(screen.getByText('Transporter')).toBeTruthy();
  });

  it('checking a column adds it to the table with real resolved data', () => {
    render(<GanttView queries={[query]} tours={[]} onOpenQuery={()=>{}} staff={[]} vendors={vendors} tourExecutions={tourExecutions}/>);
    openMovementChart();
    fireEvent.click(screen.getByText(/☰ Columns/));
    const labels = screen.getAllByText('Transporter');
    const transporterCheckbox = labels[0].closest('label').querySelector('input[type="checkbox"]');
    fireEvent.click(transporterCheckbox);
    // Column header now visible, and the resolved vendor name shows in the row
    expect(screen.getAllByText('Transporter').length).toBeGreaterThan(0);
    expect(screen.getByText('Delhi Coaches')).toBeTruthy();
  });

  it('unchecking a column removes it again', () => {
    render(<GanttView queries={[query]} tours={[]} onOpenQuery={()=>{}} staff={[]} vendors={vendors} tourExecutions={tourExecutions}/>);
    openMovementChart();
    fireEvent.click(screen.getByText(/☰ Columns/));
    const label = screen.getByText('Route').closest('label');
    const routeCheckbox = label.querySelector('input[type="checkbox"]');
    fireEvent.click(routeCheckbox); // on
    expect(screen.getByText(/DELHI/)).toBeTruthy();
    fireEvent.click(routeCheckbox); // off
    expect(screen.queryByText(/DELHI/)).toBeNull();
  });

  it('Arr. Flight column header sits immediately after Arr. Date, and Dep. Flight immediately after Dep. Date', () => {
    render(<GanttView queries={[query]} tours={[]} onOpenQuery={()=>{}} staff={[]} vendors={vendors} tourExecutions={tourExecutions}/>);
    openMovementChart();
    fireEvent.click(screen.getByText(/☰ Columns/));
    const arrFlightLabel = screen.getByText('Arr. Flight').closest('label');
    fireEvent.click(arrFlightLabel.querySelector('input[type="checkbox"]'));
    const depFlightLabel = screen.getByText('Dep. Flight').closest('label');
    fireEvent.click(depFlightLabel.querySelector('input[type="checkbox"]'));

    const headers = Array.from(document.querySelectorAll('th')).map(th => th.textContent);
    expect(headers.indexOf('Arr. Flight')).toBe(headers.indexOf('Arr. Date') + 1);
    expect(headers.indexOf('Dep. Flight')).toBe(headers.indexOf('Dep. Date') + 1);
  });

  it('checking Arr. Flight shows the real flight detail for the row', () => {
    render(<GanttView queries={[query]} tours={[]} onOpenQuery={()=>{}} staff={[]} vendors={vendors} tourExecutions={tourExecutions}/>);
    openMovementChart();
    fireEvent.click(screen.getByText(/☰ Columns/));
    const label = screen.getByText('Arr. Flight').closest('label');
    fireEvent.click(label.querySelector('input[type="checkbox"]'));
    expect(screen.getByText('AI-101 10:00')).toBeTruthy();
  });

  it('offers Tour Facilitator and Local Handler as additional optional columns', () => {
    render(<GanttView queries={[query]} tours={[]} onOpenQuery={()=>{}} staff={[]} vendors={vendors} tourExecutions={tourExecutions}/>);
    openMovementChart();
    fireEvent.click(screen.getByText(/☰ Columns/));
    expect(screen.getByText('Tour Facilitator')).toBeTruthy();
    expect(screen.getByText('Local Handler')).toBeTruthy();
  });
});
