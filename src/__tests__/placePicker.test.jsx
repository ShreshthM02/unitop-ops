import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlacePicker } from '../lib/PlacePicker.jsx';
import { G } from '../lib/constants.js';

const gaz = [
  { name:'Bodhgaya',   lat:24.696, lon:84.991, country:'India', admin1:'Bihar',         population:38000 },
  { name:'Aurangabad', lat:24.752, lon:84.374, country:'India', admin1:'Bihar',         population:102000 },
  { name:'Aurangabad', lat:19.876, lon:75.343, country:'India', admin1:'Maharashtra',   population:1175000 },
  { name:'Varanasi',   lat:25.318, lon:82.974, country:'India', admin1:'Uttar Pradesh', population:1200000, alt:['Benares'] },
];
const inp = {};
const setup = (props = {}) => {
  const onChange = vi.fn();
  render(<PlacePicker gazetteer={gaz} G={G} inp={inp} onChange={onChange} {...props}/>);
  return onChange;
};

describe('the picker always shows its working', () => {
  it('names the chosen place with its state and country', () => {
    setup({ query:'Bodhgaya' });
    expect(screen.getByText('Bodhgaya, Bihar, India')).toBeTruthy();
  });

  it('explains the reason even on a confident match, so it can be checked', () => {
    // A silent correct answer and a silent wrong one look identical.
    setup({ query:'Bodhgaya' });
    expect(screen.getByText(/Located/)).toBeTruthy();
    expect(screen.getByText(/Exact name match/)).toBeTruthy();
  });

  it('flags an ambiguous name and says what else it matched', () => {
    setup({ query:'Aurangabad' });
    expect(screen.getByText(/Check this/)).toBeTruthy();
    expect(screen.getByText(/Also matches/)).toBeTruthy();
  });

  it('marks a fuzzy match as a guess rather than presenting it as fact', () => {
    setup({ query:'Bodhgya' });
    expect(screen.getByText(/Best guess/)).toBeTruthy();
  });

  it('says plainly when nothing matched, without treating it as an error', () => {
    setup({ query:'Somewhere Nobody Has Heard Of' });
    expect(screen.getByText(/No match for/)).toBeTruthy();
    expect(screen.getByText(/Not found/)).toBeTruthy();
  });
});

describe('the picker always accepts a correction', () => {
  it('offers Change on a confident match, not only an uncertain one', () => {
    setup({ query:'Bodhgaya' });
    expect(screen.getByText('Change')).toBeTruthy();
  });

  it('lists the other candidates so a wrong pick can be overridden in one click', () => {
    const onChange = setup({ query:'Aurangabad', context:[{ lat:24.7, lon:85.0 }] });
    fireEvent.click(screen.getByText('Change'));
    const other = screen.getByText('Aurangabad, Maharashtra, India');
    fireEvent.click(other);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ admin1:'Maharashtra' }));
  });

  it('lets someone who knows the answer search for it directly', () => {
    const onChange = setup({ query:'Bodhgaya' });
    fireEvent.click(screen.getByText('Change'));
    fireEvent.change(screen.getByLabelText('Search places'), { target:{ value:'Varan' } });
    fireEvent.click(screen.getByText('Varanasi, Uttar Pradesh, India'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name:'Varanasi' }));
  });

  it('accepts hand-entered coordinates for a place in no gazetteer', () => {
    const onChange = setup({ query:'A hamlet with no entry' });
    fireEvent.click(screen.getByText('Change'));
    fireEvent.change(screen.getByLabelText('Latitude'),  { target:{ value:'25.1' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target:{ value:'84.2' } });
    fireEvent.click(screen.getByText('Use these'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ source:'manual', lat:25.1, lon:84.2 }));
  });

  it('refuses to accept nonsense coordinates rather than plotting them', () => {
    setup({ query:'X' });
    fireEvent.click(screen.getByText('Change'));
    fireEvent.change(screen.getByLabelText('Latitude'),  { target:{ value:'999' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target:{ value:'84' } });
    expect(screen.getByText('Use these').disabled).toBe(true);
  });
});

describe('an explicit choice is respected', () => {
  it('never re-resolves over a place the user picked', () => {
    // The typed name still says Aurangabad; the user chose Maharashtra.
    // Re-resolving would silently undo that on the next render.
    setup({ query:'Aurangabad', value:{ name:'Aurangabad', admin1:'Maharashtra', country:'India', lat:19.876, lon:75.343 } });
    expect(screen.getByText('Aurangabad, Maharashtra, India')).toBeTruthy();
    expect(screen.getByText(/Chosen manually/)).toBeTruthy();
  });

  it('hides every control when read-only', () => {
    setup({ query:'Bodhgaya', readOnly:true });
    expect(screen.queryByText('Change')).toBeNull();
  });
});

describe('degrades without a gazetteer', () => {
  it('offers manual placement when the gazetteer is empty, rather than dead-ending', () => {
    // This is the state before the GeoNames import runs.
    const onChange = setup({ query:'Bodhgaya', gazetteer:[] });
    expect(screen.getByText(/No match for/)).toBeTruthy();
    fireEvent.click(screen.getByText('Change'));
    fireEvent.change(screen.getByLabelText('Latitude'),  { target:{ value:'24.7' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target:{ value:'85.0' } });
    fireEvent.click(screen.getByText('Use these'));
    expect(onChange).toHaveBeenCalled();
  });
});

describe('async search against the real gazetteer', () => {
  it('calls onSearch instead of filtering the local array when provided', async () => {
    const onSearch = vi.fn(async () => [{ name:'Varanasi', admin1:'Uttar Pradesh', country:'India', lat:25.3, lon:83.0 }]);
    const onChange = vi.fn();
    render(<PlacePicker query="Bodhgaya" gazetteer={[]} onSearch={onSearch} onChange={onChange} G={G} inp={inp}/>);
    fireEvent.click(screen.getByText('Change'));
    fireEvent.change(screen.getByLabelText('Search places'), { target:{ value:'Varan' } });
    await screen.findByText('Varanasi, Uttar Pradesh, India');
    expect(onSearch).toHaveBeenCalledWith('Varan');
    fireEvent.click(screen.getByText('Varanasi, Uttar Pradesh, India'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name:'Varanasi' }));
  });

  it('shows a searching indicator while the async call is in flight', async () => {
    let resolvePromise;
    const onSearch = vi.fn(() => new Promise(res => { resolvePromise = res; }));
    render(<PlacePicker query="X" gazetteer={[]} onSearch={onSearch} G={G} inp={inp}/>);
    fireEvent.click(screen.getByText('Change'));
    fireEvent.change(screen.getByLabelText('Search places'), { target:{ value:'va' } });
    await screen.findByText('Searching…');
    resolvePromise([]);
    await screen.findByText(/Nothing found/);
  });

  it('never touches the local array when onSearch is supplied', () => {
    const onSearch = vi.fn(async () => []);
    render(<PlacePicker query="X" gazetteer={gaz} onSearch={onSearch} G={G} inp={inp}/>);
    fireEvent.click(screen.getByText('Change'));
    fireEvent.change(screen.getByLabelText('Search places'), { target:{ value:'Bodh' } });
    // gaz has a real Bodhgaya entry -- if this were filtering gaz locally it
    // would appear instantly, before onSearch could ever resolve.
    expect(screen.queryByText('Bodhgaya, Bihar, India')).toBeNull();
  });
});

describe('remembering a manually-placed coordinate for next time', () => {
  it('does not show the checkbox at all when no onSaveCustomPlace is given', () => {
    setup({ query:'A Hamlet' });
    fireEvent.click(screen.getByText('Change'));
    expect(screen.queryByLabelText('Remember this place for future searches')).toBeNull();
  });

  it('shows the checkbox, checked by default, when onSaveCustomPlace is given', () => {
    setup({ query:'A Hamlet', onSaveCustomPlace: vi.fn() });
    fireEvent.click(screen.getByText('Change'));
    expect(screen.getByLabelText('Remember this place for future searches').checked).toBe(true);
  });

  it('calls onSaveCustomPlace with the placed coordinate when "Use these" is clicked and the box is checked', () => {
    const onSaveCustomPlace = vi.fn();
    const onChange = setup({ query:'A Hamlet', onSaveCustomPlace, onChange: vi.fn() });
    fireEvent.click(screen.getByText('Change'));
    fireEvent.change(screen.getByLabelText('Latitude'), { target:{ value:'25.1' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target:{ value:'84.2' } });
    fireEvent.click(screen.getByText('Use these'));
    expect(onSaveCustomPlace).toHaveBeenCalledWith(expect.objectContaining({ name:'A Hamlet', lat:25.1, lon:84.2 }));
  });

  it('does NOT call onSaveCustomPlace when the box is unchecked -- a genuinely one-off coordinate', () => {
    const onSaveCustomPlace = vi.fn();
    setup({ query:'X', onSaveCustomPlace });
    fireEvent.click(screen.getByText('Change'));
    fireEvent.click(screen.getByLabelText('Remember this place for future searches'));
    fireEvent.change(screen.getByLabelText('Latitude'), { target:{ value:'25.1' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target:{ value:'84.2' } });
    fireEvent.click(screen.getByText('Use these'));
    expect(onSaveCustomPlace).not.toHaveBeenCalled();
  });

  it('still calls onChange with the place regardless of the checkbox state', () => {
    const onChange = vi.fn();
    setup({ query:'X', onSaveCustomPlace: vi.fn(), onChange });
    fireEvent.click(screen.getByText('Change'));
    fireEvent.click(screen.getByLabelText('Remember this place for future searches')); // uncheck
    fireEvent.change(screen.getByLabelText('Latitude'), { target:{ value:'1' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target:{ value:'2' } });
    fireEvent.click(screen.getByText('Use these'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ lat:1, lon:2 }));
  });
});
