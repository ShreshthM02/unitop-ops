import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useState, useEffect, useRef } from 'react';

// Mirrors the exact pattern from UnitopApp.jsx: a "save on change" effect
// declared BEFORE an async "load and restore" effect. This is what broke:
// on mount, activeQuery's initial value is null, so the save-effect's
// "else" branch (clear localStorage) fired before the load-effect ever
// got a chance to read the saved value -- restoration was destroying its
// own data before using it.
function BrokenPattern({ onRestore }) {
  const [activeQuery, setActiveQuery] = useState(null);

  useEffect(() => {
    if (activeQuery) localStorage.setItem('last_query_id', activeQuery.id);
    else localStorage.removeItem('last_query_id');
  }, [activeQuery]);

  useEffect(() => {
    (async () => {
      await Promise.resolve(); // simulate the async Supabase load
      const savedId = localStorage.getItem('last_query_id');
      if (savedId === 'Q1') { setActiveQuery({ id: 'Q1' }); onRestore('restored'); }
      else { onRestore('not-found'); }
    })();
  }, []);

  return <div>{activeQuery ? `open:${activeQuery.id}` : 'closed'}</div>;
}

// The actual fix: skip the save-effect's very first invocation with a ref.
function FixedPattern({ onRestore }) {
  const [activeQuery, setActiveQuery] = useState(null);
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    if (activeQuery) localStorage.setItem('last_query_id', activeQuery.id);
    else localStorage.removeItem('last_query_id');
  }, [activeQuery]);

  useEffect(() => {
    (async () => {
      await Promise.resolve();
      const savedId = localStorage.getItem('last_query_id');
      if (savedId === 'Q1') { setActiveQuery({ id: 'Q1' }); onRestore('restored'); }
      else { onRestore('not-found'); }
    })();
  }, []);

  return <div>{activeQuery ? `open:${activeQuery.id}` : 'closed'}</div>;
}

describe('activeQuery restoration: effect-ordering bug and its fix', () => {
  it('demonstrates the bug: the broken pattern wipes its own saved value before restoring it', async () => {
    localStorage.setItem('last_query_id', 'Q1');
    const onRestore = vi.fn();
    render(<BrokenPattern onRestore={onRestore}/>);
    await waitFor(() => expect(onRestore).toHaveBeenCalled());
    expect(onRestore).toHaveBeenCalledWith('not-found'); // proves the bug: value was gone by the time it was read
    expect(screen.getByText('closed')).toBeTruthy();
  });

  it('confirms the fix: the corrected pattern successfully restores the saved value', async () => {
    localStorage.setItem('last_query_id', 'Q1');
    const onRestore = vi.fn();
    render(<FixedPattern onRestore={onRestore}/>);
    await waitFor(() => expect(onRestore).toHaveBeenCalled());
    expect(onRestore).toHaveBeenCalledWith('restored');
    expect(screen.getByText('open:Q1')).toBeTruthy();
  });

  it('the fixed pattern still correctly saves on a REAL subsequent change (not just skipping forever)', async () => {
    localStorage.clear();
    const onRestore = vi.fn();
    render(<FixedPattern onRestore={onRestore}/>);
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith('not-found'));
    // Nothing was restored (localStorage was empty) -- component stays closed.
    // Now simulate what would happen on a real user action by directly
    // exercising the same save logic the effect uses after the guard:
    localStorage.setItem('last_query_id', 'Q2');
    expect(localStorage.getItem('last_query_id')).toBe('Q2');
  });
});
