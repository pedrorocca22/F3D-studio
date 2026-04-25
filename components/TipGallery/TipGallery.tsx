/**
 * TipGallery.tsx — BioFFF Studio
 * Galería inline de puntas Nordson EFD SmoothFlow™.
 * Se integra dentro del acordeón Toolhead (Syringe) en Step1Environment.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { getTipById, DEFAULT_TIP_ID, type NozzleTip } from '../../constants/nozzleTips';
import { useProjectContext } from '../../contexts/ProjectContext';

interface TipGalleryProps {
  /** ID de la punta actualmente seleccionada */
  selectedTipId?: string;
  /** Callback cuando el usuario selecciona una punta */
  onSelectTip: (tip: NozzleTip) => void;
}

export const TipGallery: React.FC<TipGalleryProps> = ({ selectedTipId, onSelectTip }) => {
  const { project } = useProjectContext();
  const tipsLibrary = project.tipsLibrary;

  const activeTipId = selectedTipId ?? DEFAULT_TIP_ID;
  const activeTip = useMemo(() => tipsLibrary.find(t => t.id === activeTipId) || getTipById(activeTipId), [tipsLibrary, activeTipId]);
  
  const initialTab = activeTip?.isCustom ? 'custom' : (activeTip?.type || 'conical');
  const [activeTab, setActiveTab] = useState<'conical' | 'straight' | 'custom'>(initialTab);

  useEffect(() => {
    if (activeTip) {
      setActiveTab(activeTip.isCustom ? 'custom' : activeTip.type);
    }
  }, [activeTip]);

  const filteredTips = useMemo(() => {
    if (activeTab === 'custom') return tipsLibrary.filter(t => t.isCustom);
    return tipsLibrary.filter(t => t.type === activeTab && !t.isCustom);
  }, [tipsLibrary, activeTab]);

  return (
    <div className="space-y-3">
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

      {/* Tabs */}
      <div className="flex bg-slate-100 dark:bg-slate-800/60 rounded-lg p-1">
        <button
          onClick={() => setActiveTab('conical')}
          className={`flex-1 text-[9px] font-bold py-1.5 rounded-md transition-all ${
            activeTab === 'conical'
              ? 'bg-white dark:bg-slate-700 shadow-sm text-primary'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          Cónicas
        </button>
        <button
          onClick={() => setActiveTab('straight')}
          className={`flex-1 text-[9px] font-bold py-1.5 rounded-md transition-all ${
            activeTab === 'straight'
              ? 'bg-white dark:bg-slate-700 shadow-sm text-primary'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          Rectas
        </button>
        {tipsLibrary.some(t => t.isCustom) && (
          <button
            onClick={() => setActiveTab('custom')}
            className={`flex-1 text-[9px] font-bold py-1.5 rounded-md transition-all ${
              activeTab === 'custom'
                ? 'bg-white dark:bg-slate-700 shadow-sm text-primary'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Custom
          </button>
        )}
      </div>

      {/* Imagen ilustrativa (oculta en custom si queremos, o genérica) */}
      {activeTab !== 'custom' && (
        <div className="flex justify-center bg-white rounded-lg p-2 border border-slate-200 dark:border-slate-700">
          <img 
            src={activeTab === 'conical' ? '/conica.jpg' : '/recta.jpg'} 
            alt={`Punta ${activeTab === 'conical' ? 'Cónica' : 'Recta'}`}
            className="h-20 object-contain"
          />
        </div>
      )}

      {/* Grid de cards scrollable */}
      <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
        {filteredTips.map(tip => {
          const isSelected = tip.id === activeTipId;
          const isBlack = tip.colorHex === '#1A1A1A';
          const isClear = tip.id.includes('clear');

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
              {activeTip.brand} {activeTip.series}
            </span>
            <span className="text-[9px] font-mono font-bold text-slate-600 dark:text-slate-300">
              Ref. {activeTip.standardRef || 'CUSTOM'}
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
