import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './Icon';

interface CalibrationToolProps {
    onClose: () => void;
}

export const CalibrationTool: React.FC<CalibrationToolProps> = ({ onClose }) => {
    const [isOn, setIsOn] = useState(false);
    const [grayValue, setGrayValue] = useState(0);
    const [duration, setDuration] = useState(120);
    const [estimatedIrradiance, setEstimatedIrradiance] = useState(0);
    const [status, setStatus] = useState<string>("");
    const [error, setError] = useState<string | null>(null);
    const [calibMode, setCalibMode] = useState<'gray' | 'grid'>('gray');

    // RPi IP - usually same origin if served from RPi, or hardcoded for dev
    // In dev mode (vite), we might need a proxy or hardcoded IP.
    // Assuming the user runs this on PC accessing RPi.
    const RPI_URL = "http://192.168.137.148:5000";

    // Calculate estimated irradiance based on gray value
    // Formula: Irradiance ~= 0.083 * gray (Linear approximation from calibration)
    useEffect(() => {
        // Estimacion de irradiancia basada en calibracion completa 2026-02-20
        // Pendiente media medida: ~0.091 mW/cm2 por nivel de gris (rango 0-255)
        setEstimatedIrradiance(0.091 * grayValue);
    }, [grayValue]);

    const abortControllerRef = useRef<AbortController | null>(null);

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const handleExpose = async () => {
        setStatus("Initializing...");
        setError(null);
        setIsOn(true);

        try {
            abortControllerRef.current = new AbortController();

            // 1. Setup (Idempotent)
            const setupRes = await fetch(`${RPI_URL}/calibration/setup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pwm: 700, mode: 'grayscale' }),
                signal: abortControllerRef.current.signal
            });
            if (!setupRes.ok) throw new Error("Setup failed");

            await sleep(500); // Wait for mode switch to settle

            // 2. Set Image
            const displayValue = calibMode === 'grid' ? 'grid' : grayValue;
            setStatus(`Setting ${calibMode === 'grid' ? 'Grid' : 'Gray ' + grayValue}...`);
            const grayRes = await fetch(`${RPI_URL}/calibration/gray`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gray: displayValue }),
                signal: abortControllerRef.current.signal
            });
            if (!grayRes.ok) throw new Error("Set image failed");

            await sleep(200); // Briefly wait for image to load

            // 3. Expose
            setStatus(`Exposing ${calibMode === 'grid' ? 'Grid' : 'Gray ' + grayValue} for ${duration}s...`);
            const exposeRes = await fetch(`${RPI_URL}/projector/expose`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ duration: duration }),
                signal: abortControllerRef.current.signal
            });
            if (!exposeRes.ok) throw new Error("Expose failed or cancelled");

            setStatus("Exposure Finished");

            // Automatically turn OFF when finished
            await handleOff();

        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                setStatus("Cancelled");
            } else {
                setError(err instanceof Error ? err.message : "Command failed");
                setStatus("Error");
                setIsOn(false);
            }
        } finally {
            abortControllerRef.current = null;
        }
    };

    const handleOff = async () => {
        setStatus("Stopping...");

        // Abort ongoing exposure fetch if any
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        try {
            await fetch(`${RPI_URL}/projector/off`, { method: 'POST' });
            setIsOn(false);
            setStatus("Projector OFF");
        } catch (err) {
            setError("Failed to stop");
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-[400px] border border-slate-200 dark:border-slate-700 overflow-hidden">

                {/* Header */}
                <div className="bg-slate-100 dark:bg-slate-900 px-6 py-4 flex justify-between items-center border-b border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                        <Icon name="biotech" className="text-primary text-xl" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100">Manual Calibration</h3>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                        <Icon name="close" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">

                    {/* Status Display */}
                    <div className={`p-4 rounded-xl border ${isOn ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800' : 'bg-slate-50 border-slate-200 dark:bg-slate-900/50 dark:border-slate-700'} transition-colors`}>
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-xs uppercase font-bold text-slate-500 dark:text-slate-400">Status</span>
                            {isOn && <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse" />}
                        </div>
                        <div className="font-mono text-sm text-slate-700 dark:text-slate-300">
                            {error ? <span className="text-red-500">{error}</span> : (status || "Ready")}
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="space-y-4">

                        {/* Mode Selector */}
                        <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                            <button
                                onClick={() => setCalibMode('gray')}
                                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${calibMode === 'gray' ? 'bg-white dark:bg-slate-800 text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Grayscale
                            </button>
                            <button
                                onClick={() => setCalibMode('grid')}
                                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${calibMode === 'grid' ? 'bg-white dark:bg-slate-800 text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Calibration Grid
                            </button>
                        </div>

                        {/* Gray Slider (Only if gray mode) */}
                        {calibMode === 'gray' && (
                            <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                <div className="flex justify-between">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Gray Value</label>
                                    <span className="text-sm font-mono bg-slate-100 dark:bg-slate-700 px-2 rounded text-slate-800 dark:text-slate-200">{grayValue}</span>
                                </div>
                                <input
                                    type="range"
                                    min="0" max="255"
                                    value={grayValue}
                                    onChange={(e) => setGrayValue(Number(e.target.value))}
                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700 accent-primary"
                                />
                                <div className="text-xs text-right text-slate-500">
                                    Est. Irradiance: <span className="font-bold text-primary">{estimatedIrradiance.toFixed(2)} mW/cm²</span>
                                </div>
                            </div>
                        )}

                        {calibMode === 'grid' && (
                            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 animate-in fade-in slide-in-from-top-1 duration-200">
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed text-center">
                                    Proyecta una malla de calibración para ajustar el enfoque y la distorsión del proyector.
                                </p>
                            </div>
                        )}

                        {/* Duration Input */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Duration (seconds)</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    value={duration}
                                    onChange={(e) => setDuration(Number(e.target.value))}
                                    className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                                <span className="text-slate-400 text-sm">s</span>
                            </div>
                        </div>

                    </div>

                    {/* Actions */}
                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <button
                            onClick={handleOff}
                            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-medium transition-all active:scale-95"
                        >
                            <Icon name="power_settings_new" />
                            OFF
                        </button>

                        <button
                            onClick={handleExpose}
                            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-primary hover:bg-primary-dark shadow-lg shadow-primary/25 text-white font-medium transition-all active:scale-95"
                        >
                            <Icon name="light_mode" />
                            Expose
                        </button>
                    </div>

                </div>
            </div>
        </div>
    );
};
