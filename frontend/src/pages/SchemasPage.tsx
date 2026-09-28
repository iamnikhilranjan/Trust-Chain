/* ═══════════════════════════════════════════════════════════════════════════
   SchemasPage — Browse & Register W3C Credential Schemas
   Direct wallet-signed registration via MetaMask/RainbowKit & Wagmi
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import {
  Blocks,
  CheckCircle,
  XCircle,
  Plus,
  Loader2,
  ExternalLink,
  Sparkles,
  ShieldAlert,
  ChevronUp,
  Power,
  PowerOff,
} from 'lucide-react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { keccak256, stringToBytes } from 'viem';
import { useAuth } from '../context/AuthContext';
import { listSchemas } from '../services/api';
import { CONTRACT_ADDRESSES, SCHEMA_REGISTRY_ABI } from '../config/contracts';
import type { SchemaRecord } from '../types';
import './FormPage.css';

interface SchemasPageProps {
  createMode?: boolean;
}

export default function SchemasPage({ createMode = false }: SchemasPageProps) {
  const { isAuthenticated, isAdmin, isManager } = useAuth();
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const [schemas, setSchemas] = useState<SchemaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(createMode);

  // Form states
  const [schemaId, setSchemaId] = useState('');
  const [name, setName] = useState('');
  const [schemaUri, setSchemaUri] = useState('');
  const [schemaHash, setSchemaHash] = useState('');
  const [version, setVersion] = useState('1.0.0');

  const [isAwaitingSignature, setIsAwaitingSignature] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  // Status toggle states
  const [togglingSchemaId, setTogglingSchemaId] = useState<string | null>(null);
  const [statusTxHash, setStatusTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [statusFeedback, setStatusFeedback] = useState<{ id: string; msg: string; isError: boolean } | null>(null);

  const { writeContractAsync } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const { isLoading: isStatusConfirming, isSuccess: isStatusConfirmed } = useWaitForTransactionReceipt({
    hash: statusTxHash,
  });

  const loadSchemas = () => {
    setLoading(true);
    listSchemas()
      .then(setSchemas)
      .catch(() => setSchemas([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSchemas();
  }, []);

  // When registration transaction confirms on-chain, re-fetch list and reset form
  useEffect(() => {
    if (isConfirmed && txHash) {
      loadSchemas();
    }
  }, [isConfirmed, txHash]);

  // When status toggle transaction confirms on-chain, re-fetch list
  useEffect(() => {
    if (isStatusConfirmed && statusTxHash) {
      loadSchemas();
      setTogglingSchemaId(null);
    }
  }, [isStatusConfirmed, statusTxHash]);

  // Generate unique Keccak-256 hash for the schema
  const handleGenerateHash = () => {
    const rawContent = `${schemaId || 'SCHEMA'}:${name || 'Name'}:${schemaUri || 'uri'}:${version || '1.0.0'}:${Date.now()}`;
    const hash = keccak256(stringToBytes(rawContent));
    setSchemaHash(hash);
    setError(null);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedId = schemaId.trim().toUpperCase();
    const trimmedName = name.trim();
    const trimmedUri = schemaUri.trim();
    let trimmedHash = schemaHash.trim();
    const trimmedVersion = version.trim() || '1.0.0';

    if (!trimmedId) {
      setError('Schema ID is required.');
      return;
    }
    if (!trimmedName) {
      setError('Schema Name is required.');
      return;
    }
    if (!trimmedUri) {
      setError('Schema URI is required.');
      return;
    }

    // Auto-generate hash if omitted
    if (!trimmedHash) {
      trimmedHash = keccak256(stringToBytes(`${trimmedId}:${trimmedName}:${trimmedUri}:${trimmedVersion}`));
      setSchemaHash(trimmedHash);
    } else if (!trimmedHash.startsWith('0x')) {
      trimmedHash = '0x' + trimmedHash;
    }

    if (trimmedHash.length !== 66) {
      setError('Schema Hash must be a 32-byte hex string (66 characters starting with 0x). Click "Generate Hash".');
      return;
    }
    if (/^0x0+$/i.test(trimmedHash)) {
      setError('Schema Hash cannot be all zeros.');
      return;
    }

    // Network check
    if (chainId !== sepolia.id && switchChain) {
      try {
        await switchChain({ chainId: sepolia.id });
      } catch (err: unknown) {
        setError('Please switch your wallet network to Ethereum Sepolia.');
        return;
      }
    }

    const schemaHashBytes = (trimmedHash.startsWith('0x') ? trimmedHash : `0x${trimmedHash}`) as `0x${string}`;

    setIsAwaitingSignature(true);
    setTxHash(undefined);

    try {
      // Trigger MetaMask wallet confirmation modal
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESSES.SCHEMA_REGISTRY,
        abi: SCHEMA_REGISTRY_ABI,
        functionName: 'registerSchema',
        args: [
          trimmedId,
          trimmedName,
          trimmedUri,
          schemaHashBytes,
          trimmedVersion,
        ],
      });

      setTxHash(hash);
    } catch (err: unknown) {
      const anyErr = err as Record<string, unknown> | null;
      const shortMsg = (anyErr?.shortMessage as string) || (err instanceof Error ? err.message : '');

      if (
        shortMsg.includes('User rejected') ||
        shortMsg.includes('User denied') ||
        shortMsg.includes('user rejected') ||
        anyErr?.name === 'UserRejectedRequestError'
      ) {
        setError('Transaction request was rejected in your wallet.');
      } else if (shortMsg.includes('schemaId already registered')) {
        setError('This Schema ID is already registered on the blockchain.');
      } else if (shortMsg.includes('caller is not Manager or Admin')) {
        setError('Only Manager or Admin role is authorized to register schemas.');
      } else {
        setError(shortMsg || (err instanceof Error ? err.message : 'Schema registration failed'));
      }
    } finally {
      setIsAwaitingSignature(false);
    }
  };

  const handleToggleStatus = async (targetSchemaId: string, currentStatus: boolean) => {
    setStatusFeedback(null);
    if (chainId !== sepolia.id && switchChain) {
      try {
        await switchChain({ chainId: sepolia.id });
      } catch {
        setStatusFeedback({
          id: targetSchemaId,
          msg: 'Please switch your wallet network to Ethereum Sepolia.',
          isError: true,
        });
        return;
      }
    }

    setTogglingSchemaId(targetSchemaId);
    setStatusTxHash(undefined);

    try {
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESSES.SCHEMA_REGISTRY,
        abi: SCHEMA_REGISTRY_ABI,
        functionName: 'setSchemaStatus',
        args: [targetSchemaId, !currentStatus],
      });

      setStatusTxHash(hash);
      setStatusFeedback({
        id: targetSchemaId,
        msg: `Transaction submitted! Setting schema to ${!currentStatus ? 'Active' : 'Inactive'}...`,
        isError: false,
      });
    } catch (err: unknown) {
      const anyErr = err as Record<string, unknown> | null;
      const shortMsg = (anyErr?.shortMessage as string) || (err instanceof Error ? err.message : 'Action failed');
      
      if (
        shortMsg.includes('User rejected') ||
        shortMsg.includes('User denied') ||
        shortMsg.includes('user rejected') ||
        anyErr?.name === 'UserRejectedRequestError'
      ) {
        setStatusFeedback({ id: targetSchemaId, msg: 'Transaction was cancelled in wallet.', isError: true });
      } else {
        setStatusFeedback({ id: targetSchemaId, msg: shortMsg, isError: true });
      }
      setTogglingSchemaId(null);
    }
  };

  const isBusy = isAwaitingSignature || isConfirming;
  const canRegister = isAuthenticated && isConnected && (isAdmin || isManager);

  return (
    <div className="section">
      <div className="container">
        {/* Header with Title & Action Button */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--space-6)',
            flexWrap: 'wrap',
            gap: 'var(--space-4)',
          }}
        >
          <div>
            <h2 className="section-title" style={{ margin: 0, textAlign: 'left' }}>
              Schema Registry
            </h2>
            <p style={{ margin: 'var(--space-1) 0 0', color: 'var(--gray-600)' }}>
              Browse and register W3C credential schemas on the blockchain.
            </p>
          </div>

          {(isManager || isAdmin) && (
            <button
              type="button"
              className={`btn ${showCreateForm ? 'btn-secondary' : 'btn-primary'}`}
              onClick={() => {
                setShowCreateForm(!showCreateForm);
                setError(null);
                setTxHash(undefined);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 18px',
                fontWeight: 600,
              }}
            >
              {showCreateForm ? (
                <>
                  <ChevronUp size={16} /> Hide Registration Form
                </>
              ) : (
                <>
                  <Plus size={16} /> Register New Schema
                </>
              )}
            </button>
          )}
        </div>

        {/* Collapsible Registration Form Card */}
        {showCreateForm && (
          <div
            className="card"
            style={{
              padding: 'var(--space-8)',
              marginBottom: 'var(--space-8)',
              border: '2px solid var(--primary-100, #e0e7ff)',
              boxShadow: '0 4px 20px rgba(0, 48, 135, 0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-4)' }}>
              <Blocks size={22} color="var(--primary-600)" />
              <h3 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 700 }}>
                Register New Credential Schema
              </h3>
            </div>
            <p style={{ color: 'var(--gray-600)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)' }}>
              Registers a schema definition on the SchemaRegistry smart contract. Transactions will be confirmed
              and signed directly by your connected MetaMask wallet.
            </p>

            {!canRegister ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: 'var(--space-4)',
                  background: '#fef3c7',
                  borderRadius: 'var(--radius-md)',
                  color: '#92400e',
                  fontSize: 'var(--text-sm)',
                }}
              >
                <ShieldAlert size={20} />
                <span>
                  {!isAuthenticated || !isConnected
                    ? 'Please connect your wallet with Admin or Manager role to register schemas.'
                    : 'Only Manager or Admin role can register schemas on the blockchain.'}
                </span>
              </div>
            ) : (
              <form onSubmit={handleRegisterSubmit}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
                  {/* Schema ID */}
                  <div className="form-group">
                    <label className="form-label">Schema ID *</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. BEL_SECURITY_CLEARANCE_V2"
                      value={schemaId}
                      onChange={(e) => setSchemaId(e.target.value.toUpperCase())}
                      required
                      disabled={isBusy}
                    />
                    <small style={{ color: 'var(--gray-500)', fontSize: 'var(--text-xs)' }}>
                      Uppercase unique identifier, e.g. <code>BEL_EMPLOYEE_ID_V1</code>
                    </small>
                  </div>

                  {/* Schema Name */}
                  <div className="form-group">
                    <label className="form-label">Schema Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. BEL High Security Clearance"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      disabled={isBusy}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
                  {/* Schema URI */}
                  <div className="form-group">
                    <label className="form-label">Schema URI *</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="ipfs://Qm... or https://schemas.trustchain.bel.in/v1.json"
                      value={schemaUri}
                      onChange={(e) => setSchemaUri(e.target.value)}
                      required
                      disabled={isBusy}
                    />
                  </div>

                  {/* Version */}
                  <div className="form-group">
                    <label className="form-label">Version *</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="1.0.0"
                      value={version}
                      onChange={(e) => setVersion(e.target.value)}
                      required
                      disabled={isBusy}
                    />
                  </div>
                </div>

                {/* Schema Hash */}
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-1)' }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>
                      Schema Hash (Keccak-256) *
                    </label>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={handleGenerateHash}
                      disabled={isBusy}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 8px',
                        fontSize: 'var(--text-xs)',
                        cursor: 'pointer',
                      }}
                      title="Compute cryptographic hash"
                    >
                      <Sparkles size={12} /> Generate Hash
                    </button>
                  </div>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="0x... (or click Generate Hash)"
                    value={schemaHash}
                    onChange={(e) => setSchemaHash(e.target.value)}
                    required
                    disabled={isBusy}
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-lg"
                  disabled={isBusy}
                  style={{
                    width: '100%',
                    marginTop: 'var(--space-4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  {isAwaitingSignature && (
                    <>
                      <Loader2 size={18} className="spin" />
                      Approve in MetaMask...
                    </>
                  )}
                  {!isAwaitingSignature && isConfirming && (
                    <>
                      <Loader2 size={18} className="spin" />
                      Confirming on Sepolia...
                    </>
                  )}
                  {!isBusy && 'Register Schema on Blockchain'}
                </button>
              </form>
            )}

            {error && (
              <div className="form-error" style={{ marginTop: 'var(--space-4)' }}>
                {error}
              </div>
            )}

            {isAwaitingSignature && (
              <div
                className="card"
                style={{
                  marginTop: 'var(--space-4)',
                  padding: 'var(--space-4)',
                  borderLeft: '4px solid var(--primary)',
                  background: '#f0f4ff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <Loader2 size={20} className="spin" color="var(--primary)" />
                <div>
                  <strong>Signature Request Sent to Wallet</strong>
                  <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--gray-700)' }}>
                    Please check MetaMask and confirm the transaction to register <code>{schemaId}</code>.
                  </p>
                </div>
              </div>
            )}

            {txHash && !isConfirmed && (
              <div
                className="card"
                style={{
                  marginTop: 'var(--space-4)',
                  padding: 'var(--space-4)',
                  borderLeft: '4px solid var(--warning)',
                  background: '#fffbeb',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <Loader2 size={20} className="spin" color="var(--warning)" />
                <div>
                  <strong>Transaction Broadcasted to Sepolia</strong>
                  <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--gray-700)' }}>
                    Waiting for block confirmation...{' '}
                    <a
                      href={`https://sepolia.etherscan.io/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontWeight: 600 }}
                    >
                      View on Etherscan <ExternalLink size={12} />
                    </a>
                  </p>
                </div>
              </div>
            )}

            {isConfirmed && txHash && (
              <div className="form-success" style={{ marginTop: 'var(--space-4)' }}>
                <CheckCircle size={18} />
                <span>
                  Schema <strong>{schemaId}</strong> successfully registered on-chain! —{' '}
                  <a
                    href={`https://sepolia.etherscan.io/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontWeight: 600 }}
                  >
                    View on Etherscan
                  </a>
                </span>
              </div>
            )}
          </div>
        )}

        {/* Existing Schemas Grid */}
        {loading ? (
          <div className="loading-overlay" style={{ minHeight: 200 }}>
            <div className="spinner" />
          </div>
        ) : schemas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-10)', color: 'var(--gray-500)' }}>
            <Blocks size={48} color="var(--gray-300)" />
            <p style={{ marginTop: 'var(--space-4)' }}>No schemas registered yet.</p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
              gap: 'var(--space-6)',
            }}
          >
            {schemas.map((schema) => {
              const isTogglingThis = togglingSchemaId === schema.schema_id && (isStatusConfirming || !statusTxHash);
              const cardFeedback = statusFeedback?.id === schema.schema_id ? statusFeedback : null;

              return (
                <div key={schema.schema_id} className="card" style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 'var(--space-4)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <Blocks size={20} color="var(--primary-600)" />
                        <h4 style={{ margin: 0, fontSize: 'var(--text-base)' }}>
                          {schema.name || schema.schema_id}
                        </h4>
                      </div>
                      {schema.is_active ? (
                        <span className="badge badge-active">
                          <CheckCircle size={10} /> Active
                        </span>
                      ) : (
                        <span className="badge badge-revoked">
                          <XCircle size={10} /> Inactive
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--space-2)',
                        fontSize: 'var(--text-sm)',
                      }}
                    >
                      <div>
                        <strong style={{ color: 'var(--gray-500)', fontSize: 'var(--text-xs)' }}>Schema ID</strong>
                        <br />
                        <code>{schema.schema_id}</code>
                      </div>
                      <div>
                        <strong style={{ color: 'var(--gray-500)', fontSize: 'var(--text-xs)' }}>Version</strong>
                        <br />
                        {schema.version || '—'}
                      </div>
                      <div>
                        <strong style={{ color: 'var(--gray-500)', fontSize: 'var(--text-xs)' }}>Author</strong>
                        <br />
                        <span className="mono" style={{ fontSize: 'var(--text-xs)' }}>
                          {schema.author || '—'}
                        </span>
                      </div>
                      <div>
                        <strong style={{ color: 'var(--gray-500)', fontSize: 'var(--text-xs)' }}>Schema Hash</strong>
                        <br />
                        <span className="mono" style={{ fontSize: 'var(--text-xs)', wordBreak: 'break-all' }}>
                          {schema.schema_hash || '—'}
                        </span>
                      </div>
                      {schema.schema_uri && (
                        <div>
                          <strong style={{ color: 'var(--gray-500)', fontSize: 'var(--text-xs)' }}>Schema URI</strong>
                          <br />
                          <a
                            href={schema.schema_uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: 'var(--text-xs)' }}
                          >
                            {schema.schema_uri}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Manager/Admin Status Toggle Action */}
                  {(isManager || isAdmin) && (
                    <div style={{ marginTop: 'var(--space-5)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--gray-100)' }}>
                      {cardFeedback && (
                        <div
                          style={{
                            marginBottom: 'var(--space-3)',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            fontSize: 'var(--text-xs)',
                            backgroundColor: cardFeedback.isError ? 'var(--danger-50, #fef2f2)' : 'var(--primary-50, #eef2ff)',
                            color: cardFeedback.isError ? 'var(--danger)' : 'var(--primary-700)',
                            border: `1px solid ${cardFeedback.isError ? 'var(--danger-200, #fecaca)' : 'var(--primary-200, #c7d2fe)'}`,
                          }}
                        >
                          {cardFeedback.msg}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => handleToggleStatus(schema.schema_id, schema.is_active)}
                        disabled={isBusy || (togglingSchemaId !== null && togglingSchemaId !== schema.schema_id)}
                        className={`btn btn-sm ${schema.is_active ? 'btn-secondary' : 'btn-primary'}`}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          color: schema.is_active ? 'var(--danger, #ef4444)' : undefined,
                          borderColor: schema.is_active ? 'var(--danger-200, #fecaca)' : undefined,
                        }}
                      >
                        {isTogglingThis ? (
                          <>
                            <Loader2 size={14} className="spin" /> Processing On-Chain...
                          </>
                        ) : schema.is_active ? (
                          <>
                            <PowerOff size={14} /> Deactivate Schema
                          </>
                        ) : (
                          <>
                            <Power size={14} /> Reactivate Schema
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
