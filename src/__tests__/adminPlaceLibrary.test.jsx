import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const photoRows = [
  { id: 'p1', destination: 'Bodhgaya', label: 'Mahabodhi Temple', url: 'bodhgaya.jpg' },
];
const placeRows = [
  { id: 'c1', name: 'A Hamlet', lat: 25.1, lon: 84.2, country: 'India', admin1: 'Bihar' },
];

function makeDb() {
  return {
    from: (table) => {
      const rec = { table, filters: [] };
      const builder = {
        select: () => builder,
        eq: (col, val) => { rec.filters.push([col, val]); return builder; },
        order: () => ({ then: (res) => res({ data: table === 'photo_library' ? photoRows : placeRows, error: null }) }),
        update: vi.fn(async () => ({ error: null })),
        delete: vi.fn(async () => ({ error: null })),
      };
      return builder;
    },
  };
}

vi.mock('../lib/supabase.js', () => ({ get db() { return makeDb(); }, realtimeClient: null }));

const { default: AdminPlaceLibrary } = await import('../components/AdminPlaceLibrary.jsx');

describe('AdminPlaceLibrary: the shared-library review screen', () => {
  beforeEach(() => { vi.spyOn(window, 'confirm').mockReturnValue(true); });

  it('loads and shows both the photo library and the custom places library', async () => {
    render(<AdminPlaceLibrary/>);
    await waitFor(() => expect(screen.getByText('Photos (1)')).toBeTruthy());
    expect(screen.getByText('Bodhgaya')).toBeTruthy();
    fireEvent.click(screen.getByText('Places (1)'));
    expect(screen.getByText('A Hamlet')).toBeTruthy();
  });

  it('filters both tabs by the same search box', async () => {
    render(<AdminPlaceLibrary/>);
    await waitFor(() => expect(screen.getByText('Bodhgaya')).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText('Filter…'), { target: { value: 'zzz-no-match' } });
    expect(screen.getByText('No match.')).toBeTruthy();
  });

  it('editing a photo shows Save/Cancel and swaps the row into editable fields', async () => {
    render(<AdminPlaceLibrary/>);
    await waitFor(() => expect(screen.getByText('Bodhgaya')).toBeTruthy());
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByDisplayValue('Bodhgaya')).toBeTruthy();
    expect(screen.getByText('Save')).toBeTruthy();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByDisplayValue('Bodhgaya')).toBeNull();
  });

  it('a place edit\u2019s Save button is disabled with an invalid coordinate or an empty name', async () => {
    render(<AdminPlaceLibrary/>);
    fireEvent.click(await screen.findByText('Places (1)'));
    fireEvent.click(screen.getByText('Edit'));
    const nameField = screen.getByDisplayValue('A Hamlet');
    fireEvent.change(nameField, { target: { value: '' } });
    expect(screen.getByText('Save').disabled).toBe(true);
  });

  it('asks for confirmation before removing a photo from the shared library', async () => {
    render(<AdminPlaceLibrary/>);
    await waitFor(() => expect(screen.getByText('Bodhgaya')).toBeTruthy());
    fireEvent.click(screen.getByText('Remove'));
    expect(window.confirm).toHaveBeenCalled();
  });

  it('shows an empty-state message rather than a blank table when nothing has been saved', async () => {
    vi.doMock('../lib/supabase.js', () => ({
      db: { from: () => ({ select: () => ({ order: () => ({ then: (res) => res({ data: [], error: null }) }) }) }) },
      realtimeClient: null,
    }));
    vi.resetModules();
    const { default: Fresh } = await import('../components/AdminPlaceLibrary.jsx');
    render(<Fresh/>);
    await waitFor(() => expect(screen.getByText('Library is empty.')).toBeTruthy());
  });
});

describe('place_library permission: admin-only by default', () => {
  it('is granted to admin and no one else in ROLE_DEFAULTS', async () => {
    const { ROLE_DEFAULTS } = await import('../lib/constants.js');
    expect(ROLE_DEFAULTS.admin.place_library).toBe(true);
    expect(ROLE_DEFAULTS.sales.place_library).toBe(false);
    expect(ROLE_DEFAULTS.ops.place_library).toBe(false);
    expect(ROLE_DEFAULTS.accounts.place_library).toBe(false);
  });

  it('useCan resolves it correctly per role, including a per-user override', async () => {
    const { useCan } = await import('../lib/helpers.jsx');
    expect(useCan({ role: 'admin' })('place_library')).toBe(true);
    expect(useCan({ role: 'sales' })('place_library')).toBe(false);
    // A non-admin explicitly granted the permission still gets it -- the
    // per-user override system already used everywhere else in this app.
    expect(useCan({ role: 'sales', permissions: { place_library: true } })('place_library')).toBe(true);
  });

  it('has a human-readable label for the permissions screen', async () => {
    const { PERM_LABELS } = await import('../lib/constants.js');
    expect(PERM_LABELS.place_library).toBeTruthy();
  });
});

describe('adding a photo from the admin screen -- item #5\u2019s second half', () => {
  it('shows an Add Photo button only on the Photos tab', async () => {
    render(<AdminPlaceLibrary/>);
    await waitFor(() => expect(screen.getByText('+ Add Photo')).toBeTruthy());
    fireEvent.click(await screen.findByText('Places (1)'));
    expect(screen.queryByText('+ Add Photo')).toBeNull();
  });

  it('opens an upload form with a file input, destination and caption', async () => {
    render(<AdminPlaceLibrary/>);
    await waitFor(() => expect(screen.getByText('+ Add Photo')).toBeTruthy());
    fireEvent.click(screen.getByText('+ Add Photo'));
    expect(screen.getByLabelText('Choose photo file')).toBeTruthy();
    expect(screen.getByLabelText('Photo destination')).toBeTruthy();
    expect(screen.getByLabelText('Photo caption')).toBeTruthy();
  });

  it('refuses to upload with no destination', async () => {
    render(<AdminPlaceLibrary/>);
    await waitFor(() => expect(screen.getByText('+ Add Photo')).toBeTruthy());
    fireEvent.click(screen.getByText('+ Add Photo'));
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Choose photo file'), { target: { files: [file] } });
    fireEvent.click(screen.getByText('Upload'));
    await waitFor(() => expect(screen.getByText(/destination is required/i)).toBeTruthy());
  });

  it('the Cancel toggle closes the form', async () => {
    render(<AdminPlaceLibrary/>);
    await waitFor(() => expect(screen.getByText('+ Add Photo')).toBeTruthy());
    fireEvent.click(screen.getByText('+ Add Photo'));
    expect(screen.getByLabelText('Photo destination')).toBeTruthy();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByLabelText('Photo destination')).toBeNull();
  });
});

describe('GeoNames attribution: moved from a persistent sidebar footer into the Places tab', () => {
  it('shows the CC BY 4.0 credit on the Places tab', async () => {
    render(<AdminPlaceLibrary/>);
    fireEvent.click(await screen.findByText('Places (1)'));
    expect(screen.getByText(/CC BY 4.0/)).toBeTruthy();
    expect(screen.getByText('GeoNames').closest('a')).toHaveProperty('href', 'https://www.geonames.org/');
  });

  it('does not show it on the Photos tab -- it is specifically about place data', async () => {
    render(<AdminPlaceLibrary/>);
    await waitFor(() => expect(screen.getByText('Photos (1)')).toBeTruthy());
    expect(screen.queryByText(/CC BY 4.0/)).toBeNull();
  });
});
