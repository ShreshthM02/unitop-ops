import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Real, severe bug found and fixed: `activeConv?.members.find(...)` --
// the ?. safely returns undefined when activeConv is undefined, but
// .find(...) was then called UNCONDITIONALLY on that undefined result,
// throwing outright ("Cannot read properties of undefined"). This
// happens naturally the instant a new DM/group is created: activeConvId
// is set to the new conversation's id synchronously, while the
// conversations list itself only updates once the async reload
// resolves -- a real, unavoidable window where activeConv briefly
// doesn't match anything, crashing the whole chat panel to a blank
// screen. Not caught by any earlier test, since every existing fixture
// always had activeConvId match a real conversation already present
// before render -- and a direct attempt to reproduce the exact timing
// race in an integration test proved too unreliable (React's async
// render errors from a state update don't surface cleanly through
// fireEvent/act in this environment). A direct source check for the
// specific unsafe pattern is the reliable guard here instead.

describe('InAppChat: no unguarded method call chained after an optional-chained property access', () => {
  it('every `x?.y.z(...)` pattern on activeConv-derived values is fully optional-chained, not just the first hop', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/components/InAppChat.jsx'), 'utf8');
    // The exact unsafe pattern that caused the crash: ?. followed later
    // by a bare .method( with no ?. of its own, on the SAME expression.
    const unsafePattern = /\w+\?\.\w+\.(find|map|filter|some|includes|forEach|reduce)\(/g;
    const matches = src.match(unsafePattern) || [];
    expect(matches).toEqual([]);
  });

  it('the specific line that crashed is fixed: activeConv?.members?.find, not activeConv?.members.find', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/components/InAppChat.jsx'), 'utf8');
    expect(src).toContain('activeConv?.members?.find');
    expect(src).not.toContain('activeConv?.members.find');
  });
});
