import test from 'node:test';
import assert from 'node:assert/strict';
import { appendLedgerEntry, GENESIS_HASH, verifyLedgerChain } from './cryptoLedger';
import { TrustLedgerEntry } from './types';

test('appendLedgerEntry links blocks via SHA-256 and verifies cleanly', async () => {
  let chain: TrustLedgerEntry[] = [];
  chain = await appendLedgerEntry(chain, {
    action: 'ANOMALY_DETECTED',
    actor: 'Motor Determinista',
    assetId: 'N-TRON-04',
    evidenceSummary: 'Caída de presión -42%',
    previousState: 'nominal',
    newState: 'critical',
  });
  chain = await appendLedgerEntry(chain, {
    action: 'WORK_ORDER_CREATED',
    actor: 'Operador Central',
    assetId: 'N-TRON-04',
    evidenceSummary: 'Orden OT-2026-001 emitida',
    previousState: 'pending',
    newState: 'Abierta',
  });

  assert.equal(chain.length, 2);
  assert.equal(chain[0].previousHash, GENESIS_HASH);
  assert.equal(chain[1].previousHash, chain[0].hash);

  const verification = await verifyLedgerChain(chain);
  assert.equal(verification.valid, true);
  assert.equal(verification.checkedCount, 2);
  assert.equal(verification.brokenIndex, null);
});

test('verifyLedgerChain detects tampering in any historical block', async () => {
  let chain: TrustLedgerEntry[] = [];
  chain = await appendLedgerEntry(chain, {
    action: 'INIT',
    actor: 'Sistema',
    assetId: 'RED-01',
    evidenceSummary: 'Inicio',
    previousState: 'offline',
    newState: 'nominal',
  });
  chain = await appendLedgerEntry(chain, {
    action: 'DECISION',
    actor: 'Operador',
    assetId: 'N-TOMA-01',
    evidenceSummary: 'Aceptado',
    previousState: 'pending',
    newState: 'accepted',
  });

  // Tamper with block #0 evidenceSummary without recalculating hash
  const tampered: TrustLedgerEntry[] = [
    { ...chain[0], evidenceSummary: 'Alteración maliciosa' },
    chain[1],
  ];

  const verification = await verifyLedgerChain(tampered);
  assert.equal(verification.valid, false);
  assert.equal(verification.brokenIndex, 0);
});
