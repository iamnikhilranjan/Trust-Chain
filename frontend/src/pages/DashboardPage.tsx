import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield,
  FileCheck,
  Blocks,
  Search,
  PlusCircle,
  CheckCircle,
  BarChart3,
  Wallet,
  Share2,
  Copy,
  Check,
  Award,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getMyIdentity, getMyAssets, listMyVps, revokeVp, listSchemas, getAsset } from '../services/api';
import type { MyIdentityResponse, AssetRecord, SchemaRecord } from '../types';
import './DashboardPage.css';

interface VpRecord {
  vp_id: string;
  token_id: number;
  purpose: string;
  issued_at: number;
  expires_at: number;
  status: string;
}

export default function DashboardPage() {
  const { isAuthenticated, address, did, isAdmin, isManager, isAuditor, login, loading: authLoading } = useAuth();
  const [identity, setIdentity] = useState<MyIdentityResponse | null>(null);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [schemas, setSchemas] = useState<SchemaRecord[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [vps, setVps] = useState<VpRecord[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    listSchemas().then(setSchemas).catch(() => {});
  }, []);

  useEffect(() => {
    if (address) {
      getMyIdentity(address).then(setIdentity).catch(console.error);

      setAssetsLoading(true);
      getMyAssets(address)
        .then(async (userAssets) => {
          setAssets(userAssets);
          // Auto-enrich any asset that has missing asset_type or schema_id with direct on-chain read
          const needsEnrichment = userAssets.some(a => !a.asset_type || !a.schema_id);
          if (needsEnrichment) {
            const enriched = await Promise.all(
              userAssets.map(async (a) => {
                if (!a.asset_type || !a.schema_id) {
                  try {
                    const full = await getAsset(a.token_id);
                    return { ...a, ...full };
                  } catch {
                    return a;
                  }
                }
                return a;
              })
            );
            setAssets(enriched);
          }
        })
        .catch(() => setAssets([]))
        .finally(() => setAssetsLoading(false));

      listMyVps()
        .then(res => setVps(Array.isArray(res) ? res : []))
        .catch(() => setVps([]));
    }
  }, [address]);

  const getAssetName = (asset: AssetRecord) => {
    if (asset.schema_id) {
      const match = schemas.find(
        (s) => s.schema_id.trim().toLowerCase() === asset.schema_id.trim().toLowerCase()
      );
      if (match?.name && match.name.trim()) {
        return match.name;
      }
    }
    if (asset.asset_type && asset.asset_type.trim() && asset.asset_type.toLowerCase() !== 'none') {
      return asset.asset_type.replace(/_/g, ' ');
    }
    if (asset.schema_id && asset.schema_id.trim()) {
      return asset.schema_id.replace(/_/g, ' ');
    }
    return `Credential #${asset.token_id}`;
  };

  const handleCopyLink = async (vpId: string) => {
    // In our app, verify link is /verify/vp with vpId or token
    const url = `${window.location.origin}/verify/vp?vp_id=${vpId}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(vpId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRevokeVp = async (vpId: string) => {
    if (!confirm('Are you sure you want to revoke this Verifiable Presentation link?')) return;
    setRevokingId(vpId);
    try {
      await revokeVp(vpId);
      setVps(prev => prev.map(v => v.vp_id === vpId ? { ...v, status: 'revoked' } : v));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to revoke VP');
    } finally {
      setRevokingId(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="section">
        <div className="container">
          <div className="dashboard-connect">
            <Wallet size={64} color="var(--primary-500)" />
            <h2>Connect Your Wallet</h2>
            <p>Connect your wallet (MetaMask, Rainbow, or any Web3 wallet) to access your TrustChain dashboard, manage credentials, and generate shareable presentations.</p>
            <button className="btn btn-primary btn-lg" onClick={login} disabled={authLoading} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Wallet size={18} />
              {authLoading ? 'Connecting...' : 'Connect Wallet'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Filter actions strictly by role
  const quickActions = [
    { icon: Share2, label: 'Share Credential (VP)', path: '/share', color: 'var(--primary-600)' },
    { icon: Search, label: 'Lookup DID', path: '/identity', color: 'var(--primary-600)' },
    { icon: CheckCircle, label: 'Verify Credential', path: '/verify', color: 'var(--success)' },
    { icon: Blocks, label: 'Browse Schemas', path: '/schemas', color: 'var(--info)' },
    ...(isAdmin ? [{ icon: PlusCircle, label: 'Register Identity', path: '/identity/register', color: 'var(--success)' }] : []),
    ...(isManager || isAdmin ? [{ icon: FileCheck, label: 'Issue Credential', path: '/assets/issue', color: 'var(--warning)' }] : []),
    ...(isAdmin || isManager || isAuditor ? [{ icon: BarChart3, label: 'Audit Dashboard', path: '/audit', color: 'var(--danger)' }] : []),
  ];

  return (
    <div className="section">
      <div className="container">
        <div className="dashboard-title-row">
          <h2 className="section-title" style={{ marginBottom: 0 }}>User Dashboard</h2>
          <Link to="/share" className="btn btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Share2 size={15} /> Create Presentation
          </Link>
        </div>

        {/* ── Identity Card ──────────────────────────────────────────── */}
        <div className="dashboard-identity-card card">
          <div className="dashboard-identity-header">
            <div className="dashboard-avatar-icon">
              <Shield size={32} color="white" />
            </div>
            <div>
              <h3 style={{ margin: 0 }}>Connected Account</h3>
              <p className="address mono" style={{ marginTop: 2 }}>{address}</p>
            </div>
          </div>

          <div className="dashboard-identity-details">
            <div className="dashboard-detail">
              <span className="dashboard-detail-label">Decentralized Identifier (DID)</span>
              <span className="dashboard-detail-value mono">{did || 'Not registered'}</span>
            </div>
            <div className="dashboard-detail">
              <span className="dashboard-detail-label">Access Roles</span>
              <div className="dashboard-roles">
                {isAdmin && <span className="badge badge-admin">Admin</span>}
                {isManager && <span className="badge badge-manager">Manager</span>}
                {isAuditor && <span className="badge badge-auditor">Auditor</span>}
                {!isAdmin && !isManager && !isAuditor && (
                  <span className="badge" style={{ background: 'var(--primary-50)', color: 'var(--primary-700)' }}>User</span>
                )}
              </div>
            </div>
            {identity?.identity && (
              <>
                <div className="dashboard-detail">
                  <span className="dashboard-detail-label">DID Controller</span>
                  <span className="dashboard-detail-value mono">{identity.identity.controller}</span>
                </div>
                <div className="dashboard-detail">
                  <span className="dashboard-detail-label">DID Status</span>
                  <span className={`badge ${identity.identity.is_active ? 'badge-active' : 'badge-revoked'}`}>
                    {identity.identity.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── My Credentials & Assets Section ──────────────────────────── */}
        <div className="dashboard-section-header">
          <div>
            <h3 className="dashboard-section-title">
              <Award size={20} color="var(--primary-600)" />
              My Credentials & Digital Assets
              <span className="badge" style={{ marginLeft: 8, background: 'var(--primary-50)', color: 'var(--primary-700)' }}>
                {assets.length}
              </span>
            </h3>
            <p className="dashboard-section-subtitle">
              Tamper-proof NFT credentials registered to your identity. Click "Share (VP)" to present them securely.
            </p>
          </div>
        </div>

        {assetsLoading ? (
          <div className="card dashboard-loading-card">
            <div className="spinner" />
            <span>Fetching on-chain credentials...</span>
          </div>
        ) : assets.length === 0 ? (
          <div className="card dashboard-empty-assets">
            <Award size={48} color="var(--gray-400)" />
            <h4>No Credentials Found</h4>
            <p>You do not have any on-chain assets or credentials assigned to this wallet address yet.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8 }}>
              <Link to="/schemas" className="btn btn-secondary btn-sm">Browse Schemas</Link>
              <Link to="/verify" className="btn btn-primary btn-sm">Verify an Asset</Link>
            </div>
          </div>
        ) : (
          <div className="dashboard-assets-grid">
            {assets.map((asset) => {
              const isActive = asset.status.toUpperCase() === 'ACTIVE' || asset.status === '0';
              return (
                <div key={asset.token_id} className="dashboard-asset-card card">
                  <div className="dashboard-asset-top">
                    <div className="dashboard-token-badge">Token #{asset.token_id}</div>
                    <span className={`badge ${isActive ? 'badge-active' : 'badge-revoked'}`}>
                      {asset.status}
                    </span>
                  </div>

                  <h4 className="dashboard-asset-title">
                    {asset.asset_type && asset.asset_type.toLowerCase() !== 'none'
                      ? asset.asset_type.replace(/_/g, ' ')
                      : asset.schema_id
                      ? asset.schema_id.replace(/_/g, ' ')
                      : `Token #${asset.token_id}`}
                  </h4>
                  <div className="dashboard-asset-schema">
                    <span className="dashboard-schema-tag">
                      Schema: {asset.schema_id || 'Custom'}
                    </span>
                  </div>

                  <div className="dashboard-asset-meta">
                    <div className="dashboard-meta-row">
                      <span>Owner DID:</span>
                      <code className="mono">{asset.owner_did.length > 24 ? `${asset.owner_did.slice(0, 20)}...` : asset.owner_did}</code>
                    </div>
                    {asset.issued_at > 0 && (
                      <div className="dashboard-meta-row">
                        <span>Issued:</span>
                        <span>{new Date(asset.issued_at * 1000).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>

                  <div className="dashboard-asset-actions">
                    <Link
                      to={`/share?tokenId=${asset.token_id}`}
                      className="btn btn-primary btn-sm dashboard-share-btn"
                    >
                      <Share2 size={14} /> Create VP (Share)
                    </Link>
                    <Link
                      to="/verify"
                      className="btn btn-secondary btn-sm"
                      title="Verify this credential"
                    >
                      Verify
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── My Shared Verifiable Presentations (Active Links) ──────── */}
        {vps.length > 0 && (
          <div style={{ marginTop: 'var(--space-10)' }}>
            <div className="dashboard-section-header">
              <h3 className="dashboard-section-title">
                <Share2 size={20} color="var(--primary-600)" />
                My Active Verifiable Presentations (VPs)
              </h3>
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Credential (Asset / Schema)</th>
                      <th>Purpose</th>
                      <th>Issued At</th>
                      <th>Expires At</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vps.map((vp) => {
                      const asset = assets.find(a => a.token_id === vp.token_id);
                      const assetLabel = asset ? getAssetName(asset) : `Token #${vp.token_id}`;
                      const schemaLabel = asset?.schema_id;
                      return (
                        <tr key={vp.vp_id}>
                          <td>
                            <div style={{ fontWeight: 600, color: 'var(--gray-900)' }}>{assetLabel}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                              {schemaLabel ? `Schema: ${schemaLabel} • ` : ''}Token #{vp.token_id}
                            </div>
                          </td>
                          <td style={{ textTransform: 'capitalize' }}>{vp.purpose.replace(/_/g, ' ')}</td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--gray-600)' }}>
                            {vp.issued_at ? new Date(vp.issued_at * 1000).toLocaleString() : '—'}
                          </td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--gray-600)' }}>
                            {vp.expires_at ? new Date(vp.expires_at * 1000).toLocaleString() : '—'}
                          </td>
                          <td>
                            <span className={`badge ${vp.status === 'active' ? 'badge-active' : 'badge-revoked'}`}>
                              {vp.status}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: 6 }}>
                              {vp.status === 'active' && (
                                <>
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => handleCopyLink(vp.vp_id)}
                                    title="Copy share link"
                                    style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                                  >
                                    {copiedId === vp.vp_id ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
                                    {copiedId === vp.vp_id ? 'Copied' : 'Link'}
                                  </button>
                                  <button
                                    className="btn btn-danger btn-sm"
                                    onClick={() => handleRevokeVp(vp.vp_id)}
                                    disabled={revokingId === vp.vp_id}
                                    title="Revoke presentation link"
                                    style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                                  >
                                    {revokingId === vp.vp_id ? 'Revoking...' : 'Revoke'}
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Quick Actions ──────────────────────────────────────────── */}
        <h3 style={{ marginTop: 'var(--space-10)', marginBottom: 'var(--space-6)', color: 'var(--gray-800)' }}>
          Quick Actions
        </h3>
        <div className="dashboard-actions-grid">
          {quickActions.map((action) => {
            const IconComp = action.icon;
            return (
              <Link key={action.label} to={action.path} className="dashboard-action-card card">
                <IconComp size={30} color={action.color} />
                <span className="dashboard-action-label">{action.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
