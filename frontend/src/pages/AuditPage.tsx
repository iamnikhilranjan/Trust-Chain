/* ═══════════════════════════════════════════════════════════════════════════
   AuditPage — Professional on-chain audit & lifecycle dashboard
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import {
  BarChart3,
  FileCheck,
  Blocks,
  ArrowRight,
  XCircle,
  Activity,
  ExternalLink,
  Copy,
  Check,
  ShieldCheck,
  Layers,
  Box,
} from 'lucide-react';
import {
  getAuditSummary,
  getIssuances,
  getTransfers,
  getRevocations,
  getEvents,
} from '../services/api';
import type { AuditSummary, AuditEvent } from '../types';
import './AuditPage.css';

type Tab = 'issuances' | 'transfers' | 'revocations' | 'all';

export default function AuditPage() {
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('issuances');
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);

  useEffect(() => {
    getAuditSummary()
      .then(setSummary)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setEventsLoading(true);
    const fetcher =
      activeTab === 'issuances' ? getIssuances :
      activeTab === 'transfers' ? getTransfers :
      activeTab === 'revocations' ? getRevocations :
      () => getEvents(undefined, 50);

    fetcher(50)
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false));
  }, [activeTab]);

  const handleCopy = async (addr: string) => {
    await navigator.clipboard.writeText(addr);
    setCopiedAddr(addr);
    setTimeout(() => setCopiedAddr(null), 2000);
  };

  const truncate = (str: string, lead = 6, tail = 4) => {
    if (!str || str.length <= lead + tail) return str;
    return `${str.slice(0, lead)}...${str.slice(-tail)}`;
  };

  const getEventBadge = (name?: string) => {
    const n = name || '';
    if (n.includes('Issued')) return <span className="audit-event-badge badge-issued">Asset Issued</span>;
    if (n.includes('Transfer')) return <span className="audit-event-badge badge-transfer">Transferred</span>;
    if (n.includes('Revoke')) return <span className="audit-event-badge badge-revoked">Revoked</span>;
    if (n.includes('DID') || n.includes('Identity')) return <span className="audit-event-badge badge-identity">Identity</span>;
    if (n.includes('Schema')) return <span className="audit-event-badge badge-schema">Schema</span>;
    return <span className="audit-event-badge badge-generic">{n || 'Event'}</span>;
  };

  if (loading) {
    return (
      <div className="section">
        <div className="container" style={{ textAlign: 'center', padding: '60px 0' }}>
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--gray-600)' }}>Loading blockchain audit data...</p>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: typeof BarChart3 }[] = [
    { key: 'issuances', label: 'Issuances', icon: FileCheck },
    { key: 'transfers', label: 'Transfers', icon: ArrowRight },
    { key: 'revocations', label: 'Revocations', icon: XCircle },
    { key: 'all', label: 'All Events', icon: Activity },
  ];

  const contracts = summary ? [
    { name: 'RoleManager', desc: 'RBAC Access Control', addr: summary.role_manager },
    { name: 'IdentityRegistry', desc: 'W3C DID Registry', addr: summary.identity_registry },
    { name: 'SchemaRegistry', desc: 'JSON Schemas & Hashes', addr: summary.schema_registry },
    { name: 'AssetNFT', desc: 'ERC-721 Token Contract', addr: summary.asset_nft },
    { name: 'AssetRegistry', desc: 'Proof & Verification Engine', addr: summary.asset_registry },
    { name: 'TrustPaymaster', desc: 'ERC-4337 Gas Sponsorship', addr: summary.paymaster },
  ] : [];

  return (
    <div className="section">
      <div className="container">
        <div className="audit-header">
          <div>
            <h2 className="section-title" style={{ marginBottom: 4 }}>Audit Dashboard</h2>
            <p className="audit-subtitle">
              Live immutable ledger metrics and indexed cryptographic events on Ethereum Sepolia.
            </p>
          </div>
          {summary && (
            <div className="audit-network-pill">
              <span className="audit-pulse" />
              <span>Sepolia Chain ID: {summary.chain_id}</span>
            </div>
          )}
        </div>

        {/* ── Summary Cards ────────────────────────────────────────── */}
        {summary && (
          <div className="audit-summary-grid">
            <div className="audit-summary-card card-accent-blue">
              <div className="audit-icon-wrap icon-blue">
                <FileCheck size={22} />
              </div>
              <div className="audit-summary-number">{summary.total_assets}</div>
              <div className="audit-summary-label">Total Assets</div>
            </div>

            <div className="audit-summary-card card-accent-info">
              <div className="audit-icon-wrap icon-info">
                <Blocks size={22} />
              </div>
              <div className="audit-summary-number">{summary.total_schemas}</div>
              <div className="audit-summary-label">Schemas</div>
            </div>

            <div className="audit-summary-card card-accent-success">
              <div className="audit-icon-wrap icon-success">
                <BarChart3 size={22} />
              </div>
              <div className="audit-summary-number">{summary.total_issuances}</div>
              <div className="audit-summary-label">Issuances</div>
            </div>

            <div className="audit-summary-card card-accent-warning">
              <div className="audit-icon-wrap icon-warning">
                <ArrowRight size={22} />
              </div>
              <div className="audit-summary-number">{summary.total_transfers}</div>
              <div className="audit-summary-label">Transfers</div>
            </div>

            <div className="audit-summary-card card-accent-danger">
              <div className="audit-icon-wrap icon-danger">
                <XCircle size={22} />
              </div>
              <div className="audit-summary-number">{summary.total_revocations}</div>
              <div className="audit-summary-label">Revocations</div>
            </div>
          </div>
        )}

        {/* ── Deployed Contract Addresses ─────────────────────────── */}
        {contracts.length > 0 && (
          <div className="card audit-contracts-card">
            <div className="audit-card-title-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Layers size={20} color="var(--primary-600)" />
                <h3 style={{ margin: 0, fontSize: 'var(--text-base)', color: 'var(--gray-900)' }}>
                  Deployed Smart Contracts
                </h3>
              </div>
              <span className="audit-verified-badge">
                <ShieldCheck size={14} /> Verified on Sepolia
              </span>
            </div>

            <div className="audit-contracts-grid">
              {contracts.map((c) => (
                <div key={c.name} className="audit-contract-item">
                  <div className="audit-contract-info">
                    <span className="audit-contract-name">{c.name}</span>
                    <span className="audit-contract-desc">{c.desc}</span>
                  </div>
                  <div className="audit-contract-actions">
                    <code className="audit-contract-addr mono" title={c.addr}>
                      {truncate(c.addr, 8, 6)}
                    </code>
                    <button
                      type="button"
                      className="audit-action-btn"
                      onClick={() => handleCopy(c.addr)}
                      title="Copy Address"
                    >
                      {copiedAddr === c.addr ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
                    </button>
                    <a
                      href={`https://sepolia.etherscan.io/address/${c.addr}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="audit-action-btn"
                      title="View on Etherscan"
                    >
                      <ExternalLink size={13} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Event Tabs ───────────────────────────────────────────── */}
        <div className="audit-tabs-container">
          <div className="audit-tabs">
            {tabs.map((tab) => {
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.key}
                  className={`audit-tab ${activeTab === tab.key ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  <TabIcon size={16} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Event Table ──────────────────────────────────────────── */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {eventsLoading ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }} />
              <p style={{ color: 'var(--gray-500)', fontSize: '0.9rem' }}>Fetching live event logs...</p>
            </div>
          ) : events.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--gray-500)' }}>
              <Box size={40} color="var(--gray-300)" style={{ margin: '0 auto 12px' }} />
              <h4 style={{ margin: '0 0 6px 0', color: 'var(--gray-700)' }}>No Events Found</h4>
              <p style={{ margin: 0, fontSize: '0.875rem' }}>No on-chain events recorded for {activeTab} yet.</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Event Type</th>
                    <th>Block</th>
                    <th>Transaction Hash</th>
                    <th>Timestamp</th>
                    <th>Payload / Details</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((evt, idx) => (
                    <tr key={idx}>
                      <td>{getEventBadge(evt.eventName)}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                          <Box size={13} color="var(--gray-400)" />
                          #{evt.blockNumber}
                        </div>
                      </td>
                      <td>
                        <a
                          href={`https://sepolia.etherscan.io/tx/${evt.transactionHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mono audit-tx-link"
                          title={evt.transactionHash}
                        >
                          {truncate(evt.transactionHash, 10, 8)}
                          <ExternalLink size={12} style={{ marginLeft: 4, opacity: 0.7 }} />
                        </a>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--gray-600)', whiteSpace: 'nowrap' }}>
                        {evt.timestamp ? new Date(evt.timestamp).toLocaleString() : '—'}
                      </td>
                      <td style={{ fontSize: '0.78rem', maxWidth: 260 }}>
                        <div className="audit-data-cell mono">
                          {evt.data ? JSON.stringify(evt.data) : '—'}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
