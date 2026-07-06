import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { mapDbQueryRow, saveAgentToDB } from '../lib/utils.js';
import AgentMaster from '../components/AgentMaster.jsx';

describe('mapDbQueryRow now maps agent_id (previously omitted, same gap assigned_to had)', () => {
  it('maps the real uuid agent_id field to agentId', () => {
    const dbRow = { id: 'UTQ-1', agent_id: 'a1b2c3d4-0000-0000-0000-000000000000' };
    const mapped = mapDbQueryRow(dbRow);
    expect(mapped.agentId).toBe('a1b2c3d4-0000-0000-0000-000000000000');
  });
});

describe('saveAgentToDB', () => {
  it('upserts an existing agent (has an id) with correct field mapping, keeping the same id', async () => {
    const upsert = vi.fn(async () => ({ data: [], error: null }));
    const db = { from: () => ({ upsert }) };
    const result = await saveAgentToDB(db, {
      id: 'existing-uuid', company: 'NCH Holidays', country: 'Thailand', city: 'Bangkok',
      market: 'Thai', contactName: 'Pee', contactPhone: '123', contactEmail: 'a@b.com', notes: 'n', active: true,
    });
    expect(upsert).toHaveBeenCalledWith({
      id: 'existing-uuid', company: 'NCH Holidays', country: 'Thailand', city: 'Bangkok',
      market: 'Thai', contact_name: 'Pee', contact_phone: '123', contact_email: 'a@b.com', notes: 'n', active: true,
    });
    expect(result.id).toBe('existing-uuid'); // unchanged
  });

  it('INSERTs a new agent (no id) rather than upserting with a fake client-side id, and returns the real DB-generated id', async () => {
    const insert = vi.fn(async () => ({ data: [{ id: 'real-generated-uuid', company: 'New Agency' }], error: null }));
    const db = { from: () => ({ insert }) };
    const result = await saveAgentToDB(db, { company: 'New Agency', country: 'India' });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ company: 'New Agency', country: 'India' }));
    expect(insert.mock.calls[0][0].id).toBeUndefined(); // no client-invented id sent
    expect(result.id).toBe('real-generated-uuid'); // real id came back from the DB
  });

  it('does not throw when the db call fails, and returns the original agent unchanged', async () => {
    const db = { from: () => ({ insert: async () => { throw new Error('fail'); } }) };
    const result = await saveAgentToDB(db, { company: 'X' });
    expect(result.company).toBe('X');
  });
});

describe('AgentMaster: no longer invents a fake id for new agents', () => {
  it('creating a new agent calls onSaveAgent and adopts whatever id it returns', async () => {
    const onSaveAgent = vi.fn(async (agent) => ({ ...agent, id: 'real-uuid-from-db' }));
    const setAgents = vi.fn();
    render(<AgentMaster agents={[]} setAgents={setAgents} queries={[]} payments={{}} onSaveAgent={onSaveAgent} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('+ New Agent'));
    const nameLabel = screen.getByText('Agency / Company Name');
    fireEvent.change(nameLabel.parentElement.querySelector('input'), { target: { value: 'Brand New Agency' } });
    await fireEvent.click(screen.getByText('Save Agent'));
    expect(onSaveAgent).toHaveBeenCalledTimes(1);
    expect(onSaveAgent.mock.calls[0][0].id).toBeUndefined(); // no fake id sent up
    // setAgents should have been called with the agent carrying the REAL returned id
    const setterArg = setAgents.mock.calls[0][0];
    const added = typeof setterArg === 'function' ? setterArg([])[0] : setterArg[0];
    expect(added.id).toBe('real-uuid-from-db');
  });
});
