import React from 'react';
import { analyzeNetworkHydraulics } from '../core/graphHydrology';
import { AnomalyEvent, HealthStatus, NetworkNode, PipeSegment } from '../core/types';

interface NetworkMapProps {
  nodes: NetworkNode[];
  pipes: PipeSegment[];
  anomalies?: AnomalyEvent[];
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
  showElevation?: boolean;
}

const STATUS_STYLE: Record<
  HealthStatus,
  { stroke: string; fill: string; text: string; label: string; glyph: string }
> = {
  nominal: {
    stroke: '#10B981',
    fill: '#082F27',
    text: '#6EE7B7',
    label: 'Nominal',
    glyph: '●',
  },
  warning: {
    stroke: '#F59E0B',
    fill: '#2E2008',
    text: '#FCD34D',
    label: 'Advertencia',
    glyph: '▲',
  },
  critical: {
    stroke: '#F43F5E',
    fill: '#330C18',
    text: '#FDA4AF',
    label: 'Crítico',
    glyph: '✖',
  },
  fault: {
    stroke: '#38BDF8',
    fill: '#0B283D',
    text: '#7DD3FC',
    label: 'Falla Sensor',
    glyph: '◆',
  },
};

function kindLabel(kind: NetworkNode['kind']): string {
  switch (kind) {
    case 'intake':
      return 'TOMA';
    case 'pump':
      return 'PTAP';
    case 'tank':
      return 'TANQUE';
    case 'valve':
      return 'VÁLVULA';
    case 'junction':
      return 'TRONCAL';
    case 'distribution':
      return 'RAMAL';
  }
}

export const NetworkMap: React.FC<NetworkMapProps> = ({
  nodes,
  pipes,
  anomalies = [],
  selectedNodeId,
  onSelectNode,
  showElevation = true,
}) => {
  const nodeMap = new Map<string, NetworkNode>(nodes.map((n) => [n.id, n]));
  const hydraulics = analyzeNetworkHydraulics(nodes, pipes, anomalies);
  const flaggedBalances = hydraulics.massBalances.filter((m) => m.flagged);

  return (
    <div
      data-testid="network-map-container"
      className="relative w-full bg-[#071824] border border-[#18364A] rounded-xl overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-[#18364A] flex flex-wrap items-center justify-between gap-4 bg-[#0A1D29]">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-semibold text-white">Red Comunitaria San Cristóbal de las Aguas</span>
          <span aria-hidden="true" className="hidden sm:inline text-[#234C66]">·</span>
          <span className="text-slate-400 font-mono">
            Topología sintética · 7 nodos · 6 tramos
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
          <span className="text-emerald-400">● Nominal</span>
          <span className="text-amber-400">▲ Obstrucción / Propagado</span>
          <span className="text-rose-400">✖ Crítico / Fuga / Calidad</span>
          <span className="text-sky-400">◆ Falla Sensor</span>
        </div>
      </div>

      {(Object.keys(hydraulics.propagatedByNode).length > 0 || flaggedBalances.length > 0) && (
        <div className="px-4 py-2 border-b border-[#18364A] bg-[#0B2231] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <span className="text-amber-300">
            Propagación hidráulica: {Object.keys(hydraulics.propagatedByNode).length} nodo(s) aguas
            abajo expuestos · {hydraulics.totalAffectedPopulation.toLocaleString('es-ES')} hab. en
            zona de influencia
          </span>
          {flaggedBalances.length > 0 && (
            <span className="text-cyan-300">
              Desbalance nodal ({flaggedBalances[0].nodeId}):{' '}
              {flaggedBalances[0].deviationLs >= 0
                ? `+${flaggedBalances[0].deviationLs}`
                : flaggedBalances[0].deviationLs}{' '}
              L/s ({flaggedBalances[0].imbalancePct}%)
            </span>
          )}
        </div>
      )}

      <svg
        viewBox="0 0 900 380"
        className="w-full h-auto block select-none"
        role="img"
        aria-label="Mapa hidráulico interactivo de la red comunitaria de agua"
      >
        <defs>
          <pattern id="hydroGrid" width="30" height="30" patternUnits="userSpaceOnUse">
            <path
              d="M 30 0 L 0 0 0 30"
              fill="none"
              stroke="#0F2A3B"
              strokeWidth="0.75"
            />
          </pattern>
          <marker
            id="flowArrow"
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#22D3EE" opacity="0.75" />
          </marker>
        </defs>

        {/* Background technical grid */}
        <rect width="900" height="380" fill="#071824" />
        <rect width="900" height="380" fill="url(#hydroGrid)" />

        {/* Topographic sector zones */}
        <path
          d="M 30 40 L 350 40 L 350 220 L 30 220 Z"
          fill="#0B2231"
          fillOpacity="0.45"
          stroke="#153549"
          strokeDasharray="4 4"
        />
        <text x="44" y="60" fill="#5E879E" fontSize="10" fontFamily="JetBrains Mono, monospace">
          SECTOR CUENCA ALTA (1795–1840 m)
        </text>

        <path
          d="M 370 35 L 870 35 L 870 205 L 370 205 Z"
          fill="#0B2231"
          fillOpacity="0.35"
          stroke="#153549"
          strokeDasharray="4 4"
        />
        <text x="384" y="55" fill="#5E879E" fontSize="10" fontFamily="JetBrains Mono, monospace">
          SECTOR NORTE Y CENTRO CÍVICO (1705–1865 m)
        </text>

        <path
          d="M 370 218 L 870 218 L 870 355 L 370 355 Z"
          fill="#0B2231"
          fillOpacity="0.35"
          stroke="#153549"
          strokeDasharray="4 4"
        />
        <text x="384" y="238" fill="#5E879E" fontSize="10" fontFamily="JetBrains Mono, monospace">
          SECTOR SUR Y BARRIO LA ESPERANZA (1690–1720 m)
        </text>

        {/* Pipes */}
        {pipes.map((pipe) => {
          const fromNode = nodeMap.get(pipe.from);
          const toNode = nodeMap.get(pipe.to);
          if (!fromNode || !toNode) return null;

          const isPropagatedPipe = hydraulics.affectedPipeIds.includes(pipe.id);
          const affected =
            isPropagatedPipe || fromNode.status !== 'nominal' || toNode.status !== 'nominal';
          const pipeColor =
            fromNode.status === 'critical' || toNode.status === 'critical'
              ? '#F43F5E'
              : isPropagatedPipe || fromNode.status === 'warning' || toNode.status === 'warning'
                ? '#F59E0B'
                : fromNode.status === 'fault' || toNode.status === 'fault'
                  ? '#38BDF8'
                  : '#0E7490';

          const midX = (fromNode.x + toNode.x) / 2;
          const midY = (fromNode.y + toNode.y) / 2;

          return (
            <g key={pipe.id}>
              <line
                x1={fromNode.x}
                y1={fromNode.y}
                x2={toNode.x}
                y2={toNode.y}
                stroke={pipeColor}
                strokeWidth={affected ? 3.5 : 2.5}
                strokeOpacity={affected ? 0.92 : 0.65}
                strokeDasharray={isPropagatedPipe && fromNode.status === 'nominal' ? '6 4' : undefined}
                markerMid="url(#flowArrow)"
              />
              {/* Midpoint flow chevron & diameter label */}
              <rect
                x={midX - 28}
                y={midY - 10}
                width="56"
                height="16"
                rx="3"
                fill="#06131C"
                stroke={isPropagatedPipe ? pipeColor : '#18364A'}
                strokeWidth="0.8"
              />
              <text
                x={midX}
                y={midY + 1}
                textAnchor="middle"
                fill="#7FB3C8"
                fontSize="8.5"
                fontFamily="JetBrains Mono, monospace"
              >
                Ø{pipe.diameterMm}mm
              </text>
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const style = STATUS_STYLE[node.status];
          const isSelected = node.id === selectedNodeId;
          const propagatedRisk =
            node.status === 'nominal' ? hydraulics.propagatedByNode[node.id] : undefined;
          const ringColor = propagatedRisk
            ? propagatedRisk.impactLevel === 'high'
              ? '#F43F5E'
              : '#F59E0B'
            : style.stroke;

          return (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
              onClick={() => onSelectNode(node.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectNode(node.id);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`Seleccionar nodo ${node.name}, estado ${
                propagatedRisk ? `riesgo propagado desde ${propagatedRisk.sourceNodeName}` : style.label
              }`}
              className="cursor-pointer focus:outline-none"
            >
              {/* Affected zone halo when non-nominal or downstream propagated */}
              {(node.status !== 'nominal' || Boolean(propagatedRisk)) && (
                <circle
                  r="34"
                  fill={ringColor}
                  fillOpacity="0.12"
                  stroke={ringColor}
                  strokeWidth="1.25"
                  strokeDasharray="3 3"
                />
              )}

              {/* Selection ring */}
              {isSelected && (
                <circle
                  r="25"
                  fill="none"
                  stroke="#22D3EE"
                  strokeWidth="2"
                />
              )}

              {/* Node circle */}
              <circle
                r="19"
                fill={style.fill}
                stroke={style.stroke}
                strokeWidth="2"
              />

              {/* Kind micro-tag */}
              <text
                y="-3"
                textAnchor="middle"
                fill={style.text}
                fontSize="7.5"
                fontWeight="600"
                fontFamily="JetBrains Mono, monospace"
              >
                {kindLabel(node.kind)}
              </text>
              <text
                y="8"
                textAnchor="middle"
                fill="#E6F1F5"
                fontSize="9"
                fontWeight="600"
                fontFamily="JetBrains Mono, monospace"
              >
                {node.current.pressureBar.toFixed(1)}b
              </text>

              {/* Node Title & Telemetry below */}
              <rect
                x="-88"
                y="24"
                width="176"
                height={showElevation ? '32' : '22'}
                rx="4"
                fill="#06131C"
                fillOpacity="0.92"
                stroke={isSelected ? '#22D3EE' : '#18364A'}
                strokeWidth="1"
              />
              <text
                y="36"
                textAnchor="middle"
                fill="#E6F1F5"
                fontSize="9"
                fontWeight="600"
                fontFamily="DM Sans, sans-serif"
              >
                {node.name}
              </text>
              {showElevation && (
                <text
                  y="49"
                  textAnchor="middle"
                  fill={style.text}
                  fontSize="8.5"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {node.current.flowLs.toFixed(1)} L/s · {node.current.turbidityNtu.toFixed(1)} NTU
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
