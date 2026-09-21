import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CostSheet } from '../components/CostSheet.jsx';

// Real, direct report: "Add Transport Cost" jumps to the top of the
// Cost Sheet. The actual, verified fix for this exact class of bug
// (costSheetTourLeaderSlab.test.jsx) had only ever been wired up to
// "+ Add T/L Slab" -- on inspection, all five "+Add" buttons in this
// file share the identical scroll-jump cause, and four of them
// (Transport, Local Handler, Day, Slab) had simply never been given
// the fix at all. All five now share the one mechanism.

const fakeQuery = { id: 'UTQ-2026-501', tourFileId: 'TF-501', groupName: 'Scroll Fix Sweep Test', nights: 3 };

function expectScrollPreservedAfter(buttonText) {
  render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
  const fieldset = document.querySelector('fieldset');
  Object.defineProperty(fieldset, 'scrollHeight', { value: 5000, configurable: true });
  Object.defineProperty(fieldset, 'clientHeight', { value: 600, configurable: true });
  fieldset.scrollTop = 2000;
  expect(fieldset.scrollTop).toBe(2000);
  fireEvent.click(screen.getByText(buttonText));
  expect(fieldset.scrollTop).toBe(2000);
}

describe('Cost Sheet: every "+Add" button preserves scroll position, not just T/L Slab', () => {
  it('"+ Add Transport" -- the specifically reported one', () => {
    expectScrollPreservedAfter('+ Add Transport');
  });

  it('"+ Add Local Handler"', () => {
    expectScrollPreservedAfter('+ Add Local Handler');
  });

  it('"+ Add Day"', () => {
    expectScrollPreservedAfter('+ Add Day');
  });

  it('"+ Add Slab"', () => {
    expectScrollPreservedAfter('+ Add Slab');
  });
});
