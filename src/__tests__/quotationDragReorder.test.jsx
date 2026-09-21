import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { reorderArray } from '../lib/utils.js';
import QuotationGenerator from '../components/QuotationGenerator.jsx';

// Direct request: "Cost slabs, inclusions and exclusions and other
// concerned rows to be draggable to reorder in quotation." Same
// drag-to-reorder pattern already established in ServicesList.jsx.
//
// The actual reorder algorithm (reorderArray, shared across every
// drag-to-reorder list in the app) is tested directly here as a pure
// function, rather than through a simulated jsdom drag-and-drop
// sequence: jsdom does not implement the HTML5 Drag and Drop API at
// all, and fireEvent-simulated drag events are a well-documented,
// environment-specific unreliability across React/testing-library
// versions. Testing the real logic directly is the more reliable
// signal; a live drag should still be spot-checked in the browser.

const fakeQuery = { id: 'UTQ-2026-1900', groupName: 'Drag Reorder Test', destination: 'Agra', nights: 3 };
const fakeTemplate = { includes: ['First include', 'Second include'], excludes: [], monuments: [], showMonuments: true, greeting: '', openingLine: '', closingLine: '', signoff: '', monumentNote: '' };

describe('reorderArray: the shared drag-to-reorder logic', () => {
  it('moves an item from one index to another, shifting everything between', () => {
    expect(reorderArray(['A','B','C','D'], 3, 0)).toEqual(['D','A','B','C']);
    expect(reorderArray(['A','B','C','D'], 0, 3)).toEqual(['B','C','D','A']);
    expect(reorderArray(['A','B','C'], 2, 1)).toEqual(['A','C','B']);
  });

  it('is a no-op when dropped on its own position', () => {
    const arr = ['A','B','C'];
    expect(reorderArray(arr, 1, 1)).toBe(arr);
  });

  it('is a no-op when no drag was actually in progress (fromIndex null/undefined)', () => {
    const arr = ['A','B','C'];
    expect(reorderArray(arr, null, 1)).toBe(arr);
    expect(reorderArray(arr, undefined, 1)).toBe(arr);
  });

  it('does not mutate the original array', () => {
    const arr = ['A','B','C'];
    reorderArray(arr, 0, 2);
    expect(arr).toEqual(['A','B','C']);
  });
});

describe('Quotation: slab and includes/excludes rows are wired up as draggable', () => {
  it('slab rows are draggable, with a visible drag handle, when not read-only', () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    const row = screen.getAllByDisplayValue(/Pax Paying/)[0].closest('div[draggable]');
    expect(row.getAttribute('draggable')).toBe('true');
    expect(screen.getAllByTitle('Drag to reorder').length).toBeGreaterThan(0);
  });

  it('includes/excludes rows are draggable when not read-only', () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    const row = screen.getByDisplayValue('First include').closest('div[draggable]');
    expect(row.getAttribute('draggable')).toBe('true');
  });

  it('nothing is draggable when the quotation is read-only', () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}} readOnly={true}/>);
    const row = screen.getByDisplayValue('First include').closest('div');
    expect(row.getAttribute('draggable')).toBe('false');
    expect(screen.queryByTitle('Drag to reorder')).toBeNull();
  });
});
