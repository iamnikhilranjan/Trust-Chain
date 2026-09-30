import { useState } from 'react';
import { Search, User, CheckCircle, XCircle, ArrowRightLeft, ShieldCheck, ExternalLink } from 'lucide-react';
import { useWriteContract, useChainId, useSwitchChain } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { getIdentity, resolveController } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { CONTRACT_ADDRESSES, IDENTITY_REGISTRY_ABI } from '../config/contracts';
import type { IdentityRecord } from '../types';
import './FormPage.css';

export default function IdentityPage() {
  const { address, isAdmin } = useAuth();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<'did' | 'address'>('did');
  const [result, setResult] = useState<IdentityRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Controller Transfer State
  const [showProposeForm, setShowProposeForm] = useState(false);
  const [newControllerAddr, setNewControllerAddr] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferMsg, setTransferMsg] = useState<{ type: 'success' | 'error'; text: string; txHash?: string } | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setTransferMsg(null);
    setShowProposeForm(false);

    try {
      const identity =
        searchType === 'did'
          ? await getIdentity(query.trim())
          : await resolveController(query.trim());
      setResult(identity);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Identity not found');
    } finally {
      setLoading(false);
    }
  };

  const handleProposeController = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!result || !newControllerAddr.trim()) return;

    const targetAddr = newControllerAddr.trim();
    if (!targetAddr.startsWith('0x') || targetAddr.length !== 42) {
      setTransferMsg({ type: 'error', text: 'Invalid controller address (must be a valid 42-character 0x Ethereum address).' });
      return;
    }

    if (chainId !== sepolia.id && switchChain) {
      try {
        await switchChain({ chainId: sepolia.id });
      } catch {
        setTransferMsg({ type: 'error', text: 'Please switch your wallet network to Ethereum Sepolia to proceed.' });
        return;
      }
    }

    setTransferLoading(true);
    setTransferMsg(null);

    try {
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESSES.IDENTITY_REGISTRY,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'proposeController',
        args: [result.did, targetAddr as `0x${string}`],
      });

      setTransferMsg({
        type: 'success',
        text: `Controller proposal transaction submitted to wallet!`,
        txHash: hash,
      });
      setResult({ ...result, pending_controller: targetAddr.toLowerCase() });
      setShowProposeForm(false);
      setNewControllerAddr('');
    } catch (err: unknown) {
      const anyErr = err as Record<string, unknown> | null;
      const shortMsg = (anyErr?.shortMessage as string) || (err instanceof Error ? err.message : '');
      if (shortMsg.includes('User rejected') || shortMsg.includes('User denied') || anyErr?.name === 'UserRejectedRequestError') {
        setTransferMsg({ type: 'error', text: 'Transaction was rejected in your wallet.' });
      } else {
        setTransferMsg({ type: 'error', text: shortMsg || 'Failed to propose controller.' });
      }
    } finally {
      setTransferLoading(false);
    }
  };

  const handleAcceptController = async () => {
    if (!result) return;

    if (chainId !== sepolia.id && switchChain) {
      try {
        await switchChain({ chainId: sepolia.id });
      } catch {
        setTransferMsg({ type: 'error', text: 'Please switch your wallet network to Ethereum Sepolia to proceed.' });
        return;
      }
    }

    setTransferLoading(true);
    setTransferMsg(null);

    try {
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESSES.IDENTITY_REGISTRY,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'acceptController',
        args: [result.did],
      });

      setTransferMsg({
        type: 'success',
        text: `Controller transfer accept transaction submitted!`,
        txHash: hash,
      });
      setResult({
        ...result,
        controller: address || result.pending_controller || result.controller,
        pending_controller: '',
      });
    } catch (err: unknown) {
      const anyErr = err as Record<string, unknown> | null;
      const shortMsg = (anyErr?.shortMessage as string) || (err instanceof Error ? err.message : '');
      if (shortMsg.includes('User rejected') || shortMsg.includes('User denied') || anyErr?.name === 'UserRejectedRequestError') {
        setTransferMsg({ type: 'error', text: 'Transaction was rejected in your wallet.' });
      } else {
        setTransferMsg({ type: 'error', text: shortMsg || 'Failed to accept controller transfer.' });
      }
    } finally {
      setTransferLoading(false);
    }
  };

  const isCurrentController = address && result && result.controller.toLowerCase() === address.toLowerCase();
  const isPendingController = address && result && result.pending_controller && result.pending_controller.toLowerCase() === address.toLowerCase();

  return (
    <div className="section">
      <div className="container" style={{ maxWidth: 800 }}>
        <h2 className="section-title">Identity Lookup & Management</h2>
        <p style={{ textAlign: 'center', color: 'var(--gray-600)', marginBottom: 'var(--space-8)' }}>
          Resolve a Decentralized Identifier (DID), look up controller details, or transfer DID control.
        </p>

        <form onSubmit={handleSearch} className="card" style={{ padding: 'var(--space-8)' }}>
          <div className="form-group">
            <label className="form-label">Search Type</label>
            <select
              className="form-select"
              value={searchType}
              onChange={(e) => setSearchType(e.target.value as 'did' | 'address')}
            >
              <option value="did">Search by DID</option>
              <option value="address">Search by Controller Address</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">
              {searchType === 'did' ? 'DID String' : 'Ethereum Address'}
            </label>
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <input
                type="text"
                className="form-input"
                placeholder={
                  searchType === 'did'
                    ? 'did:trustchain:0x...'
                    : '0x...'
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" disabled={loading}>
                <Search size={16} />
                {loading ? 'Searching...' : 'Search'}
              </button>
            </div>
          </div>
        </form>

        {error && (
          <div className="form-error" style={{ marginTop: 'var(--space-6)' }}>
            <XCircle size={18} /> {error}
          </div>
        )}

        {result && (
          <div className="card" style={{ marginTop: 'var(--space-6)', padding: 'var(--space-8)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <User size={24} color="var(--primary-600)" />
                <h3 style={{ margin: 0 }}>Identity Record</h3>
                {result.is_active ? (
                  <span className="badge badge-active"><CheckCircle size={12} /> Active</span>
                ) : (
                  <span className="badge badge-revoked"><XCircle size={12} /> Inactive</span>
                )}
              </div>

              {(isCurrentController || isAdmin) && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowProposeForm(!showProposeForm)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <ArrowRightLeft size={14} />
                  {showProposeForm ? 'Cancel Transfer' : 'Transfer DID Control'}
                </button>
              )}
            </div>

            {transferMsg && (
              <div
                className={`form-${transferMsg.type === 'success' ? 'success' : 'error'}`}
                style={{ marginBottom: 'var(--space-6)' }}
              >
                {transferMsg.type === 'success' ? <CheckCircle size={18} /> : <XCircle size={18} />}
                <span>
                  {transferMsg.text}
                  {transferMsg.txHash && (
                    <>
                      {' '}—{' '}
                      <a
                        href={`https://sepolia.etherscan.io/tx/${transferMsg.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontWeight: 600, color: 'inherit', textDecoration: 'underline' }}
                      >
                        View on Etherscan <ExternalLink size={12} style={{ display: 'inline' }} />
                      </a>
                    </>
                  )}
                </span>
              </div>
            )}

            {/* Pending Transfer Alert */}
            {result.pending_controller && result.pending_controller.trim() !== '' && (
              <div
                className="card"
                style={{
                  background: 'var(--warning-50, #fffbe6)',
                  border: '1px solid var(--warning-300, #ffe58f)',
                  padding: 'var(--space-5)',
                  marginBottom: 'var(--space-6)',
                  borderRadius: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <strong style={{ color: 'var(--warning-800, #873800)', display: 'block', marginBottom: 2 }}>
                      ⚠️ Controller Transfer Pending
                    </strong>
                    <span style={{ fontSize: '0.85rem', color: 'var(--gray-700)' }}>
                      Proposed New Controller: <code className="mono">{result.pending_controller}</code>
                    </span>
                  </div>

                  {isPendingController && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={handleAcceptController}
                      disabled={transferLoading}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <ShieldCheck size={16} />
                      {transferLoading ? 'Accepting...' : 'Accept DID Ownership'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Propose Transfer Form */}
            {showProposeForm && (
              <form
                onSubmit={handleProposeController}
                style={{
                  background: 'var(--gray-50)',
                  border: '1px solid var(--gray-200)',
                  padding: 'var(--space-6)',
                  borderRadius: 8,
                  marginBottom: 'var(--space-6)',
                }}
              >
                <h4 style={{ margin: '0 0 12px 0', color: 'var(--gray-800)' }}>Propose New DID Controller (Step 1 of 2)</h4>
                <div className="form-group">
                  <label className="form-label">New Controller Wallet Address</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="0x..."
                    value={newControllerAddr}
                    onChange={(e) => setNewControllerAddr(e.target.value)}
                    required
                  />
                  <small style={{ display: 'block', color: 'var(--gray-500)', marginTop: 4 }}>
                    The proposed controller must accept the transfer to complete ownership handoff.
                  </small>
                </div>
                <button type="submit" className="btn btn-primary btn-sm" disabled={transferLoading}>
                  {transferLoading ? 'Proposing...' : 'Submit Propose Transaction'}
                </button>
              </form>
            )}

            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">DID</span>
                <span className="detail-value mono">{result.did}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Controller</span>
                <span className="detail-value mono">{result.controller}</span>
              </div>
              {result.pending_controller && result.pending_controller.trim() !== '' && (
                <div className="detail-item">
                  <span className="detail-label">Pending Controller</span>
                  <span className="detail-value mono" style={{ color: 'var(--warning-700)' }}>
                    {result.pending_controller}
                  </span>
                </div>
              )}
              <div className="detail-item">
                <span className="detail-label">Status</span>
                <span className="detail-value">{result.status}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Public Key</span>
                <span className="detail-value mono" style={{ fontSize: 'var(--text-xs)', wordBreak: 'break-all' }}>
                  {result.public_key || '—'}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Metadata URI</span>
                <span className="detail-value mono">{result.metadata_uri || '—'}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
