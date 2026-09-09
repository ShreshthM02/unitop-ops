import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { exportAllData, saveBackupInfo, getLastBackupInfo, runHealthCheck } from '../lib/maintenance.js';

// New Maintenance feature (admin-only): a real backup export the app
// can run on itself, and a real, data-level health check -- scoped
// deliberately to what a RUNNING app can genuinely inspect about
// itself (real data problems), not things that need a developer with
// source-code/schema-catalog access (RLS policies, orphaned Supabase
// objects nothing in code references, etc) -- those stay a separate,
// different kind of check.

function makeDb(tables = {}) {
  return {
    from: (table) => {
      let conditions = [];
      const resolve = () => {
        let rows = tables[table] || [];
        conditions.forEach(([col, val]) => { rows = rows.filter(r => r[col] === val); });
        return { data: rows, error: null };
      };
      const builder = {
        select: () => builder,
        eq: (col, val) => { conditions = [...conditions, [col, val]]; return builder; },
        order: () => builder,
        upsert: async (row) => { tables[table] = tables[table] || []; const idx = tables[table].findIndex(r => r.key === row.key); if (idx >= 0) tables[table][idx] = row; else tables[table].push(row); return { error: null }; },
        then: (res) => res(resolve()),
      };
      return builder;
    },
  };
}

describe('exportAllData', () => {
  it('exports real data into a downloadable workbook and records when it happened', async () => {
    const db = makeDb({
      queries: [{ id: 'q1', groupName: 'Test' }],
      agents: [{ id: 'a1', company: 'Test Agent' }],
      staff: [{ id: 's1', name: 'Priya', password_hash: 'secret-hash', session_token: 'secret-token', role: 'admin', active: true }],
    });
    const clickSpy = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreateElement(tag);
      if (tag === 'a') el.click = clickSpy;
      return el;
    });
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const result = await exportAllData(db, { name: 'Priya' });
    expect(result.success).toBe(true);
    expect(clickSpy).toHaveBeenCalled(); // a real download was triggered
    expect(result.summary.find(s => s.sheet === 'Queries').rows).toBe(1);
    expect(result.summary.find(s => s.sheet === 'Staff').rows).toBe(1);

    // The backup timestamp was actually recorded
    const info = await getLastBackupInfo(db);
    expect(info.by).toBe('Priya');
    expect(info.at).toBeTruthy();

    createElementSpy.mockRestore(); createObjectURLSpy.mockRestore(); revokeObjectURLSpy.mockRestore();
  });

  it('never includes staff credentials in the export, even though the raw staff table has them', async () => {
    const db = makeDb({ staff: [{ id: 's1', name: 'Priya', password_hash: 'REAL-SECRET-HASH', session_token: 'REAL-SECRET-TOKEN', role: 'admin' }] });
    const origCreateElement = document.createElement.bind(document); // captured BEFORE mocking, so the mock doesn't call itself
    vi.spyOn(document, 'createElement').mockImplementation((tag) => { const el = origCreateElement(tag); if (tag === 'a') el.click = vi.fn(); return el; });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    // Intercept the actual workbook content to inspect what got written,
    // not just that SOME export happened.
    let capturedRows = null;
    const ExcelJSReal = (await import('exceljs')).default;
    const OrigWorkbook = ExcelJSReal.Workbook;
    vi.spyOn(ExcelJSReal, 'Workbook').mockImplementation(function () {
      const wb = new OrigWorkbook();
      const origAdd = wb.addWorksheet.bind(wb);
      wb.addWorksheet = (name) => {
        const ws = origAdd(name);
        if (name === 'Staff') {
          const origAddRow = ws.addRow.bind(ws);
          ws.addRow = (rowArr) => { capturedRows = capturedRows || []; capturedRows.push(rowArr); return origAddRow(rowArr); };
        }
        return ws;
      };
      return wb;
    });

    await exportAllData(db, { name: 'Priya' });
    const flatText = JSON.stringify(capturedRows || []);
    expect(flatText).not.toContain('REAL-SECRET-HASH');
    expect(flatText).not.toContain('REAL-SECRET-TOKEN');
    vi.restoreAllMocks();
  });

  it('does not crash when a table is genuinely empty', async () => {
    const db = makeDb({});
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => { const el = origCreateElement(tag); if (tag === 'a') el.click = vi.fn(); return el; });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const result = await exportAllData(db, { name: 'Priya' });
    expect(result.success).toBe(true);
    vi.restoreAllMocks();
  });
});

describe('getLastBackupInfo / saveBackupInfo', () => {
  it('returns null when nothing has ever been backed up', async () => {
    const db = makeDb({});
    expect(await getLastBackupInfo(db)).toBeNull();
  });

  it('round-trips real backup info correctly', async () => {
    const db = makeDb({});
    await saveBackupInfo(db, { by: 'Priya', at: '2026-09-08T10:00:00Z', summary: [] });
    const info = await getLastBackupInfo(db);
    expect(info.by).toBe('Priya');
  });
});

describe('runHealthCheck', () => {
  it('reports a connectivity error and stops early if the database is unreachable', async () => {
    const db = { from: () => ({ select: () => ({ then: (res) => res({ data: null, error: { message: 'network down' } }) }) }) };
    const report = await runHealthCheck(db);
    expect(report.results).toHaveLength(1);
    expect(report.results[0].status).toBe('error');
  });

  it('flags a real orphaned cost sheet -- one pointing at a query that no longer exists', async () => {
    const db = makeDb({
      app_settings: [],
      queries: [{ id: 'q1' }],
      cost_sheets: [{ id: 'cs1', query_id: 'q1' }, { id: 'cs2', query_id: 'DELETED-QUERY' }],
      quotations: [], tour_execution: [], payment_incoming: [], payment_outgoing: [], invoices: [], exchange_orders: [],
      staff: [{ id: 's1', role: 'admin', active: true, deleted_at: null }],
      chat_conversations: [], chat_conversation_members: [],
    });
    const report = await runHealthCheck(db);
    const check = report.results.find(r => r.id === 'orphan_cost_sheets');
    expect(check.status).toBe('warning');
    expect(check.detail).toContain('1');
  });

  it('passes cleanly when there are genuinely no orphans', async () => {
    const db = makeDb({
      app_settings: [], queries: [{ id: 'q1' }],
      cost_sheets: [{ id: 'cs1', query_id: 'q1' }],
      quotations: [], tour_execution: [], payment_incoming: [], payment_outgoing: [], invoices: [], exchange_orders: [],
      staff: [{ id: 's1', role: 'admin', active: true, deleted_at: null }],
      chat_conversations: [], chat_conversation_members: [],
    });
    const report = await runHealthCheck(db);
    expect(report.results.find(r => r.id === 'orphan_cost_sheets').status).toBe('ok');
  });

  it('flags a foreign-currency payment genuinely missing its INR amount', async () => {
    const db = makeDb({
      app_settings: [], queries: [{ id: 'q1' }], cost_sheets: [], quotations: [], tour_execution: [],
      payment_incoming: [{ id: 'p1', query_id: 'q1', in_currency: 'USD', amount_inr: null }],
      payment_outgoing: [], invoices: [], exchange_orders: [],
      staff: [{ id: 's1', role: 'admin', active: true, deleted_at: null }],
      chat_conversations: [], chat_conversation_members: [],
    });
    const report = await runHealthCheck(db);
    const check = report.results.find(r => r.id === 'fc_incomplete');
    expect(check.status).toBe('warning');
  });

  it('does not flag an INR payment for a missing amount_inr -- that field is only meaningful for foreign currency', async () => {
    const db = makeDb({
      app_settings: [], queries: [{ id: 'q1' }], cost_sheets: [], quotations: [], tour_execution: [],
      payment_incoming: [{ id: 'p1', query_id: 'q1', in_currency: 'INR', amount_inr: null }],
      payment_outgoing: [], invoices: [], exchange_orders: [],
      staff: [{ id: 's1', role: 'admin', active: true, deleted_at: null }],
      chat_conversations: [], chat_conversation_members: [],
    });
    const report = await runHealthCheck(db);
    expect(report.results.find(r => r.id === 'fc_incomplete').status).toBe('ok');
  });

  it('flags the genuine risk of zero active admin accounts', async () => {
    const db = makeDb({
      app_settings: [], queries: [], cost_sheets: [], quotations: [], tour_execution: [],
      payment_incoming: [], payment_outgoing: [], invoices: [], exchange_orders: [],
      staff: [{ id: 's1', role: 'admin', active: false, deleted_at: null }, { id: 's2', role: 'sales', active: true, deleted_at: null }],
      chat_conversations: [], chat_conversation_members: [],
    });
    const report = await runHealthCheck(db);
    const check = report.results.find(r => r.id === 'admin_exists');
    expect(check.status).toBe('error'); // a real lockout risk, escalated above a warning
  });

  it('flags a tour genuinely stuck in Operations well past its end date, but not one that just recently ended', async () => {
    const longAgo = new Date(); longAgo.setDate(longAgo.getDate() - 40);
    const recent = new Date(); recent.setDate(recent.getDate() - 3);
    const db = makeDb({
      app_settings: [],
      queries: [
        { id: 'q1', status: 'operations', travel_date_to: longAgo.toISOString().slice(0,10), cancelled: false },
        { id: 'q2', status: 'operations', travel_date_to: recent.toISOString().slice(0,10), cancelled: false },
      ],
      cost_sheets: [], quotations: [], tour_execution: [], payment_incoming: [], payment_outgoing: [], invoices: [], exchange_orders: [],
      staff: [{ id: 's1', role: 'admin', active: true, deleted_at: null }],
      chat_conversations: [], chat_conversation_members: [],
    });
    const report = await runHealthCheck(db);
    const check = report.results.find(r => r.id === 'stale_ops');
    expect(check.status).toBe('warning');
    expect(check.detail).toContain('1'); // only the genuinely stale one, not the recently-ended one
  });

  it('reflects a real recent backup as healthy, and flags none-ever as a warning', async () => {
    const dbWithBackup = makeDb({
      app_settings: [{ key: 'last_backup', value: { by: 'Priya', at: new Date().toISOString(), summary: [] } }],
      queries: [], cost_sheets: [], quotations: [], tour_execution: [], payment_incoming: [], payment_outgoing: [], invoices: [], exchange_orders: [],
      staff: [{ id: 's1', role: 'admin', active: true, deleted_at: null }],
      chat_conversations: [], chat_conversation_members: [],
    });
    const report1 = await runHealthCheck(dbWithBackup);
    expect(report1.results.find(r => r.id === 'backup_recency').status).toBe('ok');

    const dbNoBackup = makeDb({
      app_settings: [], queries: [], cost_sheets: [], quotations: [], tour_execution: [], payment_incoming: [], payment_outgoing: [], invoices: [], exchange_orders: [],
      staff: [{ id: 's1', role: 'admin', active: true, deleted_at: null }],
      chat_conversations: [], chat_conversation_members: [],
    });
    const report2 = await runHealthCheck(dbNoBackup);
    expect(report2.results.find(r => r.id === 'backup_recency').status).toBe('warning');
  });
});

describe('MaintenancePanel UI', () => {
  it('renders all three tabs, defaulting to Backup', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: makeDb({}), realtimeClient: null }));
    vi.resetModules();
    const { default: MaintenancePanel } = await import('../components/MaintenancePanel.jsx');
    render(<MaintenancePanel currentUser={{ id: 's1', name: 'Priya' }} />);
    expect(screen.getByText(/Backup & Export/)).toBeTruthy();
    expect(screen.getByText(/Health Check/)).toBeTruthy();
    expect(screen.getByText(/User Manual/)).toBeTruthy();
    expect(screen.getByText(/Export Everything Now/)).toBeTruthy(); // Backup tab shown by default
    vi.doUnmock('../lib/supabase.js');
  });

  it('switching to the Health Check tab shows its own real Run button, not the Backup one', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: makeDb({}), realtimeClient: null }));
    vi.resetModules();
    const { default: MaintenancePanel } = await import('../components/MaintenancePanel.jsx');
    render(<MaintenancePanel currentUser={{ id: 's1', name: 'Priya' }} />);
    fireEvent.click(screen.getByText(/🩺 Health Check/));
    expect(screen.getByText(/Run Health Check/)).toBeTruthy();
    expect(screen.queryByText(/Export Everything Now/)).toBeFalsy();
  });

  it('the User Manual tab shows real content and an export option', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: makeDb({}), realtimeClient: null }));
    vi.resetModules();
    const { default: MaintenancePanel } = await import('../components/MaintenancePanel.jsx');
    render(<MaintenancePanel currentUser={{ id: 's1', name: 'Priya' }} />);
    fireEvent.click(screen.getByText(/📖 User Manual/));
    expect(screen.getByRole('button', { name: /Export to PDF/ })).toBeTruthy();
    expect(screen.getByText(/Getting Started/)).toBeTruthy(); // real manual content, not a placeholder
    vi.doUnmock('../lib/supabase.js');
  });
});

describe('Drive root folder setup utility (Backup tab)', () => {
  it('stays collapsed by default, matching the "only needed once" framing', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: makeDb({}), realtimeClient: null }));
    vi.resetModules();
    const { default: MaintenancePanel } = await import('../components/MaintenancePanel.jsx');
    render(<MaintenancePanel currentUser={{ id: 's1', name: 'Priya' }} />);
    expect(screen.getByText(/Drive folder setup/)).toBeTruthy();
    expect(screen.queryByText(/Create folder/)).toBeFalsy();
    vi.doUnmock('../lib/supabase.js');
  });

  it('creating a root folder calls db.drive.createRootFolder and shows the real returned id to copy', async () => {
    const db = makeDb({});
    db.drive = { createRootFolder: vi.fn(async (name) => ({ success: true, folderId: 'new-folder-123', folderName: name })) };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: MaintenancePanel } = await import('../components/MaintenancePanel.jsx');
    render(<MaintenancePanel currentUser={{ id: 's1', name: 'Priya' }} />);
    fireEvent.click(screen.getByText(/Drive folder setup/));
    fireEvent.click(screen.getByText('Create folder'));
    await waitFor(() => expect(db.drive.createRootFolder).toHaveBeenCalledWith('Unitop Ops Documents'));
    await waitFor(() => expect(screen.getByText(/new-folder-123/)).toBeTruthy());
    vi.doUnmock('../lib/supabase.js');
  });

  it('shows a real error if creating the folder fails, rather than failing silently', async () => {
    const db = makeDb({});
    db.drive = { createRootFolder: vi.fn(async () => ({ success: false, error: 'Google Drive is not configured yet' })) };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: MaintenancePanel } = await import('../components/MaintenancePanel.jsx');
    render(<MaintenancePanel currentUser={{ id: 's1', name: 'Priya' }} />);
    fireEvent.click(screen.getByText(/Drive folder setup/));
    fireEvent.click(screen.getByText('Create folder'));
    await waitFor(() => expect(screen.getByText(/not configured yet/)).toBeTruthy());
    vi.doUnmock('../lib/supabase.js');
  });
});

describe('Sidebar: Maintenance nav item, admin-gated like User Management', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.resolve(process.cwd(), 'src/components/UnitopApp.jsx'), 'utf8');

  it('the Admin section shows Maintenance only when can("maintenance") is true, same pattern as the other admin-only items', () => {
    expect(src).toMatch(/can\("maintenance"\)\?\[\{id:"maintenance"/);
  });

  it('the Admin section header itself also considers maintenance permission, so it appears even if templates/user_management are both off', () => {
    expect(src).toMatch(/can\("templates"\)\|\|can\("user_management"\)\|\|can\("maintenance"\)/);
  });

  it('renders MaintenancePanel for the maintenance view', () => {
    expect(src).toMatch(/view==="maintenance"\s*&&\s*<MaintenancePanel/);
  });
});

describe('Permissions: maintenance is admin-only by default', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/constants.js'), 'utf8');

  it('admin role defaults to maintenance:true', () => {
    const adminBlock = src.slice(src.indexOf('admin: {'), src.indexOf('sales: {'));
    expect(adminBlock).toMatch(/maintenance:true/);
  });

  it('every non-admin role defaults to maintenance:false', () => {
    [' sales: {', ' ops: {', ' accounts: {'].forEach(role => {
      const start = src.indexOf(role);
      expect(start).toBeGreaterThan(-1);
      const roleBlock = src.slice(start, start + 600);
      expect(roleBlock).toMatch(/maintenance:false/);
    });
  });
});
