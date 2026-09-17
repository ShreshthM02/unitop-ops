import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useIsNarrowViewport, MOBILE_SPLIT_BREAKPOINT } from '../lib/responsive.js';

function setWidth(px) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: px });
}

function Probe({ breakpoint }) {
  const isNarrow = useIsNarrowViewport(breakpoint);
  return <div>{isNarrow ? 'narrow' : 'wide'}</div>;
}

describe('useIsNarrowViewport', () => {
  afterEach(() => {
    setWidth(1024); // restore a sane default between tests
  });

  it('reports narrow when the window is already below the breakpoint on mount', () => {
    setWidth(390); // a real phone width
    render(<Probe />);
    expect(screen.getByText('narrow')).toBeInTheDocument();
  });

  it('reports wide when the window is above the breakpoint on mount', () => {
    setWidth(1280);
    render(<Probe />);
    expect(screen.getByText('wide')).toBeInTheDocument();
  });

  it('confirms tablet widths (768-1024) stay "wide" -- this hook must never treat a tablet as narrow', () => {
    setWidth(768);
    render(<Probe />);
    expect(screen.getByText('wide')).toBeInTheDocument();
  });

  it('updates live when the window is resized after mount', () => {
    setWidth(1280);
    render(<Probe />);
    expect(screen.getByText('wide')).toBeInTheDocument();

    act(() => {
      setWidth(400);
      window.dispatchEvent(new Event('resize'));
    });
    expect(screen.getByText('narrow')).toBeInTheDocument();
  });

  it('respects a custom breakpoint argument, independent of the default export', () => {
    setWidth(900);
    render(<Probe breakpoint={950} />);
    expect(screen.getByText('narrow')).toBeInTheDocument();
  });

  it('exports the documented default breakpoint value', () => {
    expect(MOBILE_SPLIT_BREAKPOINT).toBe(640);
  });
});
