import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { computePanelPosition } from '../lib/PlacePicker.jsx';
import { PhotoPicker } from '../lib/PhotoPicker.jsx';
import { normalizePhotoList, resolveDayPhotos, suggestPhotosForDay, MAX_DAY_PHOTOS } from '../lib/photoLibrary.js';
import { G } from '../lib/constants.js';

describe('place picker panel stays on screen', () => {
  const base = { panelHeight: 300, panelWidth: 280, viewportW: 1200, viewportH: 800 };
  it('opens below the link when there is room', () => {
    const r = computePanelPosition({ ...base, anchor: { top: 100, bottom: 120, left: 50 } });
    expect(r.top).toBe(124);
  });
  it('flips above when the link is low and above has room', () => {
    const r = computePanelPosition({ ...base, anchor: { top: 650, bottom: 670, left: 50 } });
    expect(r.top).toBe(650 - 4 - 300);
  });
  it('clamps inside the viewport when neither side has room', () => {
    const r = computePanelPosition({ ...base, panelHeight: 700, anchor: { top: 400, bottom: 420, left: 50 } });
    expect(r.top).toBeGreaterThanOrEqual(8);
    expect(r.top + 700).toBeLessThanOrEqual(800 - 8);
  });
  it('never overflows horizontally and caps its height', () => {
    const r = computePanelPosition({ ...base, panelHeight: 2000, anchor: { top: 100, bottom: 120, left: 1190 } });
    expect(r.left).toBe(1200 - 280 - 8);
    expect(r.maxHeight).toBe(800 - 16);
  });
});

describe('multi-photo model', () => {
  it('normalizePhotoList accepts strings, arrays, null; dedupes and caps at 3', () => {
    expect(normalizePhotoList('a')).toEqual(['a']);
    expect(normalizePhotoList(null)).toEqual([]);
    expect(normalizePhotoList(undefined)).toEqual([]);
    expect(normalizePhotoList(['a', 'a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c']);
    expect(MAX_DAY_PHOTOS).toBe(3);
  });
  const photos = [
    { id: 1, destination: 'Bodhgaya', label: '', url: 'b1.jpg' },
    { id: 2, destination: 'Bodhgaya', label: '', url: 'b2.jpg' },
    { id: 3, destination: 'Sarnath', label: '', url: 's1.jpg' },
  ];
  const days = [{ id: 'd1', items: [{ type: 'sightseeing', text: 'Bodhgaya' }] }, { id: 'd2', items: [] }];
  it('suggests several library matches for a day', () => {
    expect(suggestPhotosForDay(days[0], photos, 3)).toEqual(expect.arrayContaining(['b1.jpg', 'b2.jpg']));
  });
  it('override array wins, null means none, legacy string is one', () => {
    const r = resolveDayPhotos(days, photos, { d1: ['s1.jpg'], d2: null });
    expect(r.d1).toEqual(['s1.jpg']);
    expect(r.d2).toBeUndefined();
    expect(resolveDayPhotos(days, photos, { d1: 's1.jpg' }).d1).toEqual(['s1.jpg']);
  });
  it('no override auto-suggests', () => {
    expect(resolveDayPhotos(days, photos, {}).d1.length).toBeGreaterThan(0);
  });
});

describe('PhotoPicker multi mode', () => {
  const library = [
    { id: 'p1', destination: 'A', label: '', url: 'a.jpg' },
    { id: 'p2', destination: 'B', label: '', url: 'b.jpg' },
    { id: 'p3', destination: 'C', label: '', url: 'c.jpg' },
    { id: 'p4', destination: 'D', label: '', url: 'd.jpg' },
  ];
  const setup = (props) => {
    const onChangeOverride = vi.fn();
    render(<PhotoPicker day={{ id: 'd', items: [] }} library={library} G={G} inp={{}} max={3}
      onChangeOverride={onChangeOverride} {...props} />);
    fireEvent.click(screen.getByText('Change'));
    return onChangeOverride;
  };
  it('clicking a library photo adds it after the current ones', () => {
    const cb = setup({ resolvedUrls: ['a.jpg'], overrideValue: undefined });
    fireEvent.click(screen.getByAltText('B'));
    expect(cb).toHaveBeenCalledWith(['a.jpg', 'b.jpg']);
  });
  it('clicking a selected photo removes it; removing the last stores null', () => {
    const cb = setup({ resolvedUrls: ['a.jpg'], overrideValue: ['a.jpg'] });
    fireEvent.click(screen.getByAltText('A'));
    expect(cb).toHaveBeenCalledWith(null);
  });
  it('does not add a fourth photo', () => {
    const cb = setup({ resolvedUrls: ['a.jpg', 'b.jpg', 'c.jpg'], overrideValue: ['a.jpg', 'b.jpg', 'c.jpg'] });
    fireEvent.click(screen.getByAltText('D'));
    expect(cb).not.toHaveBeenCalled();
  });
  it('shows the count in the status', () => {
    setup({ resolvedUrls: ['a.jpg', 'b.jpg'], overrideValue: ['a.jpg', 'b.jpg'] });
    expect(screen.getByText('Chosen (2 of 3)')).toBeTruthy();
  });
  it('Remove photo N button removes that photo', () => {
    const cb = setup({ resolvedUrls: ['a.jpg', 'b.jpg'], overrideValue: ['a.jpg', 'b.jpg'] });
    fireEvent.click(screen.getByLabelText('Remove photo 1'));
    expect(cb).toHaveBeenCalledWith(['b.jpg']);
  });
});
