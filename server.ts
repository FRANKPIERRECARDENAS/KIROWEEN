import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  createBaselineNodes,
  DIFFERENTIAL_SCENARIOS,
  generateBaselineSeries,
  NETWORK_PIPES,
} from './src/core/networkData';
import {
  computeRiskPriorityScore,
  evaluateTelemetryReading,
  parseCsvTelemetry,
} from './src/core/deterministicEngine';
import { enrichAnomalyWithNetworkContext } from './src/core/graphHydrology';
import { appendLedgerEntry, verifyLedgerChain } from './src/core/cryptoLedger';
import {
  AnomalyEvent,
  AquaBrainDiagnosis,
  NetworkNode,
  OfflineReportRecord,
  ScenarioId,
  SmartWorkOrder,
  TelemetryReading,
  TrustLedgerEntry,
  VisionAnalysisResult,
  WorkOrderStatus,
} from './src/core/types';
import {
  analyzeVisionEvidence,
  buildFallbackDiagnosis,
  buildFallbackVisionAnalysis,
  getProviderStatus,
  synthesizeDiagnosis,
} from './src/server/aiProvider';
import { loadPersistedState, savePersistedState } from './src/server/persistence';

interface AppStateStore {
  nodes: NetworkNode[];
  seriesByNode: Record<string, TelemetryReading[]>;
  anomalies: AnomalyEvent[];
  visionAnalyses: VisionAnalysisResult[];
  diagnoses: AquaBrainDiagnosis[];
  workOrders: SmartWorkOrder[];
  ledger: TrustLedgerEntry[];
  syncedOfflineKeys: Set<string>;
}

async function createInitialState(): Promise<AppStateStore> {
  const nodes = createBaselineNodes();
  const seriesByNode: Record<string, TelemetryReading[]> = {};
  for (const node of nodes) {
    seriesByNode[node.id] = generateBaselineSeries(node, 14);
  }

  let ledger: TrustLedgerEntry[] = [];
  ledger = await appendLedgerEntry(ledger, {
    action: 'NETWORK_INITIALIZED',
    actor: 'Sistema Aqua Sentinel',
    assetId: 'RED-SAN-CRISTOBAL',
    evidenceSummary:
      'Inicialización de red comunitaria sintética (7 nodos hidráulicos) con línea base nominal.',
    previousState: 'uninitialized',
    newState: 'nominal',
    evidenceData: { nodeCount: nodes.length, synthetic: true },
  });

  return {
    nodes,
    seriesByNode,
    anomalies: [],
    visionAnalyses: [],
    diagnoses: [],
    workOrders: [],
    ledger,
    syncedOfflineKeys: new Set<string>(),
  };
}

function healthFromCategory(category: AnomalyEvent['category']): NetworkNode['status'] {
  if (category === 'contamination' || category === 'leak') return 'critical';
  if (category === 'obstruction' || category === 'quality_drift') return 'warning';
  if (category === 'sensor_fault') return 'fault';
  return 'nominal';
}

async function bootstrapServer() {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  const persisted = loadPersistedState();
  let state: AppStateStore = persisted
    ? {
        nodes: persisted.nodes,
        seriesByNode: persisted.seriesByNode,
        anomalies: persisted.anomalies,
        visionAnalyses: persisted.visionAnalyses,
        diagnoses: persisted.diagnoses,
        workOrders: persisted.workOrders,
        ledger: persisted.ledger,
        syncedOfflineKeys: new Set<string>(persisted.syncedOfflineKeys),
      }
    : await createInitialState();

  if (!persisted) {
    savePersistedState(state);
  }

  const sseClients = new Set<express.Response>();

  const persistAndBroadcast = (broadcast = false) => {
    savePersistedState(state);
    if (!broadcast || sseClients.size === 0) return;
    const payload = JSON.stringify({
      nodes: state.nodes,
      seriesByNode: state.seriesByNode,
      anomalies: state.anomalies,
      visionAnalyses: state.visionAnalyses,
      diagnoses: state.diagnoses,
      workOrders: state.workOrders,
      ledger: state.ledger,
      provider: getProviderStatus(),
    });
    for (const client of sseClients) {
      client.write(`event: state_update\ndata: ${payload}\n\n`);
    }
  };

  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    sseClients.add(res);
    const keepAlive = setInterval(() => {
      res.write(': ping\n\n');
    }, 25000);
    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  app.get('/api/health', (_req, res) => {
    const provider = getProviderStatus();
    res.json({
      ok: true,
      ...provider,
      ledgerCount: state.ledger.length,
      ledgerHeadHash: state.ledger[state.ledger.length - 1]?.hash ?? null,
    });
  });

  app.get('/api/state', (_req, res) => {
    res.json({
      nodes: state.nodes,
      seriesByNode: state.seriesByNode,
      anomalies: state.anomalies,
      visionAnalyses: state.visionAnalyses,
      diagnoses: state.diagnoses,
      workOrders: state.workOrders,
      ledger: state.ledger,
      provider: getProviderStatus(),
    });
  });

  app.post('/api/reset', async (_req, res) => {
    state = await createInitialState();
    persistAndBroadcast(true);
    res.json({
      ok: true,
      nodes: state.nodes,
      seriesByNode: state.seriesByNode,
      anomalies: state.anomalies,
      visionAnalyses: state.visionAnalyses,
      diagnoses: state.diagnoses,
      workOrders: state.workOrders,
      ledger: state.ledger,
    });
  });

  app.post('/api/scenarios/:id/trigger', async (req, res) => {
    const scenarioId = req.params.id as ScenarioId;
    const scenario = DIFFERENTIAL_SCENARIOS.find((s) => s.id === scenarioId);
    if (!scenario) {
      res.status(404).json({ error: 'Escenario no encontrado.' });
      return;
    }

    const nodeIdx = state.nodes.findIndex((n) => n.id === scenario.nodeId);
    if (nodeIdx === -1) {
      res.status(404).json({ error: 'Nodo del escenario no encontrado.' });
      return;
    }

    const node = state.nodes[nodeIdx];
    const timestamp = new Date().toISOString();
    const reading: TelemetryReading = {
      ...scenario.injectedReading,
      id: `SCEN-${scenario.id}-${Date.now().toString(36)}`,
      timestamp,
    };

    const prevStatus = node.status;
    const history = state.seriesByNode[node.id] ?? [];
    const updatedSeries = [...history.slice(-19), reading];
    state.seriesByNode[node.id] = updatedSeries;

    const rawAnomaly = evaluateTelemetryReading(reading, node, history);
    const updatedNode: NetworkNode = {
      ...node,
      current: reading,
      status: rawAnomaly ? healthFromCategory(rawAnomaly.category) : 'nominal',
    };
    state.nodes[nodeIdx] = updatedNode;

    const anomaly = rawAnomaly
      ? enrichAnomalyWithNetworkContext(rawAnomaly, state.nodes, NETWORK_PIPES)
      : null;

    const providerStatus = getProviderStatus();
    const isGeminiLive = providerStatus.aiMode === 'gemini-live';
    const provisionalVisionId = `VIS-${Date.now().toString(36).toUpperCase()}`;
    const provisionalDiagId = `DIAG-${Date.now().toString(36).toUpperCase()}`;

    let visionAnalysis: VisionAnalysisResult | null = null;
    if (scenario.imageUrl && scenario.imageTitle) {
      visionAnalysis = buildFallbackVisionAnalysis(
        {
          node: updatedNode,
          imageUrl: scenario.imageUrl,
          imageTitle: scenario.imageTitle,
          activeAnomaly: anomaly,
        },
        timestamp,
        {
          id: provisionalVisionId,
          provisional: isGeminiLive,
          reason: 'missing_key',
        }
      );
      state.visionAnalyses = [visionAnalysis, ...state.visionAnalyses].slice(0, 20);
    }

    let diagnosis: AquaBrainDiagnosis | null = null;
    if (anomaly) {
      anomaly.scenarioId = scenario.id;
      state.anomalies = [
        anomaly,
        ...state.anomalies.filter((a) => a.nodeId !== node.id || a.status === 'resolved'),
      ];

      state.ledger = await appendLedgerEntry(state.ledger, {
        action: 'ANOMALY_DETECTED',
        actor: 'Motor Determinista',
        assetId: node.id,
        evidenceSummary: `${anomaly.title} (Score ${anomaly.priority.totalScore}/100 · ${anomaly.priority.priority})`,
        previousState: prevStatus,
        newState: updatedNode.status,
        evidenceData: { anomalyId: anomaly.id, rules: anomaly.rulesTriggered.map((r) => r.ruleId) },
      });

      diagnosis = buildFallbackDiagnosis(
        {
          anomaly,
          node: updatedNode,
          visionAnalysis,
        },
        timestamp,
        {
          id: provisionalDiagId,
          provisional: isGeminiLive,
          reason: 'missing_key',
        }
      );
      state.diagnoses = [diagnosis, ...state.diagnoses];

      state.ledger = await appendLedgerEntry(state.ledger, {
        action: 'DIAGNOSIS_GENERATED',
        actor: `Aqua Brain (${diagnosis.providerUsed})`,
        assetId: node.id,
        evidenceSummary: `Hipótesis: ${diagnosis.primaryHypothesis.slice(0, 120)} (Confianza ${diagnosis.confidencePct}%)`,
        previousState: 'anomaly_detected',
        newState: 'diagnosis_pending_approval',
        evidenceData: { diagnosisId: diagnosis.id, confidencePct: diagnosis.confidencePct },
      });
    }

    persistAndBroadcast(false);

    res.json({
      scenario,
      node: updatedNode,
      anomaly,
      visionAnalysis,
      diagnosis,
      aiEnrichmentStatus: isGeminiLive ? 'pending' : 'complete',
      ledger: state.ledger,
      nodes: state.nodes,
      seriesByNode: state.seriesByNode,
      anomalies: state.anomalies,
      visionAnalyses: state.visionAnalyses,
      diagnoses: state.diagnoses,
    });

    if (isGeminiLive && (visionAnalysis || diagnosis)) {
      void (async () => {
        try {
          let enrichedVision: VisionAnalysisResult | null = visionAnalysis;
          if (scenario.imageUrl && scenario.imageTitle && visionAnalysis) {
            const liveVision = await analyzeVisionEvidence({
              node: updatedNode,
              imageUrl: scenario.imageUrl,
              imageTitle: scenario.imageTitle,
              activeAnomaly: anomaly,
            });
            enrichedVision = { ...liveVision, id: provisionalVisionId };
            state.visionAnalyses = state.visionAnalyses.map((v) =>
              v.id === provisionalVisionId ? enrichedVision! : v
            );
          }

          if (anomaly && diagnosis) {
            const liveDiag = await synthesizeDiagnosis({
              anomaly,
              node: updatedNode,
              visionAnalysis: enrichedVision,
            });
            state.diagnoses = state.diagnoses.map((d) =>
              d.id === provisionalDiagId
                ? {
                    ...liveDiag,
                    id: provisionalDiagId,
                    operatorDecision: d.operatorDecision,
                    operatorNote: d.operatorNote,
                  }
                : d
            );

            state.ledger = await appendLedgerEntry(state.ledger, {
              action: 'AI_ENRICHMENT_COMPLETED',
              actor: `Aqua Brain (${liveDiag.providerUsed})`,
              assetId: node.id,
              evidenceSummary: `Enriquecimiento completado (${liveDiag.enrichmentStatus ?? 'fallback'}): ${liveDiag.primaryHypothesis.slice(0, 110)}`,
              previousState: 'diagnosis_preliminary',
              newState: 'diagnosis_enriched',
              evidenceData: {
                diagnosisId: provisionalDiagId,
                providerMode: liveDiag.providerMode,
                enrichmentStatus: liveDiag.enrichmentStatus,
                fallbackReason: liveDiag.fallbackReason,
              },
            });
          }

          persistAndBroadcast(true);
        } catch (err) {
          console.warn('Error en enriquecimiento asíncrono de escenario:', err);
        }
      })();
    }
  });

  app.post('/api/telemetry/ingest', async (req, res) => {
    const { csvText, readings: directReadings } = req.body as {
      csvText?: string;
      readings?: TelemetryReading[];
    };

    let parsedReadings: TelemetryReading[] = [];
    let errors: string[] = [];

    if (typeof csvText === 'string') {
      const parsed = parseCsvTelemetry(csvText);
      parsedReadings = parsed.readings;
      errors = parsed.errors;
    } else if (Array.isArray(directReadings)) {
      parsedReadings = directReadings;
    } else {
      res.status(400).json({ error: 'Se requiere csvText o readings.' });
      return;
    }

    const detectedAnomalies: AnomalyEvent[] = [];

    for (const r of parsedReadings) {
      const idx = state.nodes.findIndex((n) => n.id === r.nodeId);
      if (idx === -1) {
        errors.push(`Nodo desconocido: ${r.nodeId}`);
        continue;
      }
      const node = state.nodes[idx];
      const history = state.seriesByNode[node.id] ?? [];
      state.seriesByNode[node.id] = [...history.slice(-19), r];

      const rawAnomaly = evaluateTelemetryReading(r, node, history);
      state.nodes[idx] = {
        ...node,
        current: r,
        status: rawAnomaly ? healthFromCategory(rawAnomaly.category) : 'nominal',
      };

      const anomaly = rawAnomaly
        ? enrichAnomalyWithNetworkContext(rawAnomaly, state.nodes, NETWORK_PIPES)
        : null;

      if (anomaly) {
        detectedAnomalies.push(anomaly);
        state.anomalies = [anomaly, ...state.anomalies.filter((a) => a.nodeId !== node.id || a.status === 'resolved')];
        state.ledger = await appendLedgerEntry(state.ledger, {
          action: 'TELEMETRY_ANOMALY_INGESTED',
          actor: 'Motor Determinista (Ingesta)',
          assetId: node.id,
          evidenceSummary: anomaly.title,
          previousState: node.status,
          newState: state.nodes[idx].status,
          evidenceData: { readingId: r.id, score: anomaly.priority.totalScore },
        });
      }
    }

    persistAndBroadcast(false);

    res.json({
      ingestedCount: parsedReadings.length,
      errors,
      detectedAnomalies,
      nodes: state.nodes,
      seriesByNode: state.seriesByNode,
      anomalies: state.anomalies,
      ledger: state.ledger,
    });
  });

  app.post('/api/ai/vision-analyze', async (req, res) => {
    const { nodeId, imageUrl, imageTitle, imageBase64, imageMimeType } = req.body as {
      nodeId: string;
      imageUrl: string;
      imageTitle: string;
      imageBase64?: string;
      imageMimeType?: string;
    };

    const node = state.nodes.find((n) => n.id === nodeId);
    if (!node) {
      res.status(404).json({ error: 'Nodo no encontrado.' });
      return;
    }

    const activeAnomaly = state.anomalies.find((a) => a.nodeId === nodeId && a.status === 'active') ?? null;
    const analysis = await analyzeVisionEvidence({
      node,
      imageUrl: imageUrl || '',
      imageTitle: imageTitle || 'Reporte fotográfico de campo',
      imageBase64,
      imageMimeType,
      activeAnomaly,
    });

    state.visionAnalyses = [analysis, ...state.visionAnalyses].slice(0, 20);
    state.ledger = await appendLedgerEntry(state.ledger, {
      action: 'VISION_EVIDENCE_ANALYZED',
      actor: analysis.providerUsed,
      assetId: node.id,
      evidenceSummary: `${analysis.imageTitle} — ${analysis.confidenceLabel}`,
      previousState: 'evidence_uploaded',
      newState: 'vision_correlated',
      evidenceData: { visionId: analysis.id, mode: analysis.providerMode },
    });

    persistAndBroadcast(false);

    res.json({
      analysis,
      visionAnalyses: state.visionAnalyses,
      ledger: state.ledger,
    });
  });

  app.post('/api/ai/diagnose', async (req, res) => {
    const { anomalyId, visionAnalysisId } = req.body as {
      anomalyId: string;
      visionAnalysisId?: string;
    };

    const anomaly = state.anomalies.find((a) => a.id === anomalyId);
    if (!anomaly) {
      res.status(404).json({ error: 'Anomalía no encontrada.' });
      return;
    }
    const node = state.nodes.find((n) => n.id === anomaly.nodeId)!;
    const visionAnalysis = visionAnalysisId
      ? state.visionAnalyses.find((v) => v.id === visionAnalysisId) ?? null
      : state.visionAnalyses.find((v) => v.nodeId === node.id) ?? null;

    const diagnosis = await synthesizeDiagnosis({ anomaly, node, visionAnalysis });
    state.diagnoses = [diagnosis, ...state.diagnoses];

    state.ledger = await appendLedgerEntry(state.ledger, {
      action: 'AQUA_BRAIN_DIAGNOSIS',
      actor: `Aqua Brain (${diagnosis.providerUsed})`,
      assetId: node.id,
      evidenceSummary: diagnosis.primaryHypothesis,
      previousState: 'anomaly_active',
      newState: 'diagnosis_pending_approval',
      evidenceData: { diagnosisId: diagnosis.id, score: diagnosis.priorityScore },
    });

    persistAndBroadcast(false);

    res.json({
      diagnosis,
      diagnoses: state.diagnoses,
      ledger: state.ledger,
    });
  });

  app.post('/api/diagnoses/:id/decision', async (req, res) => {
    const diagnosisId = req.params.id;
    const { decision, operatorNote, modifiedAction, modifiedPriority, assignee } = req.body as {
      decision: 'accepted' | 'modified' | 'rejected';
      operatorNote?: string;
      modifiedAction?: string;
      modifiedPriority?: AquaBrainDiagnosis['priority'];
      assignee?: string;
    };

    const idx = state.diagnoses.findIndex((d) => d.id === diagnosisId);
    if (idx === -1) {
      res.status(404).json({ error: 'Diagnóstico no encontrado.' });
      return;
    }

    const current = state.diagnoses[idx];
    const updatedDiagnosis: AquaBrainDiagnosis = {
      ...current,
      operatorDecision: decision,
      operatorNote,
      recommendedAction: modifiedAction || current.recommendedAction,
      priority: modifiedPriority || current.priority,
    };
    state.diagnoses[idx] = updatedDiagnosis;

    let createdOrder: SmartWorkOrder | null = null;
    if (decision === 'accepted' || decision === 'modified') {
      const node = state.nodes.find((n) => n.id === current.nodeId);
      const orderNumber = String(state.workOrders.length + 1).padStart(3, '0');
      const now = new Date().toISOString();

      createdOrder = {
        id: `OT-2026-${orderNumber}`,
        diagnosisId: updatedDiagnosis.id,
        anomalyId: updatedDiagnosis.anomalyId,
        createdAt: now,
        updatedAt: now,
        location: `${updatedDiagnosis.nodeName} · ${node?.sector ?? 'Red Comunitaria'}`,
        nodeId: updatedDiagnosis.nodeId,
        assetName: node ? `${node.assetCode} (${node.material} ${node.diameterMm} mm)` : updatedDiagnosis.nodeId,
        evidenceSummary: updatedDiagnosis.availableEvidences,
        probableCause: updatedDiagnosis.primaryHypothesis,
        priority: updatedDiagnosis.priority,
        requiredResources: updatedDiagnosis.requiredResources,
        interventionSteps: updatedDiagnosis.interventionSteps,
        assignee: assignee || 'Brigada Hídrica Sectorial A',
        status: 'Abierta',
      };

      state.ledger = await appendLedgerEntry(state.ledger, {
        action: 'WORK_ORDER_ISSUED',
        actor: 'Operador Central (Aprobación Aqua Brain)',
        assetId: createdOrder.nodeId,
        evidenceSummary: `${createdOrder.id} emitida [${createdOrder.priority}]: ${updatedDiagnosis.recommendedAction}`,
        previousState: 'diagnosis_pending_approval',
        newState: 'Abierta',
        evidenceData: { workOrderId: createdOrder.id, decision, operatorNote },
      });

      createdOrder.ledgerHash = state.ledger[state.ledger.length - 1].hash;
      state.workOrders = [createdOrder, ...state.workOrders];
    } else {
      state.ledger = await appendLedgerEntry(state.ledger, {
        action: 'DIAGNOSIS_REJECTED',
        actor: 'Operador Central',
        assetId: updatedDiagnosis.nodeId,
        evidenceSummary: `Recomendación rechazada. Motivo: ${operatorNote || 'Descartada por operador'}`,
        previousState: 'diagnosis_pending_approval',
        newState: 'rejected',
        evidenceData: { diagnosisId: updatedDiagnosis.id, operatorNote },
      });
    }

    persistAndBroadcast(false);

    res.json({
      diagnosis: updatedDiagnosis,
      createdOrder,
      diagnoses: state.diagnoses,
      workOrders: state.workOrders,
      ledger: state.ledger,
    });
  });

  app.patch('/api/work-orders/:id', async (req, res) => {
    const orderId = req.params.id;
    const { status, closureNotes, closureEvidenceLabel } = req.body as {
      status: WorkOrderStatus;
      closureNotes?: string;
      closureEvidenceLabel?: string;
    };

    const idx = state.workOrders.findIndex((w) => w.id === orderId);
    if (idx === -1) {
      res.status(404).json({ error: 'Orden de trabajo no encontrada.' });
      return;
    }

    const existing = state.workOrders[idx];
    const prevStatus = existing.status;
    const updatedOrder: SmartWorkOrder = {
      ...existing,
      status,
      updatedAt: new Date().toISOString(),
      closureNotes: closureNotes ?? existing.closureNotes,
      closureEvidenceLabel: closureEvidenceLabel ?? existing.closureEvidenceLabel,
    };

    state.ledger = await appendLedgerEntry(state.ledger, {
      action: status === 'Cerrada' ? 'WORK_ORDER_CLOSED' : 'WORK_ORDER_UPDATED',
      actor: existing.assignee,
      assetId: existing.nodeId,
      evidenceSummary:
        status === 'Cerrada'
          ? `${existing.id} cerrada con evidencia: ${closureNotes || 'Verificación en campo completada'}`
          : `${existing.id} cambió a ${status}`,
      previousState: prevStatus,
      newState: status,
      evidenceData: { workOrderId: existing.id, closureNotes, closureEvidenceLabel },
    });

    updatedOrder.ledgerHash = state.ledger[state.ledger.length - 1].hash;
    state.workOrders[idx] = updatedOrder;

    // If closed, resolve associated anomaly and restore node baseline
    if (status === 'Cerrada') {
      state.anomalies = state.anomalies.map((a) =>
        a.id === existing.anomalyId ? { ...a, status: 'resolved' } : a
      );
      const nodeIdx = state.nodes.findIndex((n) => n.id === existing.nodeId);
      if (nodeIdx !== -1) {
        const node = state.nodes[nodeIdx];
        const restoredReading: TelemetryReading = {
          id: `RESTORED-${node.id}-${Date.now().toString(36)}`,
          timestamp: new Date().toISOString(),
          nodeId: node.id,
          ...node.baseline,
          synthetic: true,
        };
        state.nodes[nodeIdx] = {
          ...node,
          status: 'nominal',
          current: restoredReading,
        };
        state.seriesByNode[node.id] = [
          ...(state.seriesByNode[node.id] ?? []).slice(-19),
          restoredReading,
        ];
      }
    }

    persistAndBroadcast(false);

    res.json({
      workOrder: updatedOrder,
      workOrders: state.workOrders,
      anomalies: state.anomalies,
      nodes: state.nodes,
      seriesByNode: state.seriesByNode,
      ledger: state.ledger,
    });
  });

  app.post('/api/ledger/verify', async (req, res) => {
    const chainToVerify = Array.isArray(req.body?.ledger)
      ? (req.body.ledger as TrustLedgerEntry[])
      : state.ledger;
    const result = await verifyLedgerChain(chainToVerify);
    res.json(result);
  });

  app.post('/api/sync/offline', async (req, res) => {
    const reports = (req.body?.reports ?? []) as OfflineReportRecord[];
    const results: Array<{
      id: string;
      status: 'synced' | 'duplicate' | 'conflict';
      note: string;
      anomalyId?: string;
      diagnosisId?: string;
    }> = [];

    for (const report of reports) {
      if (state.syncedOfflineKeys.has(report.idempotencyKey)) {
        results.push({
          id: report.id,
          status: 'duplicate',
          note: 'Registro deduplicado por clave idempotente; ya existía en servidor.',
        });
        continue;
      }

      const activeConflict = state.workOrders.find(
        (w) => w.nodeId === report.nodeId && w.status === 'Cerrada'
      );
      state.syncedOfflineKeys.add(report.idempotencyKey);

      const nodeIdx = state.nodes.findIndex((n) => n.id === report.nodeId);
      const node = nodeIdx !== -1 ? state.nodes[nodeIdx] : undefined;
      let visionAnalysis: VisionAnalysisResult | null = null;
      if (report.photoDataUrl && node) {
        visionAnalysis = await analyzeVisionEvidence({
          node,
          imageUrl: report.photoDataUrl,
          imageTitle: `Reporte Offline — ${report.reporterName}`,
        });
        state.visionAnalyses = [visionAnalysis, ...state.visionAnalyses].slice(0, 20);
      }

      let createdAnomalyId: string | undefined;
      let createdDiagnosisId: string | undefined;

      if (node) {
        const category = report.category === 'nominal' ? 'leak' : report.category;
        const severityBase =
          category === 'contamination' ? 78 : category === 'leak' ? 74 : category === 'obstruction' ? 62 : 55;
        const priority = computeRiskPriorityScore({
          category,
          maxRuleSeverity: severityBase,
          populationServed: node.populationServed,
          ruleCount: visionAnalysis ? 2 : 1,
        });
        const anomaly: AnomalyEvent = {
          id: `ANOM-OFF-${report.id}`,
          timestamp: report.createdAt || new Date().toISOString(),
          nodeId: node.id,
          nodeName: node.name,
          sector: node.sector,
          category,
          title: `Reporte offline sincronizado (${report.reporterName}): ${report.description.slice(0, 80)}`,
          status: activeConflict ? 'resolved' : 'active',
          rulesTriggered: [
            {
              ruleId:
                category === 'leak'
                  ? 'PRESSURE_DROP_LEAK'
                  : category === 'obstruction'
                    ? 'FLOW_OBSTRUCTION'
                    : category === 'sensor_fault'
                      ? 'SENSOR_PHYSICAL_IMPLAUSIBILITY'
                      : 'QUALITY_PARAMETER_ANOMALY',
              title: `Observación de campo sincronizada (${report.reporterName})`,
              category,
              severityScore: severityBase,
              metric: 'fieldReport',
              observedValue: 1,
              baselineValue: 0,
              deltaPct: 100,
              explanation: `Reporte en sitio capturado sin conexión: "${report.description}"`,
            },
          ],
          priority,
          telemetrySnapshot: node.current,
          baselineSnapshot: node.baseline,
          synthetic: false,
        };
        createdAnomalyId = anomaly.id;
        state.anomalies = [anomaly, ...state.anomalies];

        if (!activeConflict) {
          state.nodes[nodeIdx] = {
            ...node,
            status: healthFromCategory(category),
          };
        }

        const diagnosis = buildFallbackDiagnosis(
          {
            anomaly,
            node: state.nodes[nodeIdx],
            visionAnalysis,
          },
          new Date().toISOString(),
          { reason: getProviderStatus().aiMode === 'gemini-live' ? 'missing_key' : 'missing_key' }
        );
        const enrichedDiag: AquaBrainDiagnosis = {
          ...diagnosis,
          detectedProblem: `Incidencia de campo offline en ${node.name}: ${report.description}`,
          availableEvidences: [
            `Reporte ciudadano/técnico offline (${report.reporterName}) · Clave ${report.idempotencyKey}`,
            ...diagnosis.availableEvidences,
          ],
          providerUsed: 'Aqua Brain (Correlación de Reporte Offline)',
        };
        createdDiagnosisId = enrichedDiag.id;
        state.diagnoses = [enrichedDiag, ...state.diagnoses];
      }

      const conflictNote = activeConflict
        ? `Sincronizado con advertencia de conflicto: existe orden cerrada reciente (${activeConflict.id}) en este nodo.`
        : 'Sincronizado e incorporado al Command Center, Aqua Brain y Trust Ledger.';

      state.ledger = await appendLedgerEntry(state.ledger, {
        action: 'OFFLINE_REPORT_SYNCED',
        actor: `${report.reporterName} (Modo Offline)`,
        assetId: report.nodeId,
        evidenceSummary: `${report.description} (${conflictNote})`,
        previousState: 'offline_pending',
        newState: activeConflict ? 'synced_with_conflict_review' : 'synced_to_brain',
        evidenceData: {
          reportId: report.id,
          idempotencyKey: report.idempotencyKey,
          anomalyId: createdAnomalyId,
          diagnosisId: createdDiagnosisId,
        },
      });

      results.push({
        id: report.id,
        status: activeConflict ? 'conflict' : 'synced',
        note: conflictNote,
        anomalyId: createdAnomalyId,
        diagnosisId: createdDiagnosisId,
      });
    }

    persistAndBroadcast(true);

    res.json({
      results,
      ledger: state.ledger,
      visionAnalyses: state.visionAnalyses,
      anomalies: state.anomalies,
      diagnoses: state.diagnoses,
      nodes: state.nodes,
    });
  });

  app.get('/api/kiro/files', (_req, res) => {
    const kiroRoot = path.resolve(process.cwd(), '.kiro');
    const files: Array<{ path: string; category: string; content: string }> = [];

    const walk = (dir: string, category: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) {
          walk(full, entry);
        } else {
          files.push({
            path: `.kiro/${path.relative(kiroRoot, full)}`,
            category,
            content: fs.readFileSync(full, 'utf8'),
          });
        }
      }
    };

    walk(kiroRoot, 'root');
    res.json({ files });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use('/src/assets', express.static(path.resolve(process.cwd(), 'dist/src/assets')));
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`Aqua Sentinel server listening on http://0.0.0.0:${port}`);
  });
}

bootstrapServer().catch((err) => {
  console.error('Failed to start Aqua Sentinel server:', err);
  process.exit(1);
});
