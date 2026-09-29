/* ═══════════════════════════════════════════════════════════════════════════
   VerifyAssetPage — Three modes: QR Code Scanner | JWT Token | Legacy Hash
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import {
  ShieldCheck, CheckCircle, XCircle, Search, Share2, AlertTriangle,
  QrCode, Key, Camera, Upload, RefreshCw, Copy, Check, ExternalLink,
} from 'lucide-react';
import { verifyAsset, verifyVp } from '../services/api';
import type { VerifyAssetResult, VerifyVpResult } from '../types';
import './FormPage.css';
import './ShareCredentialPage.css';
import './VerifyAssetPage.css';

type Mode = 'qr' | 'jwt' | 'hash';

export default function VerifyAssetPage() {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>('qr');

  /* ── JWT/VP mode ───────────────────────────────── */
  const [vpToken, setVpToken]   = useState('');
  const [vpResult, setVpResult] = useState<VerifyVpResult | null>(null);

  /* ── QR Scanner mode ───────────────────────────── */
  const [isScanning, setIsScanning]     = useState(false);
  const [scannedToken, setScannedToken] = useState<string | null>(null);
  const [qrScanError, setQrScanError]   = useState<string | null>(null);
  const html5QrCodeRef                  = useRef<Html5Qrcode | null>(null);
  const fileInputRef                    = useRef<HTMLInputElement | null>(null);

  /* ── Legacy hash mode ──────────────────────────── */
  const [tokenId,    setTokenId]    = useState('');
  const [credHash,   setCredHash]   = useState('');
  const [hashResult, setHashResult] = useState<VerifyAssetResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  /* Auto-populate JWT token from URL ?token= param */
  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      setVpToken(token);
      setScannedToken(token);
      setMode('qr');
      handleVpVerify(token);
    }
  }, [searchParams]);

  /* Clean up scanner on unmount */
  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current) {
        if (html5QrCodeRef.current.isScanning) {
          html5QrCodeRef.current.stop().catch(() => {});
        }
      }
    };
  }, []);

  /* Helper to extract token from QR payload (URL or raw token) */
  const parseTokenFromQr = (scannedText: string): string => {
    const text = scannedText.trim();
    try {
      if (text.startsWith('http://') || text.startsWith('https://')) {
        const url = new URL(text);
        const token = url.searchParams.get('token');
        if (token) return token;
      }
    } catch (_e) {
      // ignore URL parse errors
    }

    const match = text.match(/[?&]token=([^&]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }

    return text;
  };

  /* ── Handlers ──────────────────────────────────── */
  const handleVpVerify = async (tokenOverride?: string) => {
    const token = tokenOverride ?? vpToken;
    if (!token.trim()) return;
    setLoading(true); setError(null); setVpResult(null);
    try {
      setVpResult(await verifyVp({ vp_token: token.trim() }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'VP verification failed');
    } finally { setLoading(false); }
  };

  const handleHashVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenId || !credHash) return;
    setLoading(true); setError(null); setHashResult(null);
    try {
      setHashResult(await verifyAsset({ token_id: parseInt(tokenId), credential_hash: credHash.trim() }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally { setLoading(false); }
  };

  const startCameraScanner = async () => {
    setQrScanError(null);
    setScannedToken(null);
    setVpResult(null);
    setIsScanning(true);

    setTimeout(async () => {
      try {
        if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }

        const scanner = new Html5Qrcode('qr-camera-viewport');
        html5QrCodeRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          (decodedText) => {
            handleQrCodeScanned(decodedText);
          },
          () => {
            // frame scan error (normal when no QR in view)
          }
        );
      } catch (err: unknown) {
        setIsScanning(false);
        setQrScanError(
          err instanceof Error
            ? err.message
            : 'Could not access camera. Please check permissions or select an image file.'
        );
      }
    }, 150);
  };

  const stopCameraScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
      } catch (_e) {}
      html5QrCodeRef.current = null;
    }
    setIsScanning(false);
  };

  const handleQrCodeScanned = async (decodedText: string) => {
    await stopCameraScanner();
    const token = parseTokenFromQr(decodedText);
    setScannedToken(token);
    setVpToken(token);
    handleVpVerify(token);
  };

  const handleQrFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setQrScanError(null);
    setVpResult(null);

    try {
      const html5QrCode = new Html5Qrcode('qr-file-reader-hidden');
      const decodedText = await html5QrCode.scanFile(file, true);
      handleQrCodeScanned(decodedText);
    } catch (_err) {
      setQrScanError('Could not detect a valid QR code in the selected image. Please try another image.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const switchTab = (next: Mode) => {
    stopCameraScanner();
    setMode(next);
    setError(null);
    setQrScanError(null);
    setVpResult(null);
    setHashResult(null);
  };

  /* ── Render ────────────────────────────────────── */
  return (
    <div className="section">
      <div className="container" style={{ maxWidth: 760 }}>
        <h2 className="section-title">Verify Credential</h2>

        {/* Hidden div for file scanner instance */}
        <div id="qr-file-reader-hidden" style={{ display: 'none' }} />

        {/* ── Mode tabs ─────────────────────────────── */}
        <div className="verify-mode-tabs">
          <button
            className={`verify-mode-tab ${mode === 'qr' ? 'active' : ''}`}
            onClick={() => switchTab('qr')}
          >
            <QrCode size={16} /> QR Code
          </button>
          <button
            className={`verify-mode-tab ${mode === 'jwt' ? 'active' : ''}`}
            onClick={() => switchTab('jwt')}
          >
            <Key size={16} /> JWT Token
          </button>
          <button
            className={`verify-mode-tab ${mode === 'hash' ? 'active' : ''}`}
            onClick={() => switchTab('hash')}
          >
            <Search size={16} /> Legacy Hash
          </button>
        </div>

        {/* ════════ QR MODE ════════════════════════════════════════ */}
        {mode === 'qr' && (
          <div className="card verify-card">
            <div className="verify-section-info">
              <QrCode size={18} className="verify-info-icon" />
              <span>
                Scan a Verifiable Presentation QR code with your camera or select an image file to verify instantly.
              </span>
            </div>

            <div className="qr-scanner-box">
              <div className="qr-scanner-actions">
                {!isScanning ? (
                  <button className="btn btn-primary btn-lg" onClick={startCameraScanner}>
                    <Camera size={18} /> Open Camera Scanner
                  </button>
                ) : (
                  <button className="btn btn-outline" onClick={stopCameraScanner}>
                    <XCircle size={18} /> Close Camera
                  </button>
                )}

                <label className="btn btn-outline btn-lg qr-file-label">
                  <Upload size={18} /> Upload QR Image
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleQrFileUpload}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>

              {/* Camera viewport */}
              {isScanning && (
                <div className="qr-camera-viewport-wrapper">
                  <div id="qr-camera-viewport" />
                </div>
              )}

              {!isScanning && !scannedToken && !loading && (
                <p style={{ color: 'var(--gray-500)', fontSize: '0.85rem', margin: '4px 0 0' }}>
                  Point camera at the QR code generated in the Share section.
                </p>
              )}
            </div>

            {qrScanError && (
              <div className="form-error" style={{ marginTop: 'var(--space-4)' }}>
                {qrScanError}
              </div>
            )}

            {scannedToken && (
              <div className="qr-scanned-success" style={{ marginTop: 'var(--space-5)' }}>
                <CheckCircle size={18} />
                <span>QR Code Scanned Successfully! Verifying presentation...</span>
              </div>
            )}

            {loading && (
              <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--primary)' }}>
                <RefreshCw size={24} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
                <p style={{ margin: '8px 0 0', fontWeight: 500 }}>Verifying cryptographic signature on-chain...</p>
              </div>
            )}

            {vpResult && <VpResultView result={vpResult} />}
          </div>
        )}

        {/* ════════ JWT / VP TOKEN MODE ════════════════════════════ */}
        {mode === 'jwt' && (
          <div className="card verify-card">
            <div className="verify-section-info">
              <Share2 size={16} className="verify-info-icon" />
              <span>
                The credential holder creates a signed presentation and shares a link.
                Paste the VP token below — <strong>no holder presence required.</strong>
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">VP / JWT Token *</label>
              <textarea
                className="form-input"
                placeholder="Paste the VP token (JWT) here..."
                value={vpToken}
                onChange={e => setVpToken(e.target.value)}
                rows={4}
                style={{ fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical' }}
              />
            </div>

            {error && <div className="form-error">{error}</div>}

            <button
              className="btn btn-primary btn-lg"
              onClick={() => handleVpVerify()}
              disabled={loading || !vpToken.trim()}
              style={{ width: '100%' }}
            >
              <ShieldCheck size={18} />
              {loading ? 'Verifying...' : 'Verify Presentation'}
            </button>

            {vpResult && <VpResultView result={vpResult} />}
          </div>
        )}

        {/* ════════ LEGACY HASH MODE ═══════════════════════════════ */}
        {mode === 'hash' && (
          <div className="card verify-card">
            <div className="verify-section-info verify-section-info--warn">
              <AlertTriangle size={16} className="verify-info-icon--warn" />
              <span>
                <strong>Security note:</strong> Hash verification does not prove the presenter
                owns this credential. Use <em>JWT Token</em> or <em>QR Code</em> mode when the holder has provided
                a VP presentation.
              </span>
            </div>

            <form onSubmit={handleHashVerify} style={{ marginTop: 'var(--space-6)' }}>
              <div className="form-group">
                <label className="form-label">Token ID *</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="e.g. 1"
                  value={tokenId}
                  onChange={e => setTokenId(e.target.value)}
                  required
                  min="0"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Credential Hash (0x...) *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="0x..."
                  value={credHash}
                  onChange={e => setCredHash(e.target.value)}
                  required
                />
              </div>
              {error && <div className="form-error">{error}</div>}
              <button
                type="submit"
                className="btn btn-primary btn-lg"
                disabled={loading}
                style={{ width: '100%' }}
              >
                <Search size={18} />
                {loading ? 'Verifying on Blockchain...' : 'Verify Credential'}
              </button>
            </form>

            {hashResult && <HashResultView result={hashResult} />}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── VP Result Component ─────────────────────────────────────────────────── */

function VpResultView({ result }: { result: VerifyVpResult }) {
  const { checks, credential, failure_reason } = result;

  const checkItems: [boolean, string][] = [
    [checks.token_integrity,        'Token Integrity'],
    [checks.holder_signature_valid, 'Holder Signature'],
    [checks.controller_match,       'DID Controller Match'],
    [checks.not_expired,            'Not Expired'],
    [checks.credential_active,      'Credential Active On-Chain'],
    [checks.not_revoked,            'Not Revoked by Holder'],
  ];

  return (
    <div style={{ marginTop: 'var(--space-6)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
        {result.is_valid
          ? <CheckCircle size={32} color="var(--success)" />
          : <XCircle    size={32} color="var(--danger)"  />
        }
        <div>
          <h3 style={{ margin: 0, color: result.is_valid ? 'var(--success)' : 'var(--danger)' }}>
            {result.is_valid ? '✓ PRESENTATION VALID' : '✗ PRESENTATION INVALID'}
          </h3>
          {failure_reason && (
            <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: 'var(--danger)' }}>
              {failure_reason}
            </p>
          )}
        </div>
      </div>

      <div className="vp-checks-grid">
        {checkItems.map(([passed, label]) => (
          <div key={label} className={`vp-check-item ${passed ? 'pass' : 'fail'}`}>
            {passed ? <CheckCircle size={16} /> : <XCircle size={16} />}
            {label}
          </div>
        ))}
      </div>

      {credential && (
        <div className="detail-grid" style={{ marginTop: 'var(--space-6)' }}>
          <div className="detail-item"><span className="detail-label">Holder DID</span><span className="detail-value mono">{credential.holder_did}</span></div>
          <div className="detail-item"><span className="detail-label">Owner DID</span><span className="detail-value mono">{credential.owner_did}</span></div>
          <div className="detail-item"><span className="detail-label">Issuer DID</span><span className="detail-value mono">{credential.issuer_did}</span></div>
          <div className="detail-item"><span className="detail-label">Asset Type</span><span className="detail-value">{credential.asset_type}</span></div>
          <div className="detail-item"><span className="detail-label">Schema</span><span className="detail-value mono">{credential.schema_id}</span></div>
          <div className="detail-item"><span className="detail-label">Purpose</span><span className="detail-value">{credential.purpose}</span></div>
          <div className="detail-item"><span className="detail-label">Status</span><span className="detail-value">{credential.status}</span></div>
          <div className="detail-item"><span className="detail-label">VP Expires</span><span className="detail-value">{new Date(credential.vp_expires_at * 1000).toLocaleString()}</span></div>
        </div>
      )}
    </div>
  );
}

/* ── Legacy Hash Result Component ────────────────────────────────────────── */

function HashResultView({ result }: { result: VerifyAssetResult }) {
  return (
    <div style={{ marginTop: 'var(--space-6)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
        <ShieldCheck size={32} color={result.is_valid ? 'var(--success)' : 'var(--danger)'} />
        <h3 style={{ margin: 0, color: result.is_valid ? 'var(--success)' : 'var(--danger)' }}>
          {result.is_valid ? 'CREDENTIAL VALID ✓' : 'CREDENTIAL INVALID ✗'}
        </h3>
      </div>
      <div className="verification-grid">
        {([
          [result.is_hash_match,    'Hash Match'],
          [result.is_status_active, 'Status Active'],
          [result.is_not_expired,   'Not Expired'],
          [result.is_owner_verified,'Owner Verified'],
        ] as [boolean, string][]).map(([passed, label]) => (
          <div key={String(label)} className={`verification-item ${passed ? 'pass' : 'fail'}`}>
            {passed
              ? <CheckCircle size={20} color="var(--success)" />
              : <XCircle    size={20} color="var(--danger)"  />
            }
            <span className="verification-item-text">{String(label)}</span>
          </div>
        ))}
      </div>
      <div className="detail-grid" style={{ marginTop: 'var(--space-6)' }}>
        <div className="detail-item"><span className="detail-label">Owner DID</span><span className="detail-value mono">{result.owner_did}</span></div>
        <div className="detail-item"><span className="detail-label">Issuer DID</span><span className="detail-value mono">{result.issuer_did}</span></div>
        <div className="detail-item"><span className="detail-label">Status</span><span className="detail-value">{result.status}</span></div>
      </div>
    </div>
  );
}
