import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './Icon';

interface PrintMonitorProps {
    jobId: string;
    totalLayers: number;
    layersData: Array<{
        filename: string;
        exposure_time: number;
        z_height_mm: number;
        physical_layer_idx: number;
    }>;
    onClose: () => void;
    onStopped: () => void;
}

const BACKEND_URL = "http://127.0.0.1:8000";

type PrintState = 'IDLE' | 'PRINTING' | 'PAUSED' | 'COMPLETED' | 'ERROR';

interface PrintStatus {
    state: PrintState;
    current_layer: number;
    total_layers: number;
    job_id: string | null;
    progress: number;
}

export const PrintMonitor: React.FC<PrintMonitorProps> = ({
    jobId,
    totalLayers,
    layersData,
    onClose,
    onStopped,
}) => {
    const [status, setStatus] = useState<PrintStatus>({
        state: 'PRINTING',
        current_layer: 0,
        total_layers: totalLayers,
        job_id: jobId,
        progress: 0,
    });
    const [startTime] = useState<number>(Date.now());
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [isStopping, setIsStopping] = useState(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Poll print status
    useEffect(() => {
        const poll = async () => {
            try {
                const res = await fetch(`${BACKEND_URL}/print/status`);
                if (res.ok) {
                    const data: PrintStatus = await res.json();
                    setStatus(data);
                }
            } catch (e) {
                console.error('Poll error:', e);
            }
        };

        poll(); // Immediate first poll
        pollRef.current = setInterval(poll, 1000);

        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, []);

    // Elapsed time counter
    useEffect(() => {
        timerRef.current = setInterval(() => {
            setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
        }, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [startTime]);

    const handleStop = async () => {
        if (!confirm('Are you sure you want to cancel the print?')) return;
        setIsStopping(true);
        try {
            await fetch(`${BACKEND_URL}/print/stop`, { method: 'POST' });
        } catch (e) {
            console.error('Stop error:', e);
        }
        setIsStopping(false);
    };

    const handlePauseResume = async () => {
        try {
            if (status.state === 'PAUSED') {
                await fetch(`${BACKEND_URL}/print/resume`, { method: 'POST' });
            } else if (status.state === 'PRINTING') {
                await fetch(`${BACKEND_URL}/print/pause`, { method: 'POST' });
            }
        } catch (e) {
            console.error('Pause/Resume error:', e);
        }
    };

    // Calculate time estimates
    const currentLayer = status.current_layer;
    const progress = status.total_layers > 0
        ? (currentLayer / status.total_layers) * 100
        : 0;

    // Estimate remaining time based on average time per layer so far
    const avgTimePerLayer = currentLayer > 0 ? elapsedSeconds / currentLayer : 0;
    const remainingLayers = status.total_layers - currentLayer;
    const estimatedRemainingSeconds = Math.round(avgTimePerLayer * remainingLayers);

    // Get current layer data for display
    const currentLayerData = layersData[Math.min(currentLayer, layersData.length - 1)];

    // Calculate total exposure time for ETA (fallback if no elapsed data)
    const totalExposureTime = layersData.reduce((sum, l) => sum + (l.exposure_time || 0), 0);

    const formatTime = (totalSeconds: number): string => {
        if (totalSeconds < 0 || !isFinite(totalSeconds)) return '--:--';
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
        return `${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
    };

    const getStateColor = (): string => {
        switch (status.state) {
            case 'PRINTING': return '#22c55e';
            case 'PAUSED': return '#f59e0b';
            case 'COMPLETED': return '#3b82f6';
            case 'ERROR': return '#ef4444';
            default: return '#64748b';
        }
    };

    const getStateLabel = (): string => {
        switch (status.state) {
            case 'PRINTING': return 'PRINTING';
            case 'PAUSED': return 'PAUSED';
            case 'COMPLETED': return 'PRINT COMPLETE';
            case 'ERROR': return 'ERROR';
            case 'IDLE': return 'IDLE';
            default: return status.state;
        }
    };

    const getStateIcon = (): string => {
        switch (status.state) {
            case 'PRINTING': return 'fiber_manual_record';
            case 'PAUSED': return 'pause_circle';
            case 'COMPLETED': return 'check_circle';
            case 'ERROR': return 'error';
            default: return 'radio_button_unchecked';
        }
    };

    const isFinished = status.state === 'COMPLETED' || status.state === 'IDLE';
    const isError = status.state === 'ERROR';

    return (
        <div className="absolute inset-0 z-[60] bg-[#0d0d0d] flex items-center justify-center">
            {/* Subtle animated background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div
                    className="absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage: `radial-gradient(circle at 50% 50%, ${getStateColor()} 0%, transparent 70%)`,
                        transition: 'background-image 1s ease',
                    }}
                />
            </div>

            <div className="relative w-full max-w-[400px] mx-4">
                {/* Main Card */}
                <div className="rounded-lg border border-slate-200/10 bg-slate-900/90 backdrop-blur-md overflow-hidden">
                    {/* Header */}
                    <div className="px-4 pt-4 pb-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Icon
                                    name={getStateIcon()}
                                    className="text-lg"
                                    style={{ color: getStateColor() }}
                                />
                                <div>
                                    <h2
                                        className="text-sm font-semibold tracking-tight"
                                        style={{ color: getStateColor() }}
                                    >
                                        {getStateLabel()}
                                    </h2>
                                    <span className="text-[9px] text-slate-500 font-mono">
                                        JOB #{jobId.substring(0, 8).toUpperCase()}
                                    </span>
                                </div>
                            </div>

                            {/* Percentage Badge */}
                            <div
                                className="text-xl font-bold tabular-nums tracking-tight"
                                style={{ color: getStateColor() }}
                            >
                                {Math.round(progress)}
                                <span className="text-xs text-slate-500 ml-0.5">%</span>
                            </div>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="px-4 pb-3">
                        <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden relative">
                            <div
                                className="h-full rounded-full transition-all duration-700 ease-out"
                                style={{
                                    width: `${Math.max(progress, 0.5)}%`,
                                    backgroundColor: getStateColor(),
                                }}
                            />
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="px-4 pb-4">
                        <div className="grid grid-cols-2 gap-2">
                            {/* Layer Progress */}
                            <div className="bg-slate-800/40 rounded p-2 border border-slate-700/30">
                                <div className="flex items-center gap-1 mb-1">
                                    <Icon name="layers" className="text-[10px] text-slate-500" />
                                    <span className="text-[8px] text-slate-500 uppercase font-semibold">Layer</span>
                                </div>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-sm font-bold text-slate-200 tabular-nums">{currentLayer}</span>
                                    <span className="text-[9px] text-slate-500">/ {status.total_layers}</span>
                                </div>
                            </div>

                            {/* Current Exposure */}
                            <div className="bg-slate-800/40 rounded p-2 border border-slate-700/30">
                                <div className="flex items-center gap-1 mb-1">
                                    <Icon name="wb_sunny" className="text-[10px] text-slate-500" />
                                    <span className="text-[8px] text-slate-500 uppercase font-semibold">Exposure</span>
                                </div>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-sm font-bold text-slate-200 tabular-nums">
                                        {currentLayerData?.exposure_time?.toFixed(1) ?? '—'}
                                    </span>
                                    <span className="text-[9px] text-slate-500">s</span>
                                </div>
                            </div>

                            {/* Elapsed Time */}
                            <div className="bg-slate-800/40 rounded p-2 border border-slate-700/30">
                                <div className="flex items-center gap-1 mb-1">
                                    <Icon name="timer" className="text-[10px] text-slate-500" />
                                    <span className="text-[8px] text-slate-500 uppercase font-semibold">Elapsed</span>
                                </div>
                                <span className="text-sm font-bold text-slate-200 tabular-nums">
                                    {formatTime(elapsedSeconds)}
                                </span>
                            </div>

                            {/* Remaining Time */}
                            <div className="bg-slate-800/40 rounded p-2 border border-slate-700/30">
                                <div className="flex items-center gap-1 mb-1">
                                    <Icon name="hourglass_bottom" className="text-[10px] text-slate-500" />
                                    <span className="text-[8px] text-slate-500 uppercase font-semibold">Remaining</span>
                                </div>
                                <span className="text-sm font-bold text-slate-200 tabular-nums">
                                    {currentLayer > 2 ? formatTime(estimatedRemainingSeconds) : '—'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="px-4 py-3 border-t border-slate-700/30 flex items-center gap-2 bg-slate-900/40">
                        {!isFinished && !isError ? (
                            <>
                                {/* Pause / Resume */}
                                <button
                                    onClick={handlePauseResume}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-medium transition-all btn-transition"
                                    style={{
                                        background: status.state === 'PAUSED' ? '#22c55e20' : '#f59e0b18',
                                        color: status.state === 'PAUSED' ? '#22c55e' : '#f59e0b',
                                    }}
                                >
                                    <Icon
                                        name={status.state === 'PAUSED' ? 'play_arrow' : 'pause'}
                                        className="text-xs"
                                    />
                                    {status.state === 'PAUSED' ? 'Resume' : 'Pause'}
                                </button>

                                {/* Cancel */}
                                <button
                                    onClick={handleStop}
                                    disabled={isStopping}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-medium transition-all btn-transition ml-auto disabled:opacity-50"
                                    style={{
                                        background: '#ef444418',
                                        color: '#ef4444',
                                    }}
                                >
                                    <Icon name="stop" className="text-xs" />
                                    {isStopping ? 'Stopping...' : 'Cancel Print'}
                                </button>
                            </>
                        ) : (
                            <>
                                {/* Done / Error state */}
                                <div className="flex-1 text-center">
                                    <span
                                        className="text-[10px] font-semibold"
                                        style={{ color: isError ? '#ef4444' : '#22c55e' }}
                                    >
                                        {isError
                                            ? 'An error occurred during printing.'
                                            : `Print completed in ${formatTime(elapsedSeconds)}`}
                                    </span>
                                </div>
                                <button
                                    onClick={() => {
                                        onStopped();
                                        onClose();
                                    }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-medium transition-all btn-transition bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                                >
                                    <Icon name="arrow_back" className="text-xs" />
                                    Back to Preview
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Shimmer animation keyframes */}
            <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
        </div>
    );
};
