import React from 'react';
import { ArrowRight, Play, ShieldCheck, Waves, Eye, Cpu, GitBranch, Database } from 'lucide-react';

interface WelcomeScreenProps {
  onEnterCommandCenter: () => void;
  onStartGuidedDemo: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onEnterCommandCenter,
  onStartGuidedDemo,
}) => {
  const pillars = [
    {
      icon: Waves,
      title: 'IoT Hidráulico & Calidad',
      desc: 'Ingesta CSV y simulación de presión, caudal, nivel, turbidez, cloro residual y pH.',
    },
    {
      icon: Eye,
      title: 'Visión Multimodal',
      desc: 'Inspección de fotografías de campo separando hechos observados de incertidumbre.',
    },
    {
      icon: Cpu,
      title: 'Motor Determinista + IA',
      desc: 'Reglas físicas auditables combinadas con razonamiento explicable en Aqua Brain.',
    },
    {
      icon: ShieldCheck,
      title: 'Órdenes & Ledger SHA-256',
      desc: 'Cada decisión y cierre genera trazabilidad criptográfica encadenada y modo offline.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#06131C] text-[#E6F1F5] flex flex-col justify-between">
      <header className="max-w-6xl w-full mx-auto px-6 py-6 flex items-center justify-between gap-8 border-b border-[#18364A]">
        <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
          <svg
            width="28"
            height="28"
            viewBox="0 0 28 28"
            fill="none"
            aria-hidden="true"
            className="text-cyan-400"
          >
            <rect x="2" y="2" width="24" height="24" rx="6" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M14 7C14 7 9 13.2 9 16.5C9 19.26 11.24 21.5 14 21.5C16.76 21.5 19 19.26 19 16.5C19 13.2 14 7 14 7Z"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <circle cx="14" cy="16.5" r="2" fill="currentColor" />
          </svg>
          <span className="text-lg font-semibold tracking-tight text-white">Aqua Sentinel</span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm text-slate-300">
          <span className="whitespace-nowrap shrink-0">Red San Cristóbal de las Aguas</span>
          <span aria-hidden="true" className="text-[#234C66]">·</span>
          <span className="whitespace-nowrap shrink-0 text-cyan-300">Datos sintéticos de demostración</span>
        </nav>

        <div className="shrink-0">
          <button
            type="button"
            onClick={onEnterCommandCenter}
            className="px-4 py-2 text-sm font-medium bg-[#0F2736] hover:bg-[#143347] text-cyan-200 border border-[#234C66] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Abrir Consola
          </button>
        </div>
      </header>

      <main className="max-w-6xl w-full mx-auto px-6 py-12 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-7 space-y-6">
          <p className="text-xs font-mono tracking-wider uppercase text-cyan-400">
            Inteligencia Operativa Hídrica Comunitaria
          </p>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white leading-tight [text-wrap:balance]">
            De señales dispersas a decisiones hídricas explicables y verificables.
          </h1>
          <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-2xl">
            Aqua Sentinel unifica telemetría IoT, geointeligencia de red, visión multimodal, reglas
            deterministas, razonamiento asistido por IA y auditoría SHA-256 en un ciclo operativo
            cerrado sin requerir hardware externo para su evaluación.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button
              type="button"
              onClick={onStartGuidedDemo}
              className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold bg-cyan-500 hover:bg-cyan-400 text-[#041018] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-4 h-4" />
              Iniciar Demostración Guiada
            </button>
            <button
              type="button"
              onClick={onEnterCommandCenter}
              className="inline-flex items-center gap-2 px-5 py-3 text-sm font-medium bg-[#0A1D29] hover:bg-[#0F2736] text-slate-100 border border-[#234C66] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Entrar al Command Center
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="pt-4 border-t border-[#18364A] flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400">
            <span>Ciclo cerrado:</span>
            <span className="font-mono text-cyan-300">
              Dato → Anomalía → Correlación → Diagnóstico → Orden → Verificación SHA-256
            </span>
          </div>
        </div>

        <div className="lg:col-span-5 bg-[#0A1D29] border border-[#18364A] rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-[#18364A] pb-3">
            <h2 className="text-sm font-semibold text-white">Arquitectura Integrada</h2>
            <span className="text-xs font-mono text-slate-400">6 capas acopladas</span>
          </div>

          <div className="space-y-4">
            {pillars.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-[#0F2736] border border-[#1E435A] text-cyan-400 shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">{item.title}</h3>
                    <p className="text-xs text-slate-400 leading-relaxed mt-0.5">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-3 border-t border-[#18364A] flex items-center justify-between text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5 text-cyan-400" />
              Specs y steering en .kiro/
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              IndexedDB Offline listo
            </span>
          </div>
        </div>
      </main>

      <footer className="max-w-6xl w-full mx-auto px-6 py-4 border-t border-[#18364A] flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
        <span>Escenario sintético precargado: 4 fallas diferenciales reproducibles sin hardware físico.</span>
        <span>Aqua Sentinel · Operación Hídrica Auditada</span>
      </footer>
    </div>
  );
};
