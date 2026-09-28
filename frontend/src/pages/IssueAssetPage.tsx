/* ═══════════════════════════════════════════════════════════════════════════
   IssueAssetPage — Manager/Admin form to issue asset NFTs
   Direct wallet-signed transaction via MetaMask/RainbowKit & Wagmi
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { ShieldAlert, CheckCircle, Loader2, Sparkles, ExternalLink, Check, AlertCircle } from 'lucide-react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { keccak256, stringToBytes } from 'viem';
import { useAuth } from '../context/AuthContext';
import { listSchemas, getIdentity } from '../services/api';
import { CONTRACT_ADDRESSES, ASSET_REGISTRY_ABI } from '../config/contracts';
import type { SchemaRecord } from '../types';
import './FormPage.css';

export default function IssueAssetPage() {
  const { isAuthenticated, isAdmin, isManager, address } = useAuth();
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const [schemas, setSchemas] = useState<SchemaRecord[]>([]);
  const [ownerDid, setOwnerDid] = useState('');
  const [schemaId, setSchemaId] = useState('');
  const [assetType, setAssetType] = useState('');
  const [credHash, setCredHash] = useState('');
  const [metadataUri, setMetadataUri] = useState('');
  const [isTransferable, setIsTransferable] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');

  const [recipientAddress, setRecipientAddress] = useState<`0x${string}` | null>(null);
  const [isResolvingRecipient, setIsResolvingRecipient] = useState(false);
  const [recipientResolutionError, setRecipientResolutionError] = useState<string | null>(null);

  const [isAwaitingSignature, setIsAwaitingSignature] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const { writeContractAsync } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  useEffect(() => {
    listSchemas().then(setSchemas).catch(() => {});
  }, []);

  // Automatically resolve recipient controller address when owner DID changes
  useEffect(() => {
    const trimmed = ownerDid.trim();
    if (!trimmed.startsWith('did:trustchain:') || trimmed.length < 20) {
      setRecipientAddress(null);
      setRecipientResolutionError(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsResolvingRecipient(true);
      setRecipientResolutionError(null);
      try {
        const idRecord = await getIdentity(trimmed);
        if (idRecord && idRecord.controller) {
          setRecipientAddress(idRecord.controller as `0x${string}`);
          setRecipientResolutionError(null);
        } else {
          setRecipientAddress(null);
          setRecipientResolutionError('DID record found but controller is missing.');
        }
      } catch (err: unknown) {
        setRecipientAddress(null);
        setRecipientResolutionError('Owner DID is not registered on-chain yet. Please register it in Identity Registry first.');
      } finally {
        setIsResolvingRecipient(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [ownerDid]);

  // Handle schema selection and auto-suggest asset type
  const handleSchemaChange = (selectedSchemaId: string) => {
    setSchemaId(selectedSchemaId);
    if (!assetType || assetType === 'None') {
      const match = schemas.find((s) => s.schema_id === selectedSchemaId);
      if (match) {
        const suggested = match.schema_id.replace(/_V\d+$/i, '');
        setAssetType(suggested);
      }
    }
  };

  // Generate unique valid 32-byte Keccak-256 hash
  const handleGenerateHash = () => {
    const seed = `${ownerDid || 'owner'}:${schemaId || 'schema'}:${assetType || 'asset'}:${Date.now()}:${Math.random()}`;
    const hash = keccak256(stringToBytes(seed));
    setCredHash(hash);
    setError(null);
  };

  if (!isAuthenticated || !isConnected) {
    return (
      <div className="section">
        <div className="container" style={{ maxWidth: 600, textAlign: 'center', padding: 'var(--space-16) 0' }}>
          <ShieldAlert size={48} color="var(--warning)" />
          <h3 style={{ marginTop: 'var(--space-4)' }}>Authentication Required</h3>
          <p style={{ color: 'var(--gray-600)' }}>Connect your wallet to issue assets.</p>
        </div>
      </div>
    );
  }

  if (!isAdmin && !isManager) {
    return (
      <div className="section">
        <div className="container" style={{ maxWidth: 600, textAlign: 'center', padding: 'var(--space-16) 0' }}>
          <ShieldAlert size={48} color="var(--danger)" />
          <h3 style={{ marginTop: 'var(--space-4)' }}>Manager or Admin Required</h3>
          <p style={{ color: 'var(--gray-600)' }}>Only Manager/Admin roles can issue asset NFTs.</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedOwnerDid = ownerDid.trim();
    const trimmedSchemaId = schemaId.trim();
    const trimmedAssetType = assetType.trim();
    let trimmedCredHash = credHash.trim();
    const trimmedMetadataUri = metadataUri.trim();

    if (!trimmedOwnerDid.startsWith('did:trustchain:') || trimmedOwnerDid.length < 20) {
      setError('Owner DID must start with "did:trustchain:" and be at least 20 characters long.');
      return;
    }

    if (!trimmedSchemaId) {
      setError('Please select a schema.');
      return;
    }

    if (!trimmedAssetType) {
      setError('Asset Type is required.');
      return;
    }

    // Format and validate Credential Hash
    if (!trimmedCredHash.startsWith('0x')) {
      trimmedCredHash = '0x' + trimmedCredHash;
    }
    if (trimmedCredHash.length !== 66) {
      setError('Credential Hash must be exactly 32 bytes (64 hex characters starting with 0x). Click "Generate Hash" if you need a valid hash.');
      return;
    }
    if (/^0x0+$/i.test(trimmedCredHash)) {
      setError('Credential Hash cannot be all zeros. Click "Generate Hash" to create a valid cryptographic hash.');
      return;
    }

    // Network check
    if (chainId !== sepolia.id && switchChain) {
      try {
        await switchChain({ chainId: sepolia.id });
      } catch (err: unknown) {
        setError('Please switch your wallet network to Ethereum Sepolia to continue.');
        return;
      }
    }

    // Resolve recipient controller
    let recipient = recipientAddress;
    if (!recipient) {
      try {
        const idRecord = await getIdentity(trimmedOwnerDid);
        if (idRecord?.controller) {
          recipient = idRecord.controller as `0x${string}`;
          setRecipientAddress(recipient);
        } else {
          setError('Could not resolve controller address for this Owner DID. Please ensure the DID is registered.');
          return;
        }
      } catch (err) {
        setError('Owner DID is not registered on the blockchain. Please register the identity first before issuing an asset.');
        return;
      }
    }

    // Determine issuer DID
    const issuerDid = address
      ? `did:trustchain:${address}`
      : 'did:trustchain:0x2cb4f72907B1EC202a2f751Da0286aa9Ee2E3b33';

    const expiryTimestamp = expiresAt ? BigInt(Math.floor(new Date(expiresAt).getTime() / 1000)) : 0n;
    const credHashBytes = (trimmedCredHash.startsWith('0x') ? trimmedCredHash : `0x${trimmedCredHash}`) as `0x${string}`;
    const recipientAddr = (recipient || address) as `0x${string}`;

    setIsAwaitingSignature(true);
    setTxHash(undefined);

    try {
      // Trigger wallet transaction signature prompt (MetaMask approval modal)
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESSES.ASSET_REGISTRY,
        abi: ASSET_REGISTRY_ABI,
        functionName: 'issueAsset',
        args: [
          recipientAddr,
          trimmedOwnerDid,
          issuerDid,
          trimmedAssetType,
          trimmedSchemaId,
          credHashBytes,
          trimmedMetadataUri,
          expiryTimestamp,
          isTransferable,
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
      } else if (shortMsg.includes('zero credentialHash')) {
        setError('Credential hash cannot be zero. Click "Generate Hash" to create a valid hash.');
      } else if (shortMsg.includes('credential hash already anchored')) {
        setError('This Credential Hash is already anchored on-chain. Click "Generate Hash" to create a fresh unique hash.');
      } else if (shortMsg.includes('recipient is not active controller')) {
        setError('The recipient address is not the active controller of the specified Owner DID.');
      } else if (shortMsg.includes('issuer is not active controller')) {
        setError('Your connected wallet is not the active controller of the Issuer DID.');
      } else if (shortMsg.includes('caller is not Manager or Admin')) {
        setError('Only Manager or Admin role is permitted to issue asset NFTs.');
      } else {
        setError(shortMsg || (err instanceof Error ? err.message : 'Issuance transaction failed'));
      }
    } finally {
      setIsAwaitingSignature(false);
    }
  };

  const isBusy = isAwaitingSignature || isConfirming;

  if (!isAuthenticated || !isConnected) {
    return (
      <div className="section">
        <div className="container" style={{ maxWidth: 600, textAlign: 'center', padding: 'var(--space-16) 0' }}>
          <ShieldAlert size={48} color="var(--warning)" style={{ margin: '0 auto' }} />
          <h3 style={{ marginTop: 'var(--space-4)' }}>Authentication Required</h3>
          <p style={{ color: 'var(--gray-600)' }}>Please connect your wallet to issue credentials.</p>
        </div>
      </div>
    );
  }

  if (!isManager && !isAdmin) {
    return (
      <div className="section">
        <div className="container" style={{ maxWidth: 600, textAlign: 'center', padding: 'var(--space-16) 0' }}>
          <ShieldAlert size={48} color="var(--danger)" style={{ margin: '0 auto' }} />
          <h3 style={{ marginTop: 'var(--space-4)' }}>Manager Role Required</h3>
          <p style={{ color: 'var(--gray-600)' }}>Only accounts with the Manager or Admin role are permitted to issue asset NFTs.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="container" style={{ maxWidth: 700 }}>
        <h2 className="section-title">Issue Asset</h2>
        <p style={{ textAlign: 'center', color: 'var(--gray-600)', marginBottom: 'var(--space-8)' }}>
          Mint a new ERC-721 digital asset NFT with anchored credential hash directly on Ethereum Sepolia.
        </p>

        <form onSubmit={handleSubmit} className="card" style={{ padding: 'var(--space-8)' }}>
          {/* Owner DID */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-1)' }}>
              <label className="form-label" style={{ marginBottom: 0 }}>Owner DID *</label>
              {isResolvingRecipient && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-500)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Loader2 size={12} className="spin" /> Resolving controller...
                </span>
              )}
              {recipientAddress && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
                  <Check size={12} /> Recipient: {recipientAddress.slice(0, 6)}...{recipientAddress.slice(-4)}
                </span>
              )}
            </div>
            <input
              type="text"
              className="form-input"
              placeholder="did:trustchain:bel:employee-005"
              value={ownerDid}
              onChange={(e) => setOwnerDid(e.target.value)}
              required
              disabled={isBusy}
            />
            {recipientResolutionError && (
              <p style={{ margin: '4px 0 0', fontSize: 'var(--text-xs)', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertCircle size={12} /> {recipientResolutionError}
              </p>
            )}
          </div>

          {/* Schema ID */}
          <div className="form-group">
            <label className="form-label">Schema ID *</label>
            <select
              className="form-select"
              value={schemaId}
              onChange={(e) => handleSchemaChange(e.target.value)}
              required
              disabled={isBusy}
            >
              <option value="">Select a schema...</option>
              {schemas.map((s) => (
                <option key={s.schema_id} value={s.schema_id} disabled={!s.is_active}>
                  {s.schema_id} — {s.name} {!s.is_active ? '(Inactive)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Asset Type */}
          <div className="form-group">
            <label className="form-label">Asset Type *</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. SECURITY_CLEARANCE, CERTIFICATE"
              value={assetType}
              onChange={(e) => setAssetType(e.target.value)}
              required
              disabled={isBusy}
            />
          </div>

          {/* Credential Hash */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-1)' }}>
              <label className="form-label" style={{ marginBottom: 0 }}>Credential Hash (Keccak-256) *</label>
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
                title="Generate a unique cryptographic hash"
              >
                <Sparkles size={12} /> Generate Hash
              </button>
            </div>
            <input
              type="text"
              className="form-input"
              placeholder="0x... (Click Generate Hash for a unique 32-byte hash)"
              value={credHash}
              onChange={(e) => setCredHash(e.target.value)}
              required
              disabled={isBusy}
            />
          </div>

          {/* Metadata URI */}
          <div className="form-group">
            <label className="form-label">Metadata URI (optional)</label>
            <input
              type="text"
              className="form-input"
              placeholder="ipfs://QmTestEmployee005"
              value={metadataUri}
              onChange={(e) => setMetadataUri(e.target.value)}
              disabled={isBusy}
            />
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-6)' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Expires At (optional)</label>
              <input
                type="datetime-local"
                className="form-input"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                disabled={isBusy}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Transferable?</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-2)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isTransferable}
                  onChange={(e) => setIsTransferable(e.target.checked)}
                  disabled={isBusy}
                />
                <span style={{ fontSize: 'var(--text-sm)' }}>Allow transfer</span>
              </label>
            </div>
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
            {!isBusy && 'Issue Asset NFT'}
          </button>
        </form>

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
                Please check MetaMask and confirm the transaction to issue asset NFT for <code>{ownerDid}</code>.
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
              Asset NFT successfully minted and anchored on-chain! —{' '}
              <a
                href={`https://sepolia.etherscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontWeight: 600 }}
              >
                View Transaction on Etherscan
              </a>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
