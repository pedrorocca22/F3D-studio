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
            case 'PRINTING': return '#2f6098';
            case 'PAUSED': return '#586064';
            case 'COMPLETED': return '#1e4620';
            case 'ERROR': return '#b71c1c';
            default: return '#abb3b7';
        }
    };

    const getStateLabel = (): string => {
        switch (status.state) {
            case 'PRINTING': return 'STATION ACTIVE';
            case 'PAUSED': return 'STATION PAUSED';
            case 'COMPLETED': return 'PROCESS COMPLETE';
            case 'ERROR': return 'HARDWARE ERROR';
            case 'IDLE': return 'SYSTEM READY';
            default: return status.state;
        }
    };

    const isFinished = status.state === 'COMPLETED' || status.state === 'IDLE';
    const isError = status.state === 'ERROR';

    return (
        <div className="absolute inset-0 z-[60] bg-[#f1f4f6]/80 backdrop-blur-sm flex items-center justify-center">
            <div className="relative w-full max-w-[440px] bg-white border border-outline-variant/30 shadow-2xl p-0">
                {/* Header Section */}
                <div className="border-b border-outline-variant/20 p-6 flex justify-between items-start">
                    <div>
                        <span className="label-clinical mb-1 block">Production Status</span>
                        <h2 className="text-xl font-black tracking-tight leading-none" style={{ color: getStateColor() }}>
                            {getStateLabel()}
                        </h2>
                        <span className="text-[10px] text-[#abb3b7] font-mono mt-2 block font-bold">
                            SESSION_ID // {jobId.substring(0, 12).toUpperCase()}
                        </span>
                    </div>
                    <div className="text-right">
                        <span className="text-3xl font-black tabular-nums tracking-tighter" style={{ color: getStateColor() }}>
                            {Math.round(progress)}%
                        </span>
                    </div>
                </div>

                {/* Progress Bar Tonal */}
                <div className="h-1 bg-surface-container w-full overflow-hidden">
                    <div
                        className="h-full transition-all duration-700 ease-out"
                        style={{
                            width: `${Math.max(progress, 0.5)}%`,
                            backgroundColor: getStateColor(),
                        }}
                    />
                </div>

                {/* Data Grid Section */}
                <div className="p-6 grid grid-cols-2 gap-px bg-outline-variant/20">
                    <div className="bg-white p-4">
                        <span className="label-clinical opacity-50 block mb-1">Process Layer</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-lg font-black">{currentLayer}</span>
                            <span className="text-xs text-[#abb3b7]">/ {status.total_layers}</span>
                        </div>
                    </div>
                    <div className="bg-white p-4">
                        <span className="label-clinical opacity-50 block mb-1">Active Dose</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-lg font-black">{currentLayerData?.exposure_time?.toFixed(1) ?? '—'}</span>
                            <span className="text-xs text-[#abb3b7]">S</span>
                        </div>
                    </div>
                    <div className="bg-white p-4">
                        <span className="label-clinical opacity-50 block mb-1">Temporal Elapsed</span>
                        <span className="text-lg font-black tabular-nums">{formatTime(elapsedSeconds)}</span>
                    </div>
                    <div className="bg-white p-4">
                        <span className="label-clinical opacity-50 block mb-1">Temporal Est. Rem</span>
                        <span className="text-lg font-black tabular-nums">
                            {currentLayer > 2 ? formatTime(estimatedRemainingSeconds) : '—'}
                        </span>
                    </div>
                </div>

                {/* Control Footer */}
                <div className="p-6 pt-2 flex items-center gap-3">
                    {!isFinished && !isError ? (
                        <>
                            <button
                                onClick={handlePauseResume}
                                className="flex-1 py-3 border border-outline-variant/30 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all"
                            >
                                {status.state === 'PAUSED' ? 'Resume Session' : 'Hold Session'}
                            </button>
                            <button
                                onClick={handleStop}
                                disabled={isStopping}
                                className="flex-1 py-3 bg-[#b71c1c] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#8e1616] transition-all disabled:opacity-50"
                            >
                                {isStopping ? 'Terminating...' : 'Abort Process'}
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => {
                                onStopped();
                                onClose();
                            }}
                            className="w-full py-4 bg-primary text-white text-[10px] font-black uppercase tracking-widest hover:bg-primary-dark transition-all"
                        >
                            Back to Workspace
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
    );
};
