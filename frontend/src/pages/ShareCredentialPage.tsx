import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import { Share2, Copy, Check, ShieldCheck, Clock, FileText, ExternalLink, Download, QrCode } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { createVp, getMyAssets, listSchemas } from '../services/api';
import type { CreateVpResponse, AssetRecord, SchemaRecord } from '../types';
import './FormPage.css';
import './ShareCredentialPage.css';

const PURPOSES = [
  { value: 'job_application', label: 'Job Application' },
  { value: 'background_check', label: 'Background Check' },
  { value: 'identity_verification', label: 'Identity Verification' },
  { value: 'educational_verification', label: 'Educational Verification' },
  { value: 'government_service', label: 'Government Service' },
  { value: 'general', label: 'General Purpose' },
];

const EXPIRY_OPTIONS = [
  { value: 1, label: '1 Hour' },
  { value: 24, label: '24 Hours' },
  { value: 72, label: '3 Days' },
  { value: 168, label: '7 Days' },
  { value: 720, label: '30 Days' },
];

export default function ShareCredentialPage() {
  const [searchParams] = useSearchParams();
  const { address, isAuthenticated, signMessage } = useAuth();
  const [tokenId, setTokenId] = useState(searchParams.get('tokenId') || '');
  const [purpose, setPurpose] = useState('job_application');
  const [expiryHours, setExpiryHours] = useState(24);
  const [myAssets, setMyAssets] = useState<AssetRecord[]>([]);
  const [schemas, setSchemas] = useState<SchemaRecord[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateVpResponse | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    listSchemas().then(setSchemas).catch(() => {});
  }, []);

  useEffect(() => {
    if (address) {
      setLoadingAssets(true);
      getMyAssets(address)
        .then((assets) => {
          setMyAssets(assets);
          const paramId = searchParams.get('tokenId');
          if (paramId) {
            setTokenId(paramId);
          } else if (assets.length > 0 && !tokenId) {
            setTokenId(String(assets[0].token_id));
          }
        })
        .catch(() => {})
        .finally(() => setLoadingAssets(false));
    }
  }, [address, searchParams]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !tokenId) return;

    setLoading(true);
    setError(null);

    try {
      // 1. Calculate expiry timestamp
      const expiresAt = Math.floor(Date.now() / 1000) + expiryHours * 3600;

      // 2. Build the EXACT canonical message (must match backend vp_signing_message())
      const message = [
        'TrustChain Verifiable Presentation',
        '',
        `I am presenting credential #${tokenId} for: ${purpose}`,
        `Holder: ${address.toLowerCase()}`,
        `This presentation expires: ${expiresAt}`,
        '',
        'By signing, I prove I control this identity.',
      ].join('\n');

      // 3. Sign with MetaMask (EIP-191 personal_sign)
      const signature = await signMessage(message);

      // 4. Send to backend with exact matching expires_at
      const vp = await createVp({
        token_id: parseInt(tokenId),
        expiry_hours: expiryHours,
        expires_at: expiresAt,
        purpose,
        holder_signature: signature,
        holder_address: address.toLowerCase(),
      });

      setResult(vp);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create presentation');
    } finally {
      setLoading(false);
    }
  };

  const copyToken = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.vp_token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadQr = () => {
    const canvas = document.getElementById('share-vp-qr-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const pngUrl = canvas.toDataURL('image/png');
    const downloadLink = document.createElement('a');
    downloadLink.href = pngUrl;
    downloadLink.download = `trustchain-vp-qr-${result?.vp_id || tokenId || 'credential'}.png`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  const verifyUrl = result
    ? `${window.location.origin}/verify/vp?token=${encodeURIComponent(result.vp_token)}`
    : '';

  if (!isAuthenticated) {
    return (
      <div className="section">
        <div className="container" style={{ maxWidth: 600 }}>
          <div className="card vp-empty-state">
            <ShieldCheck size={48} className="vp-empty-icon" />
            <h3>Connect Your Wallet</h3>
            <p>You must be authenticated to create a Verifiable Presentation.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="container" style={{ maxWidth: 720 }}>
        <div className="vp-header">
          <Share2 size={36} className="vp-header-icon" />
          <div>
            <h2 className="section-title" style={{ marginBottom: 4 }}>Share Credential</h2>
            <p className="vp-subtitle">
              Sign once with your wallet — your credential can be verified anytime,
              even when you're offline.
            </p>
          </div>
        </div>

        {!result ? (
          <form onSubmit={handleCreate} className="card" style={{ padding: 'var(--space-8)' }}>

            {/* How it works */}
            <div className="vp-how-it-works">
              <div className="vp-step"><span className="vp-step-num">1</span><span>Choose credential & purpose</span></div>
              <div className="vp-step-arrow">→</div>
              <div className="vp-step"><span className="vp-step-num">2</span><span>Sign with MetaMask</span></div>
              <div className="vp-step-arrow">→</div>
              <div className="vp-step"><span className="vp-step-num">3</span><span>Share the link</span></div>
            </div>

            <div className="form-group">
              <label className="form-label">Select Credential (Asset Type / Schema) *</label>
              {loadingAssets ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--gray-500)', padding: '8px 0' }}>
                  Loading your credentials...
                </div>
              ) : myAssets.length > 0 ? (
                <select
                  className="form-input"
                  value={tokenId}
                  onChange={e => setTokenId(e.target.value)}
                  required
                >
                  <option value="">-- Choose a Credential to Share --</option>
                  {myAssets.map((asset) => {
                    const schemaMatch = schemas.find(
                      s => s.schema_id.trim().toLowerCase() === asset.schema_id.trim().toLowerCase()
                    );
                    const displayName =
                      (asset.asset_type && asset.asset_type.toLowerCase() !== 'none')
                        ? asset.asset_type.replace(/_/g, ' ')
                        : schemaMatch?.name || asset.schema_id || `Token #${asset.token_id}`;

                    return (
                      <option key={asset.token_id} value={asset.token_id}>
                        {displayName} (Schema: {asset.schema_id} • Token #{asset.token_id})
                      </option>
                    );
                  })}
                </select>
              ) : (
                <input
                  type="number"
                  className="form-input"
                  placeholder="e.g. 1"
                  value={tokenId}
                  onChange={e => setTokenId(e.target.value)}
                  required
                  min="1"
                />
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Purpose *</label>
              <select
                className="form-input"
                value={purpose}
                onChange={e => setPurpose(e.target.value)}
              >
                {PURPOSES.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Valid For *</label>
              <div className="vp-expiry-grid">
                {EXPIRY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`vp-expiry-btn ${expiryHours === opt.value ? 'active' : ''}`}
                    onClick={() => setExpiryHours(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {error && <div className="form-error">{error}</div>}

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={loading}
              style={{ width: '100%', marginTop: 'var(--space-4)' }}
            >
              <ShieldCheck size={18} />
              {loading ? 'Signing with MetaMask...' : 'Create Verifiable Presentation'}
            </button>

            <p className="vp-disclaimer">
              Your wallet will be asked to sign a message — no gas fees, no transaction.
            </p>
          </form>
        ) : (
          <div className="vp-result card">
            <div className="vp-result-header">
              <Check size={28} className="vp-result-check" />
              <div>
                <h3 style={{ margin: 0 }}>Presentation Created!</h3>
                <p style={{ margin: '4px 0 0', color: 'var(--gray-600)', fontSize: '0.9rem' }}>
                  Valid for {expiryHours}h · Purpose: {PURPOSES.find(p => p.value === purpose)?.label}
                </p>
              </div>
            </div>

            {/* Share options */}
            <div className="vp-share-section">
              <div className="vp-qr-box-share">
                <div className="vp-qr-canvas-wrapper">
                  <QRCodeCanvas
                    id="share-vp-qr-canvas"
                    value={verifyUrl}
                    size={160}
                    bgColor="#ffffff"
                    fgColor="#1a2744"
                    level="H"
                    includeMargin
                  />
                  <div className="vp-qr-badge">
                    <ShieldCheck size={12} /> TrustChain QR
                  </div>
                </div>

                <div className="vp-qr-details">
                  <p className="vp-share-label">
                    <QrCode size={14} /> Shareable QR Code
                  </p>
                  <p className="vp-qr-desc">
                    Scan this QR code with camera in the Verify section to verify instantly without copying tokens.
                  </p>
                  <button className="btn btn-primary" onClick={downloadQr}>
                    <Download size={16} /> Download QR Code
                  </button>
                </div>
              </div>

              <p className="vp-share-label" style={{ marginTop: 'var(--space-5)' }}>
                <ExternalLink size={14} /> Shareable Verification Link
              </p>
              <div className="vp-share-url">{verifyUrl}</div>
              <div className="vp-share-actions">
                <button
                  className="btn btn-outline"
                  onClick={() => navigator.clipboard.writeText(verifyUrl)}
                >
                  <Copy size={16} /> Copy Link
                </button>
                <button className="btn btn-outline" onClick={copyToken}>
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? 'Copied!' : 'Copy VP Token'}
                </button>
                <a
                  href={verifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline"
                >
                  <ExternalLink size={16} /> Open Verify Page
                </a>
              </div>
            </div>

            {/* VP ID */}
            <div className="vp-meta">
              <div className="vp-meta-item">
                <FileText size={14} />
                <span>VP ID: <code>{result.vp_id}</code></span>
              </div>
              <div className="vp-meta-item">
                <Clock size={14} />
                <span>Expires: {new Date(result.expires_at * 1000).toLocaleString()}</span>
              </div>
            </div>

            <button
              className="btn btn-outline"
              onClick={() => { setResult(null); setTokenId(''); }}
              style={{ marginTop: 'var(--space-4)' }}
            >
              Create Another
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
