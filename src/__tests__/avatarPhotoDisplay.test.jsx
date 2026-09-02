import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Avatar } from '../lib/helpers.jsx';

describe('Avatar (3.2): shows a real uploaded photo when one exists, falls back to color + initials otherwise', () => {
  it('renders an <img> when avatarUrl is set', () => {
    const { container } = render(<Avatar user={{ name: 'Priya Rao', color: '#1A5276', avatarUrl: 'https://x/staff-avatars/1/123.jpg' }} size={40} />);
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img.src).toBe('https://x/staff-avatars/1/123.jpg');
    expect(container.textContent).not.toContain('PR'); // no initials text alongside the photo
  });

  it('also recognizes the raw snake_case field (avatar_url), since staff rows loaded straight from the DB use that casing', () => {
    const { container } = render(<Avatar user={{ name: 'Priya Rao', avatar_url: 'https://x/staff-avatars/1/456.jpg' }} size={40} />);
    expect(container.querySelector('img').src).toBe('https://x/staff-avatars/1/456.jpg');
  });

  it('falls back to color + initials when no photo has been uploaded', () => {
    const { container } = render(<Avatar user={{ name: 'Priya Rao', color: '#1A5276' }} size={40} />);
    expect(container.querySelector('img')).toBeFalsy();
    expect(container.textContent).toContain('PR');
  });

  it('falls back correctly with no user at all', () => {
    const { container } = render(<Avatar size={40} />);
    expect(container.querySelector('img')).toBeFalsy();
    expect(container.textContent).toContain('U');
  });
});
