/**
 * TipGallery.tsx — BioFFF Studio
 * Galería inline de puntas Nordson EFD SmoothFlow™.
 * Se integra dentro del acordeón Toolhead (Syringe) en Step1Environment.
 */

import React from 'react';
import { NORDSON_TIPS, getTipById, DEFAULT_TIP_ID, type NozzleTip } from '../../constants/nozzleTips';

interface TipGalleryProps {
  /** ID de la punta actualmente seleccionada */
  selectedTipId?: string;
  /** Callback cuando el usuario selecciona una punta */
  onSelectTip: (tip: NozzleTip) => void;
}

export const TipGallery: React.FC<TipGalleryProps> = ({ selectedTipId, onSelectTip }) => {
  const activeTipId = selectedTipId ?? DEFAULT_TIP_ID;
  const activeTip = getTipById(activeTipId);

  return (
    <div className="space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
          <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current opacity-60">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
          </svg>
          Punta de Inyección
        </label>
        {activeTip && (
          <span
            className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: activeTip.colorHex + '22',
              color: activeTip.colorHex === '#1A1A1A' ? '#555' : activeTip.colorHex,
              border: `1px solid ${activeTip.colorHex}44`,
            }}
          >
            {activeTip.gauge} GA · {activeTip.innerDiameterMm} mm
          </span>
        )}
      </div>

      {/* Grid de cards */}
      <div className="grid grid-cols-2 gap-1.5">
        {NORDSON_TIPS.map(tip => {
          const isSelected = tip.id === activeTipId;
          const isBlack = tip.colorHex === '#1A1A1A';
          const isClear = tip.id === '27ga_clear';

          return (
            <button
              key={tip.id}
              onClick={() => onSelectTip(tip)}
              title={`${tip.gauge} GA ${tip.colorName} — DI ${tip.innerDiameterMm} mm — Ref. ${tip.standardRef}`}
              className={`relative flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-all duration-200 text-left group
                ${isSelected
                  ? 'border-primary bg-primary/6 shadow-sm'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 hover:border-primary/40 hover:bg-primary/4'
                }
              `}
            >
              {/* Dot de color físico */}
              <span
                className="w-4 h-4 rounded-full flex-shrink-0 border"
                style={{
                  backgroundColor: tip.colorHex,
                  borderColor: isBlack ? '#444' : isClear ? '#aaa' : tip.colorHex + 'bb',
                  boxShadow: isSelected ? `0 0 0 2px ${tip.colorHex}44` : undefined,
                  opacity: isClear ? 0.5 : 1,
                }}
              />

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className={`text-[10px] font-black leading-tight transition-colors ${
                  isSelected ? 'text-primary' : 'text-slate-700 dark:text-slate-200'
                }`}>
                  {tip.gauge} GA
                  <span className="font-medium text-[9px] text-slate-400 ml-1">{tip.colorName}</span>
                </div>
                <div className="text-[8px] font-mono text-slate-400 leading-tight">
                  Ø {tip.innerDiameterMm} mm
                </div>
              </div>

              {/* Selected indicator */}
              {isSelected && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {/* Referencia de la punta activa */}
      {activeTip && (
        <div className="flex items-center justify-between px-2 py-1.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700">
          <div className="space-y-0.5">
            <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest block">
              Nordson EFD SmoothFlow™
            </span>
            <span className="text-[9px] font-mono font-bold text-slate-600 dark:text-slate-300">
              Ref. {activeTip.standardRef}
            </span>
          </div>
          <div className="text-right space-y-0.5">
            <span className="text-[7px] text-slate-400 uppercase tracking-widest block">DI</span>
            <span className="text-[11px] font-black text-slate-700 dark:text-slate-200 font-mono">
              {activeTip.innerDiameterMm} <span className="text-[8px] font-normal">mm</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
