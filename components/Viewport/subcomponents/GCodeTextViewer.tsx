import React from 'react';
import { Icon } from '../../Icon';

interface GCodeTextViewerProps {
  gcodeRaw: string | null;
  gcodeParsed: any;
  allLines: string[];
  layerMap: Record<number, { start: number; end: number }>;
  gcodeLayer: number;
  gcodeUrl: string | null;
  gcodeScrollRef: React.RefObject<HTMLDivElement>;
  activeLineRef: React.RefObject<HTMLDivElement>;
}

export const GCodeTextViewer: React.FC<GCodeTextViewerProps> = ({
  gcodeRaw,
  gcodeParsed,
  allLines,
  layerMap,
  gcodeLayer,
  gcodeUrl,
  gcodeScrollRef,
  activeLineRef
}) => {
  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-inner">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
        <div className="flex items-center gap-2">
          <Icon name="code" className="text-primary text-[11px]" />
          <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">G-Code File</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[8px] text-slate-400 font-mono">{(gcodeRaw || '').split('\n').length} LINES</span>
          <span className="text-[8px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded uppercase tracking-tighter">Layer {gcodeLayer}</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        {gcodeRaw ? (
          <div className="h-full flex flex-col min-h-0">
            {gcodeParsed && allLines.length > 0 ? (
              <div 
                ref={gcodeScrollRef}
                className="flex-1 overflow-y-auto min-h-0 custom-scrollbar scroll-smooth p-2"
              >
                <div className="space-y-0.5">
                  {allLines.map((line, idx) => {
                    const boundary = layerMap[gcodeLayer];
                    const isActive = boundary && idx >= boundary.start && idx <= boundary.end;
                    const isStartOfLayer = boundary && idx === boundary.start;

                    let lineColor = 'text-slate-500 dark:text-slate-400';
                    if (line.includes(';')) {
                      lineColor = 'text-slate-400 dark:text-slate-500 opacity-60';
                    } else if (line.startsWith('G0') || line.startsWith('G1')) {
                      if (line.includes('E') && !line.includes('E0')) {
                        if (line.includes('T0')) lineColor = 'text-blue-600 dark:text-blue-400';
                        else if (line.includes('T1')) lineColor = 'text-green-600 dark:text-green-400';
                        else if (line.includes('T2')) lineColor = 'text-purple-600 dark:text-purple-400';
                        else lineColor = 'text-amber-600 dark:text-amber-400';
                      } else if (line.match(/X|Y|Z/) && !line.includes('E')) {
                        lineColor = 'text-orange-600 dark:text-orange-400';
                      }
                    }
                    
                    return (
                      <div 
                        key={idx} 
                        ref={isStartOfLayer ? activeLineRef : null}
                        className={`font-mono text-[8px] flex items-start gap-3 transition-colors ${isActive ? 'bg-primary/10 dark:bg-primary/20 ring-1 ring-primary/20 rounded-sm' : 'hover:bg-slate-100 dark:hover:bg-slate-800/50'}`}
                      >
                        <span className={`inline-block w-8 text-right select-none shrink-0 ${isActive ? 'text-primary font-bold' : 'text-slate-300 dark:text-slate-700'}`}>
                          {idx + 1}
                        </span>
                        <span className={`${lineColor} break-all`}>{line}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <pre className="flex-1 text-[8px] font-mono text-slate-600 dark:text-slate-300 p-3 overflow-y-auto whitespace-pre-wrap break-all">
                {gcodeRaw}
              </pre>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-50">
            <Icon name="inbox" className="text-3xl mb-2" />
            <span className="text-[10px] font-medium uppercase tracking-widest">No G-Code Generated</span>
          </div>
        )}
      </div>

      {gcodeUrl && (
        <div className="p-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/50">
          <a
            href={gcodeUrl}
            download="print.gcode"
            className="flex items-center justify-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-primary hover:text-white text-slate-600 dark:text-slate-300 text-[9px] font-bold rounded border border-slate-200 dark:border-slate-700 transition-all uppercase w-full shadow-sm"
          >
            <Icon name="download" className="text-sm" />
            Download G-Code
          </a>
        </div>
      )}
    </div>
  );
};
