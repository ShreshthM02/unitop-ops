import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DayPlacesEditor } from '../lib/DayPlacesEditor.jsx';
import { G } from '../lib/constants.js';

const inp = {};
const gaz = [
  { name: 'Rajgir', lat: 25.03, lon: 85.42, country: 'India' },
  { name: 'Nalanda', lat: 25.14, lon: 85.44, country: 'India' },
];

const setup = (props = {}) => {
  const onChange = vi.fn();
  render(
    <DayPlacesEditor
      places={props.places ?? [{ name: 'Bodhgaya', lat: 24.7, lon: 85.0 }]}
      onChange={onChange}
      candidatesFor={() => gaz}
      queryFor={() => 'Bodhgaya'}
      onSearch={async () => gaz}
      context={[]}
      G={G}
      inp={inp}
      readOnly={false}
      {...props}
    />
  );
  return onChange;
};

describe('a day with just one place looks and behaves exactly as before', () => {
  it('shows a single PlacePicker with its own leg-mode toggle, and no remove button', () => {
    setup();
    expect(screen.getByText('Bodhgaya')).toBeTruthy();
    expect(screen.getByText('Road')).toBeTruthy(); // governs the leg from the previous day
    expect(screen.queryByLabelText('Remove stop 1')).toBeNull();
  });

  it('offers "Add another stop" even for a single-place day', () => {
    setup();
    expect(screen.getByText('+ Add another stop this day')).toBeTruthy();
  });
});

describe('adding and removing stops', () => {
  it('clicking Add another stop appends an empty slot', () => {
    const onChange = setup();
    fireEvent.click(screen.getByText('+ Add another stop this day'));
    expect(onChange).toHaveBeenCalledWith([{ name: 'Bodhgaya', lat: 24.7, lon: 85.0 }, undefined]);
  });

  it('every stop shows a leg-mode toggle, defaulting to Road', () => {
    setup({ places: [{ name: 'Bodhgaya', lat: 24.7, lon: 85.0 }, { name: 'Rajgir', lat: 25.03, lon: 85.42 }] });
    expect(screen.getAllByText('Road')).toHaveLength(2);
    expect(screen.getAllByText('Flight')).toHaveLength(2);
    expect(screen.getAllByText('Train')).toHaveLength(2);
  });

  it('every stop shows its own leg-mode toggle, including the first -- it governs the leg connecting from the previous day, which the map builder already reads uniformly', () => {
    setup({ places: [{ name: 'A', lat: 1, lon: 1 }, { name: 'B', lat: 2, lon: 2 }] });
    const roadButtons = screen.getAllByText('Road');
    expect(roadButtons).toHaveLength(2); // one per stop, not just the second
  });

  it('clicking a mode button sets legMode on that specific place, not others', () => {
    const onChange = setup({ places: [{ name: 'A', lat: 1, lon: 1 }, { name: 'B', lat: 2, lon: 2 }] });
    fireEvent.click(screen.getAllByText('Flight')[1]); // the second stop's Flight button
    expect(onChange).toHaveBeenCalledWith([{ name: 'A', lat: 1, lon: 1 }, { name: 'B', lat: 2, lon: 2, legMode: 'flight' }]);
  });

  it('a remove button appears once there is more than one stop, and removes only that slot', () => {
    const onChange = setup({ places: [{ name: 'A', lat: 1, lon: 1 }, { name: 'B', lat: 2, lon: 2 }] });
    fireEvent.click(screen.getByLabelText('Remove stop 2'));
    expect(onChange).toHaveBeenCalledWith([{ name: 'A', lat: 1, lon: 1 }]);
  });
});

describe('picking a new place at a slot preserves that leg\u2019s own mode/distance/time', () => {
  it('swapping the place at slot 2 keeps its existing legMode', async () => {
    const onSearch = vi.fn(async () => [{ name: 'Nalanda', lat: 25.14, lon: 85.44, country: 'India' }]);
    const onChange = setup({
      places: [{ name: 'A', lat: 1, lon: 1 }, { name: 'B', lat: 2, lon: 2, legMode: 'flight', legDistance: '400 km' }],
      onSearch,
    });
    fireEvent.click(screen.getAllByText('Change')[1]);
    fireEvent.change(screen.getByLabelText('Search places'), { target: { value: 'nal' } });
    await screen.findByText('Nalanda, India');
    fireEvent.click(screen.getByText('Nalanda, India'));
    const updated = onChange.mock.calls[0][0];
    expect(updated[1]).toMatchObject({ name: 'Nalanda', legMode: 'flight', legDistance: '400 km' });
  });
});

describe('only the first slot gets pre-fetched candidates; later slots search live', () => {
  it('slot 0 receives the candidatesFor(0) array directly', () => {
    const candidatesFor = vi.fn(() => gaz);
    render(
      <DayPlacesEditor places={[undefined]} onChange={()=>{}} candidatesFor={candidatesFor}
        queryFor={() => 'X'} onSearch={async () => []} context={[]} G={G} inp={inp}/>
    );
    expect(candidatesFor).toHaveBeenCalledWith(0);
  });

  it('a later slot gets an empty local gazetteer and relies on onSearch instead', async () => {
    const onSearch = vi.fn(async () => [{ name: 'Nalanda', lat: 25.14, lon: 85.44, country: 'India' }]);
    render(
      <DayPlacesEditor places={[{ name: 'A', lat: 1, lon: 1 }, undefined]} onChange={()=>{}}
        candidatesFor={() => gaz} queryFor={() => ''} onSearch={onSearch} context={[]} G={G} inp={inp}/>
    );
    fireEvent.click(screen.getAllByText('Change')[1]);
    fireEvent.change(screen.getByLabelText('Search places'), { target: { value: 'nal' } });
    await screen.findByText('Nalanda, India');
    expect(onSearch).toHaveBeenCalledWith('nal');
  });
});

describe('read-only mode', () => {
  it('hides Add and Remove, and disables (not hides) the leg-mode toggles', () => {
    setup({ places: [{ name: 'A', lat: 1, lon: 1 }, { name: 'B', lat: 2, lon: 2 }], readOnly: true });
    expect(screen.queryByText('+ Add another stop this day')).toBeNull();
    expect(screen.queryByLabelText('Remove stop 2')).toBeNull();
    expect(screen.getAllByText('Road')[0].disabled).toBe(true);
  });
});

describe('the FIRST stop\u2019s mode governs the inter-day leg -- item #2: every place gets a mode, not just legs after the first', () => {
  it('clicking a mode on the first (and only) stop sets legMode there', () => {
    const onChange = setup({ places: [{ name: 'Bodhgaya', lat: 24.7, lon: 85.0 }] });
    fireEvent.click(screen.getByText('Flight'));
    expect(onChange).toHaveBeenCalledWith([{ name: 'Bodhgaya', lat: 24.7, lon: 85.0, legMode: 'flight' }]);
  });

  it('defaults to Road when no legMode has ever been set', () => {
    setup({ places: [{ name: 'Bodhgaya', lat: 24.7, lon: 85.0 }] });
    const roadButton = screen.getByText('Road');
    expect(roadButton.style.color).toBeTruthy(); // selected state applies some accent styling
  });
});
