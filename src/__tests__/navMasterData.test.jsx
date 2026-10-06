import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Sidebar structure is declared inline in UnitopApp; assert it from source.
const src = fs.readFileSync(path.resolve(process.cwd(), 'src/components/UnitopApp.jsx'), 'utf-8');
const navBlock = src.slice(src.indexOf('const NAV = ['), src.indexOf('const VIEW_TITLES'));
const section = (name) => {
  const start = navBlock.indexOf(`section:"${name}"`);
  const end = navBlock.indexOf('{section:', start + 1);
  return navBlock.slice(start, end === -1 ? undefined : end);
};

describe('sidebar: Master Data', () => {
  it('Series now lives under Master Data, not Work', () => {
    expect(section('Master Data')).toContain('id:"series"');
    expect(section('Work')).not.toContain('id:"series"');
  });
  it('Fleet is a Master Data entry and renders the Fleet screen', () => {
    expect(section('Master Data')).toContain('id:"fleet"');
    expect(src).toContain('view==="fleet" && <FleetMaster');
  });
  it('both have a page title', () => {
    expect(src).toMatch(/VIEW_TITLES=\{[^}]*fleet:"Fleet"[^}]*series:"Series"/);
  });
});
