import React, { useState, useEffect } from 'react';
import { Icon } from '../Icon';
import { BACKEND_URL } from '../../config';

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
            const res = await fetch(`${BACKEND_URL}/api/wifi/scan`);
            if (!res.ok) throw new Error('Failed to scan for networks');
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
            const res = await fetch(`${BACKEND_URL}/api/wifi/connect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ssid: selectedSsid, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to connect');
            setSuccess(`Successfully connected to ${selectedSsid}.`);
            setTimeout(() => onClose(), 4000);
        } catch (err: any) {
            setError(err.message || 'Error connecting to network.');
        } finally {
            setLoading(false);
        }
    };

    const getSignalIcon = (signalStr: string) => {
        const signal = parseInt(signalStr, 10);
        if (isNaN(signal)) return 'signal_wifi_4_bar';
        if (signal > 75) return 'signal_wifi_4_bar';
        if (signal > 50) return 'network_wifi_3_bar';
        if (signal > 25) return 'network_wifi_2_bar';
        return 'network_wifi_1_bar';
    };

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-outline-variant/30 w-[440px] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="p-4 border-b border-outline-variant/10 flex justify-between items-center bg-slate-50">
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-800 flex items-center gap-2">
                        <Icon name="wifi_tethering" className="text-[14px] text-primary" />
                        Network_Config // Setup
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-800 transition-colors">
                        <Icon name="close" className="text-lg" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {error && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-100 flex gap-3 items-start">
                            <Icon name="error_outline" className="text-red-600 text-[16px] mt-0.5" />
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black uppercase text-red-600 tracking-tight">System_Error</span>
                                <span className="text-[11px] text-red-700 leading-tight">{error}</span>
                            </div>
                        </div>
                    )}

                    {success && (
                        <div className="mb-6 p-4 bg-teal-50 border border-teal-100 flex gap-3 items-start">
                            <Icon name="check_circle_outline" className="text-teal-600 text-[16px] mt-0.5" />
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black uppercase text-teal-600 tracking-tight">Connection_Established</span>
                                <span className="text-[11px] text-teal-700 leading-tight">{success}</span>
                            </div>
                        </div>
                    )}

                    {!selectedSsid ? (
                        <>
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Available_Nodes</span>
                                <button
                                    onClick={scanNetworks}
                                    disabled={scanning}
                                    className="text-[10px] font-black uppercase text-primary hover:opacity-70 flex items-center gap-1.5 transition-all disabled:opacity-30"
                                >
                                    <Icon name="sync" className={scanning ? 'animate-spin' : ''} />
                                    Scan
                                </button>
                            </div>

                            <div className="border border-outline-variant/10 bg-slate-50 divide-y divide-outline-variant/5 max-h-[300px] overflow-y-auto custom-scrollbar">
                                {scanning && networks.length === 0 ? (
                                    <div className="p-12 text-center flex flex-col items-center gap-3">
                                        <div className="w-8 h-8 border-2 border-primary border-t-transparent animate-spin"></div>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Scanning_Frequencies</span>
                                    </div>
                                ) : networks.length === 0 ? (
                                    <div className="p-12 text-center">
                                        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">No_Nodes_Found</span>
                                    </div>
                                ) : (
                                    networks.map((net, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setSelectedSsid(net.ssid)}
                                            className="w-full text-left p-4 hover:bg-white flex justify-between items-center group transition-all"
                                        >
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-black text-slate-700 group-hover:text-primary transition-colors">
                                                    {net.ssid}
                                                </span>
                                                <span className="text-[9px] text-slate-400 uppercase font-bold tracking-tight">
                                                    {net.security !== '--' ? 'NODE_SECURE' : 'NODE_OPEN'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-[10px] font-mono font-bold text-slate-400">{net.signal}%</span>
                                                <Icon name={getSignalIcon(net.signal)} className="text-slate-300 group-hover:text-primary/40 transition-colors" />
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="space-y-6 animate-in slide-in-from-right-2 duration-300">
                            <button
                                onClick={() => { setSelectedSsid(null); setPassword(''); }}
                                className="text-[10px] font-black uppercase text-slate-400 hover:text-slate-800 flex items-center gap-1.5 transition-all"
                            >
                                <Icon name="arrow_back" className="text-[12px]" />
                                Back_to_Nodes
                            </button>

                            <div className="p-6 bg-slate-50 border border-outline-variant/10 text-center">
                                <span className="text-[10px] font-black uppercase text-primary tracking-[0.2em] mb-2 block">SELECTED_SSID</span>
                                <h4 className="text-lg font-black text-slate-800">{selectedSsid}</h4>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block ml-1">Access_Token</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="Enter network passphrase"
                                    autoFocus
                                    className="w-full bg-white border border-outline-variant/20 p-3 text-[12px] font-bold outline-none focus:border-primary transition-all placeholder:opacity-30"
                                />
                            </div>

                            <button
                                onClick={handleConnect}
                                disabled={loading}
                                className="w-full py-4 bg-slate-800 hover:bg-black text-white text-[11px] font-black uppercase tracking-[0.2em] transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                            >
                                {loading && <Icon name="sync" className="animate-spin" />}
                                {loading ? 'Establishing_Handshake' : 'Authorize_Link'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
