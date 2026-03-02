import React, { useState, useEffect } from 'react';
import { Icon } from '../Icon';

interface WifiNetwork {
    ssid: string;
    signal: string;
    security: string;
}

interface WifiConfigProps {
    onClose: () => void;
}

export const WifiConfig: React.FC<WifiConfigProps> = ({ onClose }) => {
    const [networks, setNetworks] = useState<WifiNetwork[]>([]);
    const [loading, setLoading] = useState(false);
    const [scanning, setScanning] = useState(true);
    const [selectedSsid, setSelectedSsid] = useState<string | null>(null);
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const scanNetworks = async () => {
        setScanning(true);
        setError(null);
        try {
            const res = await fetch('http://127.0.0.1:8000/api/wifi/scan');
            if (!res.ok) {
                throw new Error('Failed to scan for networks');
            }
            const data = await res.json();
            setNetworks(data);
        } catch (err: any) {
            setError(err.message || 'Error occurred while scanning networks.');
        } finally {
            setScanning(false);
        }
    };

    useEffect(() => {
        scanNetworks();
    }, []);

    const handleConnect = async () => {
        if (!selectedSsid) return;

        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const res = await fetch('http://127.0.0.1:8000/api/wifi/connect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ssid: selectedSsid, password })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to connect');
            }

            setSuccess(`Successfully connected to ${selectedSsid}! The printer will now join this network.`);
            setTimeout(() => {
                onClose();
            }, 4000);
        } catch (err: any) {
            setError(err.message || 'Error connecting to network.');
        } finally {
            setLoading(false);
        }
    };

    // Signal strength helper (assume signal is 0-100)
    const getSignalIcon = (signalStr: string) => {
        const signal = parseInt(signalStr, 10);
        if (isNaN(signal)) return 'signal_wifi_4_bar';
        if (signal > 75) return 'signal_wifi_4_bar';
        if (signal > 50) return 'network_wifi_3_bar';
        if (signal > 25) return 'network_wifi_2_bar';
        return 'network_wifi_1_bar';
    };

    return (
        <div className="absolute inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl w-[450px] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
                    <h3 className="text-lg font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
                        <Icon name="wifi" className="text-primary" /> Network Setup
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
                        <Icon name="close" className="text-xl" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-5 overflow-y-auto max-h-[60vh]">
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-600 dark:text-red-400 text-sm flex gap-2">
                            <Icon name="error" className="shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}

                    {success && (
                        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-green-700 dark:text-green-400 text-sm flex gap-2">
                            <Icon name="check_circle" className="shrink-0 mt-0.5" />
                            <span>{success}</span>
                        </div>
                    )}

                    {!selectedSsid ? (
                        // Network List View
                        <>
                            <div className="flex justify-between items-end mb-3">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Available Networks</p>
                                <button
                                    onClick={scanNetworks}
                                    disabled={scanning}
                                    className="text-xs text-primary hover:text-blue-600 flex items-center gap-1 font-semibold disabled:opacity-50"
                                >
                                    <Icon name="refresh" className={`text-sm ${scanning ? 'animate-spin' : ''}`} /> Scan
                                </button>
                            </div>

                            <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-900/50">
                                {scanning && networks.length === 0 ? (
                                    <div className="p-8 text-center text-slate-500 text-sm flex flex-col items-center gap-2">
                                        <Icon name="radar" className="text-2xl animate-pulse text-slate-400" />
                                        Scanning for networks...
                                    </div>
                                ) : networks.length === 0 ? (
                                    <div className="p-8 text-center text-slate-500 text-sm">
                                        No networks found.
                                    </div>
                                ) : (
                                    <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[250px] overflow-y-auto w-full scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600">
                                        {networks.map((net, i) => (
                                            <li key={i}>
                                                <button
                                                    onClick={() => setSelectedSsid(net.ssid)}
                                                    className="w-full text-left p-3 hover:bg-slate-100 dark:hover:bg-slate-700/50 flex justify-between items-center transition-colors group"
                                                >
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold text-sm text-slate-700 dark:text-slate-200 group-hover:text-primary transition-colors">
                                                            {net.ssid}
                                                        </span>
                                                        {net.security && net.security !== '--' && (
                                                            <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                                                <Icon name="lock" className="text-[10px]" /> Secured
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-slate-400">
                                                        <span className="text-xs font-mono">{net.signal}%</span>
                                                        <Icon name={getSignalIcon(net.signal)} className="text-base" />
                                                    </div>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </>
                    ) : (
                        // Password Entry View
                        <div className="space-y-4 animate-in slide-in-from-right-4 duration-200">
                            <button
                                onClick={() => { setSelectedSsid(null); setPassword(''); }}
                                className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 -mt-2 opacity-80"
                            >
                                <Icon name="arrow_back" className="text-[11px]" /> Back to networks
                            </button>

                            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-900/40 text-center">
                                <Icon name="wifi_tethering" className="text-3xl text-primary mb-2" />
                                <h4 className="font-bold text-slate-800 dark:text-slate-100">{selectedSsid}</h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Enter password to connect printer</p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-1 ml-1">Password</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="Network password"
                                    autoFocus
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary/50 outline-none transition-all placeholder:text-slate-400"
                                />
                            </div>

                            <button
                                onClick={handleConnect}
                                disabled={loading}
                                className="w-full py-3 bg-primary hover:bg-blue-600 text-white font-bold rounded-lg shadow-sm transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {loading ? <Icon name="sync" className="animate-spin text-lg" /> : <Icon name="login" className="text-lg" />}
                                {loading ? 'Connecting...' : 'Connect to Network'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
