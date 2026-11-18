import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRiskPriorityScore,
  evaluateTelemetryReading,
  parseCsvTelemetry,
} from './deterministicEngine';
import { createBaselineNodes, DIFFERENTIAL_SCENARIOS, SAMPLE_CSV_PAYLOAD } from './networkData';

test('nominal baseline reading produces no anomaly', () => {
  const nodes = createBaselineNodes();
  const node = nodes[0];
  const result = evaluateTelemetryReading(node.current, node);
  assert.equal(result, null);
});

test('leak scenario triggers PRESSURE_DROP_LEAK with high priority', () => {
  const nodes = createBaselineNodes();
  const scenario = DIFFERENTIAL_SCENARIOS.find((s) => s.id === 'leak')!;
  const node = nodes.find((n) => n.id === scenario.nodeId)!;
  const anomaly = evaluateTelemetryReading(
    {
      ...scenario.injectedReading,
      id: 'TEST-LEAK',
      timestamp: new Date().toISOString(),
    },
    node
  );
  assert.ok(anomaly);
  assert.equal(anomaly.category, 'leak');
  assert.ok(anomaly.rulesTriggered.some((r) => r.ruleId === 'PRESSURE_DROP_LEAK'));
  assert.ok(anomaly.priority.totalScore >= 60);
});

test('obstruction scenario triggers FLOW_OBSTRUCTION', () => {
  const nodes = createBaselineNodes();
  const scenario = DIFFERENTIAL_SCENARIOS.find((s) => s.id === 'obstruction')!;
  const node = nodes.find((n) => n.id === scenario.nodeId)!;
  const anomaly = evaluateTelemetryReading(
    {
      ...scenario.injectedReading,
      id: 'TEST-OBS',
      timestamp: new Date().toISOString(),
    },
    node
  );
  assert.ok(anomaly);
  assert.equal(anomaly.category, 'obstruction');
  assert.ok(anomaly.rulesTriggered.some((r) => r.ruleId === 'FLOW_OBSTRUCTION'));
});

test('sensor fault prioritizes SENSOR_PHYSICAL_IMPLAUSIBILITY over leak/quality', () => {
  const nodes = createBaselineNodes();
  const scenario = DIFFERENTIAL_SCENARIOS.find((s) => s.id === 'sensor_fault')!;
  const node = nodes.find((n) => n.id === scenario.nodeId)!;
  const anomaly = evaluateTelemetryReading(
    {
      ...scenario.injectedReading,
      id: 'TEST-FAULT',
      timestamp: new Date().toISOString(),
    },
    node
  );
  assert.ok(anomaly);
  assert.equal(anomaly.category, 'sensor_fault');
  assert.ok(anomaly.rulesTriggered.some((r) => r.ruleId === 'SENSOR_PHYSICAL_IMPLAUSIBILITY'));
});

test('contamination scenario triggers QUALITY_PARAMETER_ANOMALY', () => {
  const nodes = createBaselineNodes();
  const scenario = DIFFERENTIAL_SCENARIOS.find((s) => s.id === 'contamination')!;
  const node = nodes.find((n) => n.id === scenario.nodeId)!;
  const anomaly = evaluateTelemetryReading(
    {
      ...scenario.injectedReading,
      id: 'TEST-CONTAM',
      timestamp: new Date().toISOString(),
    },
    node
  );
  assert.ok(anomaly);
  assert.equal(anomaly.category, 'contamination');
  assert.ok(anomaly.rulesTriggered.some((r) => r.ruleId === 'QUALITY_PARAMETER_ANOMALY'));
  assert.equal(anomaly.priority.priority, 'Crítica');
});

test('computeRiskPriorityScore clamps between 0 and 100', () => {
  const high = computeRiskPriorityScore({
    category: 'contamination',
    maxRuleSeverity: 120,
    populationServed: 10000,
    ruleCount: 4,
  });
  assert.equal(high.totalScore, 100);
  assert.equal(high.priority, 'Crítica');

  const low = computeRiskPriorityScore({
    category: 'sensor_fault',
    maxRuleSeverity: 10,
    populationServed: 100,
    ruleCount: 1,
  });
  assert.ok(low.totalScore >= 0 && low.totalScore < 35);
  assert.equal(low.priority, 'Baja');
});

test('parseCsvTelemetry parses valid rows and catches malformed rows', () => {
  const valid = parseCsvTelemetry(SAMPLE_CSV_PAYLOAD);
  assert.equal(valid.readings.length, 4);
  assert.equal(valid.errors.length, 0);

  const malformed = parseCsvTelemetry(
    'timestamp,nodeId,pressureBar,flowLs,levelPct,turbidityNtu,chlorineMgL,ph\n2026-11-18T12:00Z,N-TOMA-01,abc,10,50,1,0.8,7.2'
  );
  assert.equal(malformed.readings.length, 0);
  assert.equal(malformed.errors.length, 1);
});

test('intentional valveState closed suppresses false-positive sensor implausibility (M-07)', () => {
  const nodes = createBaselineNodes();
  const valveNode = nodes.find((n) => n.id === 'N-VALV-05')!;
  const result = evaluateTelemetryReading(
    {
      ...valveNode.current,
      id: 'TEST-VALVE-CLOSED',
      timestamp: new Date().toISOString(),
      flowLs: 0.0,
      pressureBar: 4.4,
      valveState: 'closed',
    },
    valveNode
  );
  assert.equal(result, null);
});

test('4 consecutive identical readings trigger SENSOR_STUCK_AT_VALUE (M-07)', () => {
  const nodes = createBaselineNodes();
  const node = nodes.find((n) => n.id === 'N-TRON-04')!;
  const frozenReading = {
    ...node.current,
    id: 'FROZEN',
    timestamp: new Date().toISOString(),
  };
  const history = [frozenReading, frozenReading, frozenReading];
  const anomaly = evaluateTelemetryReading(frozenReading, node, history);
  assert.ok(anomaly);
  assert.equal(anomaly.category, 'sensor_fault');
  assert.ok(anomaly.rulesTriggered.some((r) => r.ruleId === 'SENSOR_STUCK_AT_VALUE'));
});

test('minor chlorine drift classifies as quality_drift rather than contamination (M-07)', () => {
  const nodes = createBaselineNodes();
  const node = nodes.find((n) => n.id === 'N-DIST-06')!;
  const driftAnomaly = evaluateTelemetryReading(
    {
      ...node.current,
      id: 'TEST-DRIFT',
      timestamp: new Date().toISOString(),
      chlorineMgL: 0.24,
      turbidityNtu: 0.6,
      ph: 7.2,
    },
    node
  );
  assert.ok(driftAnomaly);
  assert.equal(driftAnomaly.category, 'quality_drift');
});

