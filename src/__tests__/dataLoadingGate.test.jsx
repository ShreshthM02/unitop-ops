import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useState, useEffect } from 'react';

// Mirrors the exact pattern added to UnitopApp.jsx: show a loading state
// until the initial Supabase fetch resolves, instead of rendering hardcoded
// demo data immediately and swapping it out a moment later (a visible
// flash of fake data like "Sharma Family" that's genuinely confusing).
function LoadingGatePattern({ fetchFn }) {
  const [dataLoading, setDataLoading] = useState(true);
  const [queries, setQueries] = useState(['DEMO_Sharma_Family', 'DEMO_Chen_Group']);

  useEffect(() => {
    (async () => {
      try {
        const real = await fetchFn();
        if (real && real.length > 0) setQueries(real);
      } catch (e) {
        // swallowed, same as the real app -- falls back to demo data
      } finally {
        setDataLoading(false);
      }
    })();
  }, []);

  if (dataLoading) return <div>Loading...</div>;
  return <div>{queries.join(',')}</div>;
}

describe('Loading gate prevents the demo-data flash', () => {
  it('shows a loading state, never the demo data, while the fetch is in flight', () => {
    const neverResolves = () => new Promise(() => {}); // simulates an in-flight fetch
    render(<LoadingGatePattern fetchFn={neverResolves}/>);
    expect(screen.getByText('Loading...')).toBeTruthy();
    expect(screen.queryByText(/DEMO_Sharma_Family/)).toBeNull();
  });

  it('shows the real data once the fetch resolves, never showing demo data at any point', async () => {
    const fetchReal = async () => ['REAL_UTQ_2025_041', 'REAL_UTQ_2025_042'];
    render(<LoadingGatePattern fetchFn={fetchReal}/>);
    await waitFor(() => expect(screen.getByText(/REAL_UTQ_2025_041/)).toBeTruthy());
    expect(screen.queryByText(/DEMO_Sharma_Family/)).toBeNull();
  });

  it('falls back to demo data if the fetch genuinely fails, but only after loading resolves (not flashed before)', async () => {
    const fetchFails = async () => { throw new Error('network down'); };
    render(<LoadingGatePattern fetchFn={fetchFails}/>);
    expect(screen.getByText('Loading...')).toBeTruthy(); // not shown instantly
    await waitFor(() => expect(screen.getByText(/DEMO_Sharma_Family/)).toBeTruthy());
  });

  it('resolves the loading state even when the fetch throws (finally always runs)', async () => {
    const fetchFails = async () => { throw new Error('fail'); };
    render(<LoadingGatePattern fetchFn={fetchFails}/>);
    await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull());
  });
});
