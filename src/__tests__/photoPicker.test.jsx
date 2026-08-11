import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PhotoPicker } from '../lib/PhotoPicker.jsx';
import { G } from '../lib/constants.js';

const inp = {};
const library = [
  { id: 'p1', destination: 'Bodhgaya', label: 'Mahabodhi Temple', url: 'bodhgaya.jpg' },
  { id: 'p2', destination: 'Sarnath', label: '', url: 'sarnath.jpg' },
  { id: 'p3', destination: 'Varanasi', label: 'Ganges ghats', url: 'varanasi.jpg' },
];
const day = { id: 'd1', items: [{ type: 'sightseeing', text: 'Mahabodhi Temple, Bodhgaya' }] };

const setup = (props = {}) => {
  const onChangeOverride = vi.fn();
  render(<PhotoPicker day={day} library={library} G={G} inp={inp} onChangeOverride={onChangeOverride} {...props}/>);
  return onChangeOverride;
};

describe('the picker always shows its working', () => {
  it('shows "Suggested" with a reason when auto-resolved, no override in state', () => {
    setup({ resolvedUrl: 'bodhgaya.jpg', overrideValue: undefined });
    expect(screen.getByText('Suggested')).toBeTruthy();
    expect(screen.getByText(/Matched automatically/)).toBeTruthy();
  });

  it('shows "Chosen" when a manual override is a URL', () => {
    setup({ resolvedUrl: 'sarnath.jpg', overrideValue: 'sarnath.jpg' });
    expect(screen.getByText('Chosen')).toBeTruthy();
    expect(screen.getByText(/Set manually/)).toBeTruthy();
  });

  it('shows "No photo" when explicitly cleared (null), distinct from never having one', () => {
    setup({ resolvedUrl: undefined, overrideValue: null });
    expect(screen.getByText('No photo')).toBeTruthy();
    expect(screen.getByText(/will not be auto-suggested again/)).toBeTruthy();
  });

  it('shows "None yet" when nothing is suggested and nothing is chosen', () => {
    setup({ resolvedUrl: undefined, overrideValue: undefined });
    expect(screen.getByText('None yet')).toBeTruthy();
  });

  it('renders a thumbnail when a photo is resolved, a placeholder box when not', () => {
    const { container, unmount } = render(<PhotoPicker day={day} library={library} G={G} inp={inp} onChangeOverride={()=>{}} resolvedUrl="bodhgaya.jpg"/>);
    expect(container.querySelector('img[alt=""]')).toBeTruthy();
    unmount();
    render(<PhotoPicker day={day} library={library} G={G} inp={inp} onChangeOverride={()=>{}} resolvedUrl={undefined}/>);
    expect(screen.queryByRole('img')).toBeNull();
  });
});

describe('the picker always accepts a correction', () => {
  it('offers Change even on a confident auto-suggestion', () => {
    setup({ resolvedUrl: 'bodhgaya.jpg', overrideValue: undefined });
    expect(screen.getByText('Change')).toBeTruthy();
  });

  it('picking a library photo sets the override to its URL', () => {
    const onChangeOverride = setup({ resolvedUrl: 'bodhgaya.jpg' });
    fireEvent.click(screen.getByText('Change'));
    fireEvent.click(screen.getByAltText('Sarnath'));
    expect(onChangeOverride).toHaveBeenCalledWith('sarnath.jpg');
  });

  it('filters the library by destination or caption', () => {
    setup({});
    fireEvent.click(screen.getByText('Change'));
    fireEvent.change(screen.getByLabelText('Filter library'), { target: { value: 'ganges' } });
    expect(screen.getByAltText('Varanasi')).toBeTruthy();
    expect(screen.queryByAltText('Bodhgaya')).toBeNull();
  });

  it('"No photo for this day" sets the override explicitly to null', () => {
    const onChangeOverride = setup({ resolvedUrl: 'bodhgaya.jpg' });
    fireEvent.click(screen.getByText('Change'));
    fireEvent.click(screen.getByText('\u2715 No photo for this day'));
    expect(onChangeOverride).toHaveBeenCalledWith(null);
  });

  it('offers to go back to auto-suggestion once an override exists, not before', () => {
    const { rerender } = render(<PhotoPicker day={day} library={library} G={G} inp={inp} onChangeOverride={()=>{}} overrideValue={undefined}/>);
    fireEvent.click(screen.getByText('Change'));
    expect(screen.queryByText(/Go back to auto-suggestion/)).toBeNull();
    rerender(<PhotoPicker day={day} library={library} G={G} inp={inp} onChangeOverride={()=>{}} overrideValue="sarnath.jpg"/>);
    // Already open from the click above -- rerender does not remount, so
    // the panel's open/closed state is unaffected by the new props.
    expect(screen.getByText(/Go back to auto-suggestion/)).toBeTruthy();
  });

  it('going back to auto-suggestion clears the override to undefined, re-enabling suggestion', () => {
    const onChangeOverride = setup({ overrideValue: 'sarnath.jpg' });
    fireEvent.click(screen.getByText('Change'));
    fireEvent.click(screen.getByText(/Go back to auto-suggestion/));
    expect(onChangeOverride).toHaveBeenCalledWith(undefined);
  });
});

describe('uploading a new photo, right where it is noticed missing', () => {
  it('defaults the destination field to what the day\u2019s own text suggests', () => {
    setup({});
    fireEvent.click(screen.getByText('Change'));
    expect(screen.getByLabelText('Photo destination').value).toBe('Mahabodhi Temple, Bodhgaya');
  });

  it('refuses to upload with no file selected', async () => {
    setup({});
    fireEvent.click(screen.getByText('Change'));
    fireEvent.click(screen.getByText('Upload & use for this day'));
    await waitFor(() => expect(screen.getByText(/Choose a file first/)).toBeTruthy());
  });

  it('refuses to upload with no destination', async () => {
    const onUpload = vi.fn();
    setup({ onUpload });
    fireEvent.click(screen.getByText('Change'));
    fireEvent.change(screen.getByLabelText('Photo destination'), { target: { value: '' } });
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Choose photo file'), { target: { files: [file] } });
    fireEvent.click(screen.getByText('Upload & use for this day'));
    await waitFor(() => expect(screen.getByText(/destination is required/i)).toBeTruthy());
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('a successful upload calls onUpload and immediately selects the result for this day', async () => {
    const onUpload = vi.fn(async () => ({ photo: { id: 'p9', url: 'new.jpg', destination: 'Agra' }, error: null }));
    const onChangeOverride = setup({ onUpload });
    fireEvent.click(screen.getByText('Change'));
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Choose photo file'), { target: { files: [file] } });
    fireEvent.click(screen.getByText('Upload & use for this day'));
    await waitFor(() => expect(onUpload).toHaveBeenCalled());
    expect(onUpload.mock.calls[0][0]).toMatchObject({ destination: 'Mahabodhi Temple, Bodhgaya' });
    await waitFor(() => expect(onChangeOverride).toHaveBeenCalledWith('new.jpg'));
  });

  it('a failed upload shows the error and does not select anything', async () => {
    const onUpload = vi.fn(async () => ({ photo: null, error: 'bucket not found' }));
    const onChangeOverride = setup({ onUpload });
    fireEvent.click(screen.getByText('Change'));
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Choose photo file'), { target: { files: [file] } });
    fireEvent.click(screen.getByText('Upload & use for this day'));
    await waitFor(() => expect(screen.getByText('bucket not found')).toBeTruthy());
    expect(onChangeOverride).not.toHaveBeenCalled();
  });
});

describe('deleting from the library', () => {
  it('offers a delete control per photo only when onDeleteFromLibrary is given', () => {
    setup({ onDeleteFromLibrary: vi.fn() });
    fireEvent.click(screen.getByText('Change'));
    expect(screen.getByLabelText('Remove Bodhgaya from library')).toBeTruthy();
  });

  it('does not offer delete when onDeleteFromLibrary is not given', () => {
    const onChangeOverride = vi.fn();
    render(<PhotoPicker day={day} library={library} G={G} inp={inp} onChangeOverride={onChangeOverride}/>);
    fireEvent.click(screen.getByText('Change'));
    expect(screen.queryByLabelText('Remove Bodhgaya from library')).toBeNull();
  });

  it('calls onDeleteFromLibrary with the photo id, without also selecting it', async () => {
    const onDeleteFromLibrary = vi.fn(async () => ({ error: null }));
    const onChangeOverride = setup({ onDeleteFromLibrary });
    fireEvent.click(screen.getByText('Change'));
    fireEvent.click(screen.getByLabelText('Remove Bodhgaya from library'));
    await waitFor(() => expect(onDeleteFromLibrary).toHaveBeenCalledWith('p1'));
    expect(onChangeOverride).not.toHaveBeenCalled();
  });
});

describe('empty library and read-only', () => {
  it('says the library is empty rather than showing a blank grid', () => {
    setup({ library: [] });
    fireEvent.click(screen.getByText('Change'));
    expect(screen.getByText(/Library is empty/)).toBeTruthy();
  });

  it('hides every control when read-only', () => {
    setup({ readOnly: true, resolvedUrl: 'bodhgaya.jpg' });
    expect(screen.queryByText('Change')).toBeNull();
  });
});
