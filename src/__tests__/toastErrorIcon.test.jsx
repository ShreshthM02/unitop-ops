import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Toast } from '../lib/helpers.jsx';

// Real, pre-existing bug caught on review: Toast always prefixed "✓"
// regardless of the message's actual content, so an error toast (e.g.
// "Rate was NOT saved...", "Error: ...") displayed with a checkmark
// as if it had succeeded. Fixed with an explicit type prop, defaulting
// to "success" so every pre-existing call site (none of which passed
// a type) keeps its exact current behavior.

describe('Toast: shows the right icon for the message type', () => {
  it('defaults to a checkmark when no type is given, matching every pre-existing call site', () => {
    render(<Toast msg="Saved" onDone={()=>{}}/>);
    expect(screen.getByText('✓ Saved')).toBeTruthy();
  });

  it('shows a checkmark for an explicit success type', () => {
    render(<Toast msg="Saved" type="success" onDone={()=>{}}/>);
    expect(screen.getByText('✓ Saved')).toBeTruthy();
  });

  it('shows a warning icon, not a checkmark, for an error type', () => {
    render(<Toast msg="Rate was NOT saved: something went wrong" type="error" onDone={()=>{}}/>);
    expect(screen.getByText('⚠ Rate was NOT saved: something went wrong')).toBeTruthy();
    expect(screen.queryByText(/^✓/)).toBeNull();
  });
});
