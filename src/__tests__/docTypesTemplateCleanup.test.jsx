import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DOC_TYPES, DEFAULT_DOC_TEMPLATES } from '../lib/constants.js';
import TemplatesHub from '../components/TemplatesHub.jsx';

afterEach(() => cleanup());

describe('DOC_TYPES (Templates section): stale "Monument / Activity List" entry removed -- that document does not exist as a real document', () => {
  it('does not include a "monument" doc type entry', () => {
    expect(DOC_TYPES.find(d => d.id === 'monument')).toBeUndefined();
  });

  it('does not include the "Monument / Activity List" label anywhere', () => {
    expect(DOC_TYPES.some(d => d.label.includes('Monument'))).toBe(false);
  });

  it('still includes every other real document type, untouched by the removal', () => {
    const ids = DOC_TYPES.map(d => d.id);
    expect(ids).toEqual(expect.arrayContaining([
      'quotation', 'costsheet', 'brief_itin', 'detail_itin', 'mealplan',
      'tourbriefing', 'exchange', 'proforma', 'taxinvoice', 'receipt',
    ]));
    expect(ids.length).toBe(10);
  });
});

describe('TemplatesHub: clicking an "Available Placeholders" token (previously did nothing at all, no click handler)', () => {
  const setup = () => {
    render(
      <TemplatesHub
        docTemplates={DEFAULT_DOC_TEMPLATES}
        onSaveDocTemplates={() => {}}
        docSettings={{}}
        setDocSettings={() => {}}
      />
    );
  };

  it('clicking the Query ID token ({id}) inserts it into the Filename Pattern field', () => {
    setup();
    const inputs = screen.getAllByDisplayValue(/\{prefix\}/).filter(el => el.tagName === 'INPUT');
    expect(inputs).toHaveLength(1);
    const before = inputs[0].value;
    fireEvent.click(screen.getByText('{id}'));
    expect(inputs[0].value).toBe(before + '{id}');
  });

  it('clicking the Tour File token ({tourfile}) inserts it into the Filename Pattern field', () => {
    setup();
    const inputs = screen.getAllByDisplayValue(/\{prefix\}/).filter(el => el.tagName === 'INPUT');
    const before = inputs[0].value;
    fireEvent.click(screen.getByText('{tourfile}'));
    expect(inputs[0].value).toBe(before + '{tourfile}');
  });

  it('clicking multiple tokens appends each one in sequence, not replacing the previous', () => {
    setup();
    const inputs = screen.getAllByDisplayValue(/\{prefix\}/).filter(el => el.tagName === 'INPUT');
    const before = inputs[0].value;
    fireEvent.click(screen.getByText('{id}'));
    fireEvent.click(screen.getByText('{year}'));
    expect(inputs[0].value).toBe(before + '{id}{year}');
  });
});
