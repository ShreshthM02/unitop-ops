import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DayItemsEditor } from '../lib/DayItemsEditor.jsx';
import { G } from '../lib/constants.js';

const inp = {};
const renderEditor = (items, extra = {}) => {
  const onChange = vi.fn();
  render(<DayItemsEditor items={items} onChange={onChange} G={G} inp={inp} {...extra}/>);
  return onChange;
};

describe('1.7/1.9 DayItemsEditor', () => {
  it('offers the four types on Brief and adds the chosen one', () => {
    const onChange = renderEditor([]);
    fireEvent.click(screen.getByText('+ Add Item ▾'));
    expect(screen.getByText('📍 Sightseeing')).toBeTruthy();
    expect(screen.getByText('✈ Flight / Train')).toBeTruthy();
    expect(screen.getByText('🏨 Overnight Stay')).toBeTruthy();
    expect(screen.queryByText('📝 Description')).toBeNull(); // Detailed only
    fireEvent.click(screen.getByText('📍 Sightseeing'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0][0].type).toBe('sightseeing');
  });

  it('1.12: Detailed additionally offers Description', () => {
    renderEditor([], { style: 'detailed' });
    fireEvent.click(screen.getByText('+ Add Item ▾'));
    expect(screen.getByText('📝 Description')).toBeTruthy();
  });

  it('shows only the fields a type actually has -- distance/time on route, not on sightseeing', () => {
    renderEditor([{ id:'a', type:'route', text:'A - B', distance:'10 km', time:'1 hr' }]);
    expect(screen.getByDisplayValue('10 km')).toBeTruthy();
    expect(screen.getByDisplayValue('1 hr')).toBeTruthy();
  });

  it('does not render distance/time for a sightseeing item', () => {
    renderEditor([{ id:'a', type:'sightseeing', text:'Taj Mahal' }]);
    expect(screen.getByDisplayValue('Taj Mahal')).toBeTruthy();
    expect(screen.queryByPlaceholderText('65 km')).toBeNull();
    expect(screen.queryByPlaceholderText('1.5 hrs')).toBeNull();
  });

  it('reorders via the up/down controls, which are the only route on touch devices', () => {
    const items = [{id:'a',type:'route'},{id:'b',type:'sightseeing'},{id:'c',type:'stay'}];
    const onChange = renderEditor(items);
    fireEvent.click(screen.getAllByLabelText('Move item down')[0]);
    expect(onChange.mock.calls[0][0].map(i=>i.id)).toEqual(['b','a','c']);
  });

  it('disables up on the first item and down on the last, so order cannot run off the ends', () => {
    renderEditor([{id:'a',type:'route'},{id:'b',type:'stay'}]);
    expect(screen.getAllByLabelText('Move item up')[0].disabled).toBe(true);
    expect(screen.getAllByLabelText('Move item down')[1].disabled).toBe(true);
  });

  it('reorders on a drag-and-drop gesture', () => {
    const items = [{id:'a',type:'route'},{id:'b',type:'sightseeing'},{id:'c',type:'stay'}];
    const onChange = renderEditor(items);
    const rows = document.querySelectorAll('[draggable="true"]');
    fireEvent.dragStart(rows[2]);
    fireEvent.dragOver(rows[0]);
    fireEvent.drop(rows[0]);
    expect(onChange.mock.calls[0][0].map(i=>i.id)).toEqual(['c','a','b']);
  });

  it('removes an item', () => {
    const onChange = renderEditor([{id:'a',type:'route'},{id:'b',type:'stay'}]);
    fireEvent.click(screen.getAllByText('✕')[0]);
    expect(onChange.mock.calls[0][0].map(i=>i.id)).toEqual(['b']);
  });

  it('editing a field reports the updated item without disturbing the others', () => {
    const onChange = renderEditor([{id:'a',type:'route',text:''},{id:'b',type:'stay',text:'Hotel'}]);
    fireEvent.change(screen.getByPlaceholderText('e.g. Leh – Alchi – Leh'), { target:{ value:'Delhi - Agra' } });
    const next = onChange.mock.calls[0][0];
    expect(next[0].text).toBe('Delhi - Agra');
    expect(next[1].text).toBe('Hotel');
  });

  it('readOnly hides every mutating control', () => {
    renderEditor([{id:'a',type:'route'}], { readOnly: true });
    expect(screen.queryByText('+ Add Item ▾')).toBeNull();
    expect(screen.queryByLabelText('Move item up')).toBeNull();
    expect(screen.queryByText('✕')).toBeNull();
  });

  it('shows a helpful empty state rather than a bare gap', () => {
    renderEditor([]);
    expect(screen.getByText(/No items yet/)).toBeTruthy();
  });
});
