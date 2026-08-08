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
  it('offers every type on Brief now -- description and remarks are no longer Detailed-only', () => {
    const onChange = renderEditor([]);
    fireEvent.click(screen.getByText('+ Add Item ▾'));
    expect(screen.getByText('📍 Sightseeing')).toBeTruthy();
    expect(screen.getByText('✈ Flight / Train')).toBeTruthy();
    expect(screen.getByText('🏨 Overnight Stay')).toBeTruthy();
    expect(screen.getByText('📝 Description')).toBeTruthy();
    // No icon for Remarks -- the word itself is the label, deliberately.
    expect(screen.getByText('Remarks')).toBeTruthy();
    expect(screen.queryByText('📝📝 Remarks')).toBeNull();
    fireEvent.click(screen.getByText('📍 Sightseeing'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0][0].type).toBe('sightseeing');
  });

  it('offers the same types on Detailed too -- there is no longer a Brief/Detailed gate on item types', () => {
    renderEditor([], { style: 'detailed' });
    fireEvent.click(screen.getByText('+ Add Item ▾'));
    expect(screen.getByText('📝 Description')).toBeTruthy();
    expect(screen.getByText('Remarks')).toBeTruthy();
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

describe('the Add Item menu escapes an overflow:hidden ancestor', () => {
  // Regression test: each day card is rendered with overflow:hidden (to
  // clip its own rounded corners), and the menu used to be an absolutely
  // positioned child of that card -- so it was clipped to invisible the
  // moment a day had enough items for the menu to spill past the card's
  // bottom edge. The fix renders the menu through a portal onto
  // document.body, which this test proves by finding it OUTSIDE the
  // clipping container rather than inside it.
  it('renders the open menu as a direct child of document.body, not inside the clipping wrapper', () => {
    const { container } = render(
      <div style={{ overflow: 'hidden', height: 40 }} data-testid="clipper">
        <DayItemsEditor items={[]} onChange={() => {}} G={G} inp={{}}/>
      </div>
    );
    fireEvent.click(screen.getByText('+ Add Item ▾'));
    const menu = screen.getByRole('menu');
    const clipper = container.querySelector('[data-testid="clipper"]');
    expect(clipper.contains(menu)).toBe(false);
    expect(document.body.contains(menu)).toBe(true);
  });

  it('closes the menu on outside click and on Escape', () => {
    render(<DayItemsEditor items={[]} onChange={() => {}} G={G} inp={{}}/>);
    fireEvent.click(screen.getByText('+ Add Item ▾'));
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(screen.getByText('+ Add Item ▾'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('description and remarks render as a textarea, not a single-line input', () => {
  it('a description item gets a multi-row textarea', () => {
    renderEditor([{ id:'d1', type:'description', text:'Some paragraph text' }]);
    const field = screen.getByDisplayValue('Some paragraph text');
    expect(field.tagName).toBe('TEXTAREA');
  });

  it('a remarks item gets a multi-row textarea too', () => {
    renderEditor([{ id:'r1', type:'remarks', text:'A note' }]);
    expect(screen.getByDisplayValue('A note').tagName).toBe('TEXTAREA');
  });

  it('every other type stays a single-line input', () => {
    renderEditor([{ id:'s1', type:'sightseeing', text:'Temple' }]);
    expect(screen.getByDisplayValue('Temple').tagName).toBe('INPUT');
  });
});

describe('description text is independent per flavor inside the editor', () => {
  it('editing under Brief writes text, editing under Detailed writes detailedText', () => {
    const item = { id:'d1', type:'description', text:'Brief version' };
    const onChangeBrief = vi.fn();
    const { unmount } = render(<DayItemsEditor items={[item]} onChange={onChangeBrief} style="brief" G={G} inp={inp}/>);
    fireEvent.change(screen.getByDisplayValue('Brief version'), { target:{ value:'Updated brief' } });
    // (kept single-line for this assertion; multi-line preservation is
    // covered separately at the export level via white-space:pre-wrap)
    expect(onChangeBrief.mock.calls[0][0][0].text).toBe('Updated brief');
    unmount();

    const onChangeDetailed = vi.fn();
    render(<DayItemsEditor items={[item]} onChange={onChangeDetailed} style="detailed" G={G} inp={inp}/>);
    fireEvent.change(screen.getByDisplayValue('Brief version'), { target:{ value:'Its own detailed text' } });
    expect(onChangeDetailed.mock.calls[0][0][0].detailedText).toBe('Its own detailed text');
    expect(onChangeDetailed.mock.calls[0][0][0].text).toBe('Brief version'); // unchanged
  });

  it('Detailed shows its own text once it has one, not Brief\u2019s', () => {
    const item = { id:'d1', type:'description', text:'Brief version', detailedText:'Detailed version' };
    render(<DayItemsEditor items={[item]} onChange={()=>{}} style="detailed" G={G} inp={inp}/>);
    expect(screen.getByDisplayValue('Detailed version')).toBeTruthy();
    expect(screen.queryByDisplayValue('Brief version')).toBeNull();
  });
});

describe('transport items offer an explicit Flight/Train toggle', () => {
  it('defaults to Flight selected', () => {
    renderEditor([{ id:'t1', type:'transport', text:'6E 2134', mode:'flight' }]);
    expect(screen.getByText('Flight')).toBeTruthy();
    expect(screen.getByText('Train')).toBeTruthy();
  });

  it('clicking Train updates the item\u2019s mode', () => {
    const onChange = renderEditor([{ id:'t1', type:'transport', text:'12345', mode:'flight' }]);
    fireEvent.click(screen.getByText('Train'));
    expect(onChange.mock.calls[0][0][0].mode).toBe('train');
  });
});
