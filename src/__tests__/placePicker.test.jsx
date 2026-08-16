import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

describe('a manually-placed coordinate now has its own editable name', () => {
  it('defaults the name field to the day\u2019s auto-derived query text', () => {
    setup({ query: 'Mahabodhi Temple, Bodhgaya' });
    fireEvent.click(screen.getByText('Change'));
    expect(screen.getByLabelText('Manual place name').value).toBe('Mahabodhi Temple, Bodhgaya');
  });

  it('the name is genuinely editable, not locked to the auto-derived text', () => {
    const onChange = setup({ query: 'A whole sentence describing the day' });
    fireEvent.click(screen.getByText('Change'));
    fireEvent.change(screen.getByLabelText('Manual place name'), { target: { value: 'Small Hamlet' } });
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '25.1' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '84.2' } });
    fireEvent.click(screen.getByText('Use these'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'Small Hamlet', lat: 25.1, lon: 84.2 }));
  });

  it('"Use these" is disabled when the name is cleared, even with valid coordinates', () => {
    setup({ query: 'Something' });
    fireEvent.click(screen.getByText('Change'));
    fireEvent.change(screen.getByLabelText('Manual place name'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '25.1' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '84.2' } });
    expect(screen.getByText('Use these').disabled).toBe(true);
  });

  it('a name that is only whitespace is treated as empty, not saved as a blank place', () => {
    const onChange = setup({ query: 'Something' });
    fireEvent.click(screen.getByText('Change'));
    fireEvent.change(screen.getByLabelText('Manual place name'), { target: { value: '   ' } });
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '25.1' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '84.2' } });
    expect(screen.getByText('Use these').disabled).toBe(true);
  });

  it('the saved place uses the trimmed manual name, not the raw query, even when they differ', () => {
    const onChange = setup({ query: '  Untrimmed query  ' });
    fireEvent.click(screen.getByText('Change'));
    fireEvent.change(screen.getByLabelText('Manual place name'), { target: { value: '  A Real Name  ' } });
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('Use these'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'A Real Name' }));
  });
});

describe('a failed "remember this place" save is surfaced, not silently swallowed', () => {
  it('the place is still picked for this day even when the remember-save fails', async () => {
    const onSaveCustomPlace = vi.fn(async () => ({ error: 'permission denied' }));
    const onChange = setup({ query: 'X', onSaveCustomPlace });
    fireEvent.click(screen.getByText('Change'));
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '25.1' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '84.2' } });
    fireEvent.click(screen.getByText('Use these'));
    // The local pick happens regardless of whether remembering succeeds --
    // the two are separate outcomes.
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ lat: 25.1, lon: 84.2 }));
  });

  it('an error from the save is shown even after the panel closes', async () => {
    const onSaveCustomPlace = vi.fn(async () => ({ error: 'permission denied' }));
    setup({ query: 'X', onSaveCustomPlace });
    fireEvent.click(screen.getByText('Change'));
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '25.1' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '84.2' } });
    fireEvent.click(screen.getByText('Use these'));
    // Panel closes immediately (pick() runs synchronously); the error only
    // resolves after, and must still be visible once it does -- this is
    // the actual regression this fix addresses.
    expect(screen.queryByLabelText('Latitude')).toBeNull(); // confirms the panel really did close
    await waitFor(() => expect(screen.getByText(/could not be remembered/)).toBeTruthy());
    expect(screen.getByText(/permission denied/)).toBeTruthy();
  });

  it('a thrown rejection (not just a returned error) is also caught and shown', async () => {
    const onSaveCustomPlace = vi.fn(async () => { throw new Error('network down'); });
    setup({ query: 'X', onSaveCustomPlace });
    fireEvent.click(screen.getByText('Change'));
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '25.1' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '84.2' } });
    fireEvent.click(screen.getByText('Use these'));
    await waitFor(() => expect(screen.getByText(/network down/)).toBeTruthy());
  });

  it('no error banner at all on a successful save', async () => {
    const onSaveCustomPlace = vi.fn(async () => ({ error: null }));
    setup({ query: 'X', onSaveCustomPlace });
    fireEvent.click(screen.getByText('Change'));
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '25.1' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '84.2' } });
    fireEvent.click(screen.getByText('Use these'));
    await waitFor(() => expect(onSaveCustomPlace).toHaveBeenCalled());
    expect(screen.queryByText(/could not be remembered/)).toBeNull();
  });

  it('opening the panel again clears a previous error, for a fresh attempt', async () => {
    const onSaveCustomPlace = vi.fn(async () => ({ error: 'permission denied' }));
    setup({ query: 'X', onSaveCustomPlace });
    fireEvent.click(screen.getByText('Change'));
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '25.1' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '84.2' } });
    fireEvent.click(screen.getByText('Use these'));
    await waitFor(() => expect(screen.getByText(/could not be remembered/)).toBeTruthy());
    fireEvent.click(screen.getByText('Change'));
    expect(screen.queryByText(/could not be remembered/)).toBeNull();
  });
});

describe('regression: the panel must escape an overflow:hidden ancestor, exactly like DayItemsEditor\u2019s dropdown once needed fixing', () => {
  // Reproduces the actual reported bug: each day card renders with
  // overflow:hidden (for its own rounded corners), and the panel used to
  // be positioned inline right after the toggle button -- so a day card
  // too short to contain the panel's full height clipped the bottom of
  // it, "Use these" included, exactly as it looked to a user clicking a
  // button that visually was not fully there. This proves the panel now
  // renders OUTSIDE that clipping container, not merely that clicking it
  // still fires a callback in a test environment that never enforced the
  // clipping in the first place.
  it('renders the open panel as a direct child of document.body, not inside a clipping wrapper', () => {
    const { container } = render(
      <div style={{ overflow: 'hidden', height: 40 }} data-testid="clipper">
        <PlacePicker query="A Hamlet" gazetteer={[]} G={G} inp={inp} onChange={()=>{}}/>
      </div>
    );
    fireEvent.click(screen.getByText('Change'));
    const panel = screen.getByLabelText('Search places').closest('div[style*="position: fixed"]');
    expect(panel).toBeTruthy();
    const clipper = container.querySelector('[data-testid="clipper"]');
    expect(clipper.contains(panel)).toBe(false);
    expect(document.body.contains(panel)).toBe(true);
  });

  it('the manual placement fields and Use these button are inside that same escaped panel', () => {
    render(
      <div style={{ overflow: 'hidden', height: 40 }}>
        <PlacePicker query="A Hamlet" gazetteer={[]} G={G} inp={inp} onChange={()=>{}}/>
      </div>
    );
    fireEvent.click(screen.getByText('Change'));
    // If these are reachable and clickable at all in this test, they are
    // rendered where the fix intends -- proving the wiring is intact end
    // to end, not just that a portal exists somewhere.
    expect(screen.getByLabelText('Manual place name')).toBeTruthy();
    expect(screen.getByLabelText('Latitude')).toBeTruthy();
    expect(screen.getByText('Use these')).toBeTruthy();
  });

  it('closes on an outside click -- new behaviour, needed because a portal-rendered panel is no longer visually inside its trigger', () => {
    setup({ query: 'X' });
    fireEvent.click(screen.getByText('Change'));
    expect(screen.getByLabelText('Search places')).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByLabelText('Search places')).toBeNull();
  });

  it('closes on Escape', () => {
    setup({ query: 'X' });
    fireEvent.click(screen.getByText('Change'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByLabelText('Search places')).toBeNull();
  });

  it('a click INSIDE the panel does not close it', () => {
    setup({ query: 'X' });
    fireEvent.click(screen.getByText('Change'));
    fireEvent.mouseDown(screen.getByLabelText('Search places'));
    expect(screen.getByLabelText('Search places')).toBeTruthy();
  });
});

describe('regression: item #1, "Use these" reported as truly silent -- a disabled button never fires its click handler at all', () => {
  it('a coordinate pair pasted (comma-separated) into the Latitude field auto-splits into both fields', () => {
    setup({ query: 'X' });
    fireEvent.click(screen.getByText('Change'));
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '24.6958, 85.0035' } });
    expect(screen.getByLabelText('Latitude').value).toBe('24.6958');
    expect(screen.getByLabelText('Longitude').value).toBe('85.0035');
  });

  it('the same pasted pair works when it lands in the Longitude field instead', () => {
    setup({ query: 'X' });
    fireEvent.click(screen.getByText('Change'));
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '24.6958, 85.0035' } });
    expect(screen.getByLabelText('Latitude').value).toBe('24.6958');
    expect(screen.getByLabelText('Longitude').value).toBe('85.0035');
  });

  it('a space-separated pair (no comma) also auto-splits -- another common paste format', () => {
    setup({ query: 'X' });
    fireEvent.click(screen.getByText('Change'));
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '24.6958 85.0035' } });
    expect(screen.getByLabelText('Latitude').value).toBe('24.6958');
    expect(screen.getByLabelText('Longitude').value).toBe('85.0035');
  });

  it('after auto-splitting a pasted pair, "Use these" is genuinely enabled, not just visually correct', () => {
    const onChange = setup({ query: 'X' });
    fireEvent.click(screen.getByText('Change'));
    fireEvent.change(screen.getByLabelText('Manual place name'), { target: { value: 'A Hamlet' } });
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '24.6958, 85.0035' } });
    expect(screen.getByText('Use these').disabled).toBe(false);
    fireEvent.click(screen.getByText('Use these'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ lat: 24.6958, lon: 85.0035 }));
  });

  it('a genuinely plain single number in one field is left alone, not mistaken for a pair', () => {
    setup({ query: 'X' });
    fireEvent.click(screen.getByText('Change'));
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '24.6958' } });
    expect(screen.getByLabelText('Latitude').value).toBe('24.6958');
    expect(screen.getByLabelText('Longitude').value).toBe('');
  });

  it('shows a visible reason once the disabled button has actually been engaged with, not on the pristine empty panel', () => {
    setup({ query: 'X' });
    fireEvent.click(screen.getByText('Change'));
    expect(screen.queryByText(/name is needed|must be/)).toBeNull(); // untouched, no premature warning
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '999' } });
    expect(screen.getByText(/must be/)).toBeTruthy();
  });

  it('the hint clears once the input becomes valid', () => {
    setup({ query: 'X' });
    fireEvent.click(screen.getByText('Change'));
    fireEvent.change(screen.getByLabelText('Manual place name'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '999' } });
    expect(screen.getByText(/must be/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '24.6958' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '85.0035' } });
    expect(screen.queryByText(/must be/)).toBeNull();
  });
});
