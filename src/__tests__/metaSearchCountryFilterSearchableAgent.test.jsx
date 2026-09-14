import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AgentMaster from '../components/AgentMaster.jsx';
import VendorMaster from '../components/VendorMaster.jsx';
import NewQueryModal from '../components/NewQueryModal.jsx';
import { SearchableSelect } from '../lib/helpers.jsx';

// Three real, direct requests:
// 1. Agent/Vendor search should also match contact persons and other
//    relevant fields ("meta search"), to help find partial information.
// 2. Agent profile gets a real country dropdown, plus a country-wide
//    filter on the Agents list.
// 3. The New Query agent field becomes a real, searchable combobox
//    instead of a long, scroll-only <select>.

const agentsWithContacts = [
  { id: 'a1', company: 'Global Tours', country: 'USA', city: 'New York', active: true,
    contacts: [{ id: 1, name: 'Jane Smith', phone: '555-1234', email: 'jane@globaltours.com', designation: 'Sales Manager' }] },
  { id: 'a2', company: 'Euro Journeys', country: 'Germany', city: 'Berlin', active: true,
    contacts: [{ id: 2, name: 'Hans Mueller', phone: '030-9999', email: 'hans@euro.de', designation: 'Director' }] },
];

describe('Meta search: Agents list also matches contact persons, not just company/country', () => {
  it('finds an agent by a contact person\'s name even when the company name does not match the search text', () => {
    render(<AgentMaster agents={agentsWithContacts} setAgents={()=>{}} queries={[]} payments={{}} currentUser={{id:1,role:'admin'}} onSaveAgent={()=>{}} onClose={()=>{}}/>);
    fireEvent.change(screen.getByPlaceholderText('Search agents...'), { target: { value: 'Mueller' } });
    expect(screen.getByText('Euro Journeys')).toBeTruthy();
    expect(screen.queryByText('Global Tours')).toBeFalsy();
  });

  it('finds an agent by a contact person\'s designation', () => {
    render(<AgentMaster agents={agentsWithContacts} setAgents={()=>{}} queries={[]} payments={{}} currentUser={{id:1,role:'admin'}} onSaveAgent={()=>{}} onClose={()=>{}}/>);
    fireEvent.change(screen.getByPlaceholderText('Search agents...'), { target: { value: 'Sales Manager' } });
    expect(screen.getByText('Global Tours')).toBeTruthy();
    expect(screen.queryByText('Euro Journeys')).toBeFalsy();
  });

  it('finds an agent by a contact person\'s phone number', () => {
    render(<AgentMaster agents={agentsWithContacts} setAgents={()=>{}} queries={[]} payments={{}} currentUser={{id:1,role:'admin'}} onSaveAgent={()=>{}} onClose={()=>{}}/>);
    fireEvent.change(screen.getByPlaceholderText('Search agents...'), { target: { value: '030-9999' } });
    expect(screen.getByText('Euro Journeys')).toBeTruthy();
  });
});

describe('Meta search: Vendors list also matches contact persons', () => {
  it('finds a vendor by a contact person\'s email', () => {
    const vendorsWithContacts = [
      { id: 'v1', name: 'Taj Hotel', type: 'Hotel', city: 'Agra', active: true,
        contacts: [{ id: 1, name: 'Ravi Kumar', email: 'ravi@tajhotel.com' }] },
      { id: 'v2', name: 'City Palace', type: 'Hotel', city: 'Jaipur', active: true, contacts: [] },
    ];
    render(<VendorMaster vendors={vendorsWithContacts} setVendors={()=>{}} queries={[]} payments={{}} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={()=>{}} onClose={()=>{}}/>);
    fireEvent.change(screen.getByPlaceholderText(/Search vendors/i), { target: { value: 'ravi@tajhotel.com' } });
    expect(screen.getByText('Taj Hotel')).toBeTruthy();
    expect(screen.queryByText('City Palace')).toBeFalsy();
  });
});

describe('Agent profile: real country dropdown, and a country-wide filter on the list', () => {
  it('the edit form shows a real <select> of countries, not a free-text input', () => {
    render(<AgentMaster agents={[]} setAgents={()=>{}} queries={[]} payments={{}} currentUser={{id:1,role:'admin'}} onSaveAgent={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('+ New Agent'));
    const countryLabel = screen.getByText('Country');
    const select = countryLabel.parentElement.querySelector('select');
    expect(select).toBeTruthy();
    expect(select.querySelectorAll('option').length).toBeGreaterThan(50); // a real, complete country list
  });

  it('filtering by country on the list only shows agents from that country', () => {
    render(<AgentMaster agents={agentsWithContacts} setAgents={()=>{}} queries={[]} payments={{}} currentUser={{id:1,role:'admin'}} onSaveAgent={()=>{}} onClose={()=>{}}/>);
    fireEvent.change(screen.getByTitle('Filter agents by country'), { target: { value: 'Germany' } });
    expect(screen.getByText('Euro Journeys')).toBeTruthy();
    expect(screen.queryByText('Global Tours')).toBeFalsy();
  });
});

describe('SearchableSelect: a real, reusable combobox with type-to-filter', () => {
  const options = [{ id: 1, label: 'Alpha' }, { id: 2, label: 'Beta' }, { id: 3, label: 'Gamma' }];

  it('shows all options when focused with no query typed yet', () => {
    render(<SearchableSelect value="" onChange={()=>{}} options={options} getValue={o=>o.id} getLabel={o=>o.label} />);
    fireEvent.focus(screen.getByPlaceholderText('Type to search…'));
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
    expect(screen.getByText('Gamma')).toBeTruthy();
  });

  it('typing narrows the dropdown to matching options only', () => {
    render(<SearchableSelect value="" onChange={()=>{}} options={options} getValue={o=>o.id} getLabel={o=>o.label} />);
    const input = screen.getByPlaceholderText('Type to search…');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Bet' } });
    expect(screen.getByText('Beta')).toBeTruthy();
    expect(screen.queryByText('Alpha')).toBeFalsy();
    expect(screen.queryByText('Gamma')).toBeFalsy();
  });

  it('clicking an option calls onChange with its value and closes the dropdown', () => {
    const onChange = vi.fn();
    render(<SearchableSelect value="" onChange={onChange} options={options} getValue={o=>o.id} getLabel={o=>o.label} />);
    fireEvent.focus(screen.getByPlaceholderText('Type to search…'));
    fireEvent.mouseDown(screen.getByText('Gamma'));
    expect(onChange).toHaveBeenCalledWith(3);
    expect(screen.queryByText('Alpha')).toBeFalsy(); // dropdown closed
  });
});

describe('New Query modal: the Foreign Agency field is a real searchable combobox, not a long scroll-only dropdown', () => {
  it('does not render a plain native <select> for the agent field anymore', () => {
    render(<NewQueryModal onClose={()=>{}} onSave={()=>{}} nextId="UTQ-2026-001" agents={agentsWithContacts} staff={[]} series={[]} queries={[]}/>);
    // Real fix: typing narrows results, exactly like SearchableSelect above.
    const input = screen.getByPlaceholderText('Type to search agents…');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Euro' } });
    expect(screen.getByText(/Euro Journeys/)).toBeTruthy();
    expect(screen.queryByText(/Global Tours/)).toBeFalsy();
  });

  it('selecting an agent from the searchable dropdown still correctly fills in the dependent fields', () => {
    render(<NewQueryModal onClose={()=>{}} onSave={()=>{}} nextId="UTQ-2026-001" agents={agentsWithContacts} staff={[]} series={[]} queries={[]}/>);
    const input = screen.getByPlaceholderText('Type to search agents…');
    fireEvent.focus(input);
    fireEvent.mouseDown(screen.getByText(/Global Tours/));
    const agencyNameInput = screen.getByPlaceholderText('e.g. NCH Holidays');
    expect(agencyNameInput.value).toBe('Global Tours');
  });
});
