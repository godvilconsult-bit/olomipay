'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Camera, CheckCircle2, AlertCircle, Zap, QrCode } from 'lucide-react';

// ── SEP-0007 URI parser ────────────────────────────────────────────────────────
function parseStellarUri(raw: string): {
  valid:       boolean;
  destination: string;
  amount?:     string;
  assetCode?:  string;
  memo?:       string;
  network?:    string;
} | null {
  try {
    // Handle web+stellar:pay?... format
    if (!raw.startsWith('web+stellar:') && !raw.startsWith('stellar:')) {
      // Maybe it's just a raw Stellar address (G...)
      if (/^G[A-Z0-9]{55}$/.test(raw.trim())) {
        return { valid: true, destination: raw.trim() };
      }
      return null;
    }

    const uri   = raw.replace(/^web\+stellar:/, '').replace(/^stellar:/, '');
    const [op, queryStr] = uri.split('?');
    if (op !== 'pay') return null;

    const params      = new URLSearchParams(queryStr);
    const destination = params.get('destination') ?? '';
    if (!destination || !/^G[A-Z0-9]{55}$/.test(destination)) return null;

    return {
      valid:       true,
      destination,
      amount:      params.get('amount')      ?? undefined,
      assetCode:   params.get('asset_code')  ?? undefined,
      memo:        params.get('memo')        ?? undefined,
      network:     params.get('network_passphrase') ?? undefined,
    };
  } catch {
    return null;
  }
}

export default function ScanPage() {
  const router = useRouter();
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const scannerRef  = useRef<any>(null);
  const [scanning,  setScanning]  = useState(false);
  const [result,    setResult]    = useState<any>(null);
  const [error,     setError]     = useState('');
  const [manualInput, setManualInput] = useState('');
  const [tab,       setTab]       = useState<'scan' | 'manual'>('scan');

  // Start camera
  const startCamera = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setScanning(true);
      startScanLoop();
    } catch (e: any) {
      setError(`Camera access denied: ${e.message}. Use the manual tab below.`);
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => {
    // Load jsQR dynamically for client-side only
    if (tab === 'scan') startCamera();
    return () => stopCamera();
  }, [tab]);

  // Scan loop using canvas + jsQR
  const startScanLoop = useCallback(() => {
    let rafId: number;
    async function tick() {
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { rafId = requestAnimationFrame(tick); return; }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      try {
        const jsQR = (await import('jsqr')).default;
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });
        if (code?.data) {
          handleScannedData(code.data);
          return; // Stop scanning after success
        }
      } catch {}

      rafId = requestAnimationFrame(tick);
      scannerRef.current = rafId;
    }
    tick();
  }, []);

  function handleScannedData(raw: string) {
    stopCamera();
    const parsed = parseStellarUri(raw.trim());
    if (!parsed) {
      setError(`Not a valid Stellar QR code.\nScanned: ${raw.slice(0, 80)}`);
      return;
    }
    setResult(parsed);
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualInput.trim()) return;
    handleScannedData(manualInput.trim());
  }

  function goToSend() {
    if (!result) return;
    const params = new URLSearchParams({ to: result.destination });
    if (result.amount)    params.set('amount', result.amount);
    if (result.assetCode) params.set('asset',  result.assetCode);
    if (result.memo)      params.set('memo',   result.memo);
    router.push(`/send?${params.toString()}`);
  }

  function rescan() {
    setResult(null);
    setError('');
    if (tab === 'scan') startCamera();
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 bg-black/80 backdrop-blur-sm z-20">
        <button onClick={() => { stopCamera(); router.back(); }}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold">Scan Stellar QR</h1>
        <div className="ml-auto flex gap-1">
          <button onClick={() => setTab('scan')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold ${tab === 'scan' ? 'bg-primary' : 'bg-white/10'}`}>
            📷 Scan
          </button>
          <button onClick={() => { stopCamera(); setTab('manual'); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold ${tab === 'manual' ? 'bg-primary' : 'bg-white/10'}`}>
            ✏️ Manual
          </button>
        </div>
      </div>

      {/* ── Scan tab ──────────────────────────────────────────────────────── */}
      {tab === 'scan' && !result && (
        <div className="relative flex-1 flex flex-col items-center justify-center">
          {/* Camera feed */}
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
          <canvas ref={canvasRef} className="hidden" />

          {/* Overlay */}
          <div className="relative z-10 flex flex-col items-center gap-6 px-8">
            {/* Viewfinder */}
            <div className="relative w-64 h-64">
              <div className="absolute inset-0 border-2 border-white/20 rounded-2xl" />
              {/* Corner brackets */}
              {[
                'top-0 left-0 border-l-4 border-t-4 rounded-tl-xl',
                'top-0 right-0 border-r-4 border-t-4 rounded-tr-xl',
                'bottom-0 left-0 border-l-4 border-b-4 rounded-bl-xl',
                'bottom-0 right-0 border-r-4 border-b-4 rounded-br-xl',
              ].map((cls, i) => (
                <div key={i} className={`absolute w-8 h-8 border-primary ${cls}`} />
              ))}
              {/* Scanning line animation */}
              {scanning && (
                <div className="absolute left-2 right-2 h-0.5 bg-primary/70 animate-scan-line" />
              )}
            </div>
            <p className="text-white/70 text-sm text-center">
              Point camera at a Stellar QR code
            </p>
          </div>

          {/* Error overlay */}
          {error && (
            <div className="absolute bottom-8 left-4 right-4 bg-red-900/90 backdrop-blur rounded-2xl p-4 z-20">
              <p className="text-sm text-red-200 whitespace-pre-line">{error}</p>
              <button onClick={rescan} className="mt-2 text-xs text-red-300 underline">Try again</button>
            </div>
          )}
        </div>
      )}

      {/* ── Manual tab ────────────────────────────────────────────────────── */}
      {tab === 'manual' && !result && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 space-y-6">
          <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center">
            <QrCode size={30} className="text-primary" />
          </div>
          <div className="w-full">
            <p className="text-white/60 text-sm mb-3 text-center">Paste a Stellar address or SEP-0007 URI</p>
            <form onSubmit={handleManualSubmit} className="space-y-3">
              <textarea
                value={manualInput}
                onChange={e => setManualInput(e.target.value)}
                placeholder="G... address or web+stellar:pay?destination=G..."
                rows={4}
                className="w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-sm outline-none text-white placeholder-white/30 font-mono resize-none"
              />
              {error && (
                <div className="flex items-start gap-2 bg-red-900/40 rounded-xl p-3">
                  <AlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-red-300">{error}</p>
                </div>
              )}
              <button type="submit" disabled={!manualInput.trim()}
                className="w-full bg-primary text-white font-bold py-3.5 rounded-2xl disabled:opacity-50">
                Parse Address
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Result ────────────────────────────────────────────────────────── */}
      {result && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 space-y-6">
          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
            <CheckCircle2 size={32} className="text-green-400" />
          </div>
          <div className="w-full bg-white/10 rounded-2xl p-5 space-y-3">
            <p className="text-sm font-semibold text-white/80 text-center">QR Code Parsed ✓</p>
            <div className="space-y-2 text-sm">
              <div>
                <p className="text-white/40 text-xs mb-1">Destination</p>
                <p className="font-mono text-xs break-all text-white/90">{result.destination}</p>
              </div>
              {result.amount && (
                <div className="flex justify-between">
                  <span className="text-white/40">Amount</span>
                  <span className="font-semibold">{result.amount} {result.assetCode ?? 'XLM'}</span>
                </div>
              )}
              {result.assetCode && (
                <div className="flex justify-between">
                  <span className="text-white/40">Asset</span>
                  <span className="font-semibold">{result.assetCode}</span>
                </div>
              )}
              {result.memo && (
                <div className="flex justify-between">
                  <span className="text-white/40">Memo</span>
                  <span className="text-white/70">{result.memo}</span>
                </div>
              )}
            </div>
          </div>

          <div className="w-full space-y-3">
            <button onClick={goToSend}
              className="w-full bg-primary text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 text-base">
              <Zap size={20} />
              Send to This Address
            </button>
            <button onClick={rescan}
              className="w-full bg-white/10 text-white font-semibold py-3.5 rounded-2xl flex items-center justify-center gap-2">
              <Camera size={18} />
              Scan Again
            </button>
          </div>
        </div>
      )}

      {/* Scan line animation style */}
      <style jsx>{`
        @keyframes scan-line {
          0%   { top: 8px;  opacity: 1; }
          50%  { top: calc(100% - 8px); opacity: 1; }
          100% { top: 8px;  opacity: 1; }
        }
        .animate-scan-line {
          animation: scan-line 2s ease-in-out infinite;
          position: absolute;
        }
      `}</style>
    </div>
  );
}
