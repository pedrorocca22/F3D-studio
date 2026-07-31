import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { GlobalSettings } from '../types';
import { InfoTooltip } from './InfoTooltip';

interface AppSettingsDialogProps {
  globalSettings: GlobalSettings;
  onUpdateGlobalSettings: (settings: GlobalSettings) => void;
  onClose: () => void;
}

const LABEL = 'text-[8px] font-black uppercase tracking-[0.12em] text-slate-400';

export const AppSettingsDialog: React.FC<AppSettingsDialogProps> = ({
  globalSettings,
  onUpdateGlobalSettings,
  onClose,
}) => {
  const firmwareType = globalSettings.firmwareType ?? 'reprapfirmware';
  const firmwareSupportsArcs = globalSettings.firmwareSupportsArcs ?? firmwareType === 'reprapfirmware';
  const curveMode = globalSettings.gcodeCurveMode ?? 'linear';

  const update = (patch: Partial<GlobalSettings>) => {
    onUpdateGlobalSettings({ ...globalSettings, ...patch });
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-950/25 px-4 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={event => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-settings-title"
        className="w-full max-w-[430px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/15 dark:border-slate-700 dark:bg-slate-900"
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div>
            <h2 id="app-settings-title" className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-700 dark:text-slate-100">
              Application settings
            </h2>
            <p className="mt-0.5 text-[8px] text-slate-400">Machine compatibility and exported file behavior</p>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-md text-sm text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Close application settings"
          >
            ×
          </button>
        </header>

        <div className="p-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-950/40">
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-700">
              <h3 className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-700 dark:text-slate-200">G-code output</h3>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[7px] font-black uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {curveMode === 'arcs' ? 'G2/G3' : 'Universal'}
              </span>
            </div>

            <div className="space-y-3 p-3">
              <label className="grid grid-cols-[1fr_170px] items-center gap-3">
                <span className={LABEL}>Firmware</span>
                <select
                  value={firmwareType}
                  onChange={event => {
                    const nextFirmware = event.target.value as NonNullable<GlobalSettings['firmwareType']>;
                    const nextSupportsArcs = nextFirmware === 'reprapfirmware';
                    update({
                      firmwareType: nextFirmware,
                      firmwareSupportsArcs: nextSupportsArcs,
                      gcodeCurveMode: nextSupportsArcs ? curveMode : 'linear',
                    });
                  }}
                  className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[9px] font-bold text-slate-700 outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="reprapfirmware">RepRapFirmware</option>
                  <option value="marlin2">Marlin 2</option>
                  <option value="klipper">Klipper</option>
                </select>
              </label>

              {firmwareType !== 'reprapfirmware' && (
                <div className="flex items-center justify-between border-t border-slate-200 pt-3 dark:border-slate-800">
                  <span className="flex items-center gap-1.5 text-[9px] font-bold text-slate-600 dark:text-slate-300">
                    Arc commands available
                    <InfoTooltip content={
                      firmwareType === 'klipper'
                        ? 'Enable only when the Klipper configuration includes [gcode_arcs].'
                        : 'Enable only when Marlin was compiled with ARC_SUPPORT.'
                    } />
                  </span>
                  <button
                    aria-label="Toggle firmware arc support"
                    aria-pressed={firmwareSupportsArcs}
                    onClick={() => {
                      const nextSupportsArcs = !firmwareSupportsArcs;
                      update({
                        firmwareSupportsArcs: nextSupportsArcs,
                        gcodeCurveMode: nextSupportsArcs ? curveMode : 'linear',
                      });
                    }}
                    className={`relative h-4 w-8 rounded-full transition-colors ${firmwareSupportsArcs ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'}`}
                  >
                    <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${firmwareSupportsArcs ? 'right-0.5' : 'left-0.5'}`} />
                  </button>
                </div>
              )}

              <div className="grid grid-cols-[1fr_170px] items-center gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                <span className="flex items-center gap-1.5">
                  <span className={LABEL}>Curves</span>
                  <InfoTooltip content="Linear G1 is universally compatible. Arc fitting replaces compatible paths with compact G2/G3 commands." />
                </span>
                <div className="grid grid-cols-2 gap-1 rounded-md bg-slate-200/70 p-0.5 dark:bg-slate-950">
                  {([
                    ['linear', 'Linear G1'],
                    ['arcs', 'Arcs G2/G3'],
                  ] as const).map(([mode, label]) => {
                    const unavailable = mode === 'arcs' && !firmwareSupportsArcs;
                    const selected = curveMode === mode;
                    return (
                      <button
                        key={mode}
                        disabled={unavailable}
                        onClick={() => update({ gcodeCurveMode: mode })}
                        className={`rounded px-2 py-1.5 text-[7px] font-black uppercase tracking-wide transition-colors ${
                          selected
                            ? 'bg-white text-primary shadow-sm dark:bg-slate-800 dark:text-emerald-300'
                            : unavailable
                              ? 'cursor-not-allowed text-slate-300 dark:text-slate-700'
                              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
};
