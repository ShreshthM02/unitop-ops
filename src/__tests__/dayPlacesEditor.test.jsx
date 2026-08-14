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
  it('shows a single PlacePicker, no leg-mode toggle, and no remove button', () => {
    setup();
    expect(screen.getByText('Bodhgaya')).toBeTruthy();
    expect(screen.queryByText('Road')).toBeNull();
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

  it('a second stop shows a leg-mode toggle, defaulting to Road', () => {
    setup({ places: [{ name: 'Bodhgaya', lat: 24.7, lon: 85.0 }, { name: 'Rajgir', lat: 25.03, lon: 85.42 }] });
    expect(screen.getByText('Road')).toBeTruthy();
    expect(screen.getByText('Flight')).toBeTruthy();
    expect(screen.getByText('Train')).toBeTruthy();
  });

  it('the first stop never shows a leg-mode toggle -- there is no leg into it from within the same day', () => {
    setup({ places: [{ name: 'A', lat: 1, lon: 1 }, { name: 'B', lat: 2, lon: 2 }] });
    const roadButtons = screen.getAllByText('Road');
    expect(roadButtons).toHaveLength(1); // only for the second stop
  });

  it('clicking a mode button sets legMode on that specific place', () => {
    const onChange = setup({ places: [{ name: 'A', lat: 1, lon: 1 }, { name: 'B', lat: 2, lon: 2 }] });
    fireEvent.click(screen.getByText('Flight'));
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
  it('hides Add, Remove and the leg-mode toggles', () => {
    setup({ places: [{ name: 'A', lat: 1, lon: 1 }, { name: 'B', lat: 2, lon: 2 }], readOnly: true });
    expect(screen.queryByText('+ Add another stop this day')).toBeNull();
    expect(screen.queryByLabelText('Remove stop 2')).toBeNull();
  });
});
