import React, { useState } from 'react';
import { ClipboardList, CheckCircle2, PlayCircle, ShieldCheck } from 'lucide-react';
import { SmartWorkOrder, WorkOrderStatus } from '../core/types';

interface WorkOrdersViewProps {
  workOrders: SmartWorkOrder[];
  onUpdateOrder: (
    orderId: string,
    payload: {
      status: WorkOrderStatus;
      closureNotes?: string;
      closureEvidenceLabel?: string;
    }
  ) => Promise<void>;
  onNavigateToLedger: () => void;
}

export const WorkOrdersView: React.FC<WorkOrdersViewProps> = ({
  workOrders,
  onUpdateOrder,
  onNavigateToLedger,
}) => {
  const [filter, setFilter] = useState<'Todas' | WorkOrderStatus>('Todas');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [closureNotes, setClosureNotes] = useState('');
  const [closureEvidence, setClosureEvidence] = useState(
    'Acta fotográfica post-intervención + prueba de presión estabilizada'
  );
  const [updating, setUpdating] = useState(false);

  const filtered = workOrders.filter((w) => (filter === 'Todas' ? true : w.status === filter));
  const selectedOrder =
    workOrders.find((w) => w.id === selectedOrderId) ?? filtered[0] ?? workOrders[0] ?? null;

  const handleStatusChange = async (order: SmartWorkOrder, nextStatus: WorkOrderStatus) => {
    setUpdating(true);
    try {
      await onUpdateOrder(order.id, {
        status: nextStatus,
        closureNotes:
          nextStatus === 'Cerrada'
            ? closureNotes || 'Intervención completada y verificada en campo. Parámetros en rango nominal.'
            : undefined,
        closureEvidenceLabel: nextStatus === 'Cerrada' ? closureEvidence : undefined,
      });
      if (nextStatus === 'Cerrada') {
        setClosureNotes('');
      }
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="bg-[#0A1D29] border border-[#18364A] rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Órdenes de Trabajo Inteligentes</h2>
          <p className="text-xs text-slate-400 mt-1">
            Cada recomendación aprobada en Aqua Brain se convierte en una orden trazable con
            recursos, pasos de intervención y cierre verificado en Trust Ledger.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#06131C] border border-[#18364A] rounded-lg">
          {(['Todas', 'Abierta', 'En Progreso', 'Cerrada'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filter === tab
                  ? 'bg-[#0F2736] text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </section>

      {!selectedOrder ? (
        <section className="bg-[#0A1D29] border border-dashed border-[#18364A] rounded-xl p-12 text-center space-y-2">
          <ClipboardList className="w-7 h-7 text-cyan-400 mx-auto" />
          <h3 className="text-base font-semibold text-white">No hay órdenes de trabajo emitidas</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Aprueba una recomendación en Aqua Brain para generar automáticamente una orden operativa
            enlazada al ledger SHA-256.
          </p>
        </section>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* List */}
          <aside className="xl:col-span-4 bg-[#0A1D29] border border-[#18364A] rounded-xl p-4 space-y-2">
            {filtered.map((order) => (
              <button
                key={order.id}
                type="button"
                onClick={() => setSelectedOrderId(order.id)}
                className={`w-full text-left p-3.5 rounded-lg border transition-colors cursor-pointer ${
                  selectedOrder.id === order.id
                    ? 'bg-[#0F2736] border-cyan-400'
                    : 'bg-[#06131C] border-[#18364A] hover:border-[#234C66]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs font-mono">
                  <span className="text-cyan-300 font-semibold">{order.id}</span>
                  <span
                    className={
                      order.status === 'Cerrada'
                        ? 'text-emerald-400'
                        : order.status === 'En Progreso'
                          ? 'text-amber-400'
                          : 'text-rose-400'
                    }
                  >
                    {order.status}
                  </span>
                </div>
                <div className="text-sm font-medium text-white mt-1">{order.location}</div>
                <div className="text-xs text-slate-400 mt-1">
                  Prioridad {order.priority} · {order.assignee}
                </div>
              </button>
            ))}
          </aside>

          {/* Order Detail */}
          <section className="xl:col-span-8 bg-[#0A1D29] border border-[#18364A] rounded-xl p-6 space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#18364A] pb-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
                  <span>{selectedOrder.id}</span>
                  <span aria-hidden="true">·</span>
                  <span>{selectedOrder.assetName}</span>
                </div>
                <h3 className="text-lg font-semibold text-white mt-1">{selectedOrder.location}</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Responsable: <span className="text-slate-200">{selectedOrder.assignee}</span> ·
                  Prioridad: <span className="text-rose-400 font-semibold">{selectedOrder.priority}</span>
                </p>
              </div>

              <div className="text-right text-xs font-mono">
                <div
                  className={`font-semibold ${
                    selectedOrder.status === 'Cerrada'
                      ? 'text-emerald-400'
                      : selectedOrder.status === 'En Progreso'
                        ? 'text-amber-400'
                        : 'text-rose-400'
                  }`}
                >
                  Estado: {selectedOrder.status}
                </div>
                <div className="text-slate-400 mt-1">
                  Actualizada: {new Date(selectedOrder.updatedAt).toLocaleTimeString('es-ES')}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-[#06131C] border border-[#18364A] space-y-2">
                <h4 className="text-xs font-semibold text-cyan-300 uppercase tracking-wider">
                  Causa Probable y Evidencias
                </h4>
                <p className="text-xs text-slate-100 leading-relaxed">{selectedOrder.probableCause}</p>
                <ul className="space-y-1 text-xs text-slate-400 list-disc pl-4 pt-1">
                  {selectedOrder.evidenceSummary.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>

              <div className="p-4 rounded-lg bg-[#06131C] border border-[#18364A] space-y-2">
                <h4 className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
                  Recursos Necesarios
                </h4>
                <ul className="space-y-1.5 text-xs text-slate-300 list-disc pl-4">
                  {selectedOrder.requiredResources.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-[#06131C] border border-[#18364A] space-y-2.5">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Pasos de Intervención en Campo
              </h4>
              <ol className="space-y-2 text-xs text-slate-200 list-decimal pl-4">
                {selectedOrder.interventionSteps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>

            {/* Workflow Controls */}
            {selectedOrder.status !== 'Cerrada' ? (
              <div className="p-4 rounded-lg bg-[#071B28] border border-cyan-500/30 space-y-3">
                <h4 className="text-xs font-semibold text-white">Actualizar Seguimiento y Cierre</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Notas de cierre (ej. Empaquetadura reemplazada, presión 4.4 bar)"
                    value={closureNotes}
                    onChange={(e) => setClosureNotes(e.target.value)}
                    className="px-3 py-2 text-xs bg-[#06131C] text-white border border-[#18364A] rounded-lg focus:outline-none focus:border-cyan-400"
                  />
                  <input
                    type="text"
                    aria-label="Evidencia de cierre"
                    value={closureEvidence}
                    onChange={(e) => setClosureEvidence(e.target.value)}
                    className="px-3 py-2 text-xs bg-[#06131C] text-white border border-[#18364A] rounded-lg focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {selectedOrder.status === 'Abierta' && (
                    <button
                      type="button"
                      disabled={updating}
                      onClick={() => handleStatusChange(selectedOrder, 'En Progreso')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-[#06131C] rounded-lg cursor-pointer whitespace-nowrap"
                    >
                      <PlayCircle className="w-3.5 h-3.5" />
                      Iniciar Intervención
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={updating}
                    onClick={() => handleStatusChange(selectedOrder, 'Cerrada')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-[#04140E] rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Cerrar Orden con Evidencia y Restaurar Nodo
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-[#06131C] border border-emerald-500/30 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1 text-xs">
                  <div className="font-semibold text-emerald-400">
                    ✓ Orden cerrada y verificada en campo
                  </div>
                  <p className="text-slate-300">{selectedOrder.closureNotes}</p>
                  <p className="text-slate-400 font-mono">
                    Evidencia adjunta: {selectedOrder.closureEvidenceLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onNavigateToLedger}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-[#041018] rounded-lg cursor-pointer whitespace-nowrap"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Verificar en Trust Ledger
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
