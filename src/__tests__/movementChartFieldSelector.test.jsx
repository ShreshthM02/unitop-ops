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
    expect(screen.getByText('Delhi – Agra')).toBeTruthy();
    fireEvent.click(routeCheckbox); // off
    expect(screen.queryByText('Delhi – Agra')).toBeNull();
  });
});
