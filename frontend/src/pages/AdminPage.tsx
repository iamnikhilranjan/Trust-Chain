/* ═══════════════════════════════════════════════════════════════════════════
   AdminPage — Role Management Panel (Admin only)
   Grant / Revoke Manager, Auditor, User roles via RoleManager smart contract
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import {
  ShieldCheck,
  UserPlus,
  UserMinus,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { keccak256, toBytes } from 'viem';
import { useAuth } from '../context/AuthContext';
import { CONTRACT_ADDRESSES } from '../config/contracts';
import './FormPage.css';

// ── Role Manager ABI (only what we need) ─────────────────────────────────────
const ROLE_MANAGER_ABI = [
  {
    type: 'function',
    name: 'assignRole',
    stateMutability: 'nonpayable',
    inputs: [
      { internalType: 'bytes32', name: 'role', type: 'bytes32' },
      { internalType: 'address', name: 'account', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'unassignRole',
    stateMutability: 'nonpayable',
    inputs: [
      { internalType: 'bytes32', name: 'role', type: 'bytes32' },
      { internalType: 'address', name: 'account', type: 'address' },
    ],
    outputs: [],
  },
] as const;

// ── Role bytes32 values matching the contract ─────────────────────────────────
// DEFAULT_ADMIN_ROLE = 0x00...00 (zeroHash)
// MANAGER_ROLE = keccak256("MANAGER_ROLE")
// AUDITOR_ROLE = keccak256("AUDITOR_ROLE")
// USER_ROLE    = keccak256("USER_ROLE")
const ROLE_HASHES: Record<string, `0x${string}`> = {
  MANAGER: keccak256(toBytes('MANAGER_ROLE')),
  AUDITOR: keccak256(toBytes('AUDITOR_ROLE')),
  USER:    keccak256(toBytes('USER_ROLE')),
};

type Role = 'MANAGER' | 'AUDITOR' | 'USER';
type Action = 'assign' | 'unassign';

const ROLE_CONFIG: Record<Role, { label: string; color: string; bg: string; border: string }> = {
  MANAGER: { label: 'Manager',   color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  AUDITOR: { label: 'Auditor',   color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  USER:    { label: 'User',      color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
};

interface TxState {
  hash: `0x${string}` | undefined;
  role: Role;
  action: Action;
  address: string;
}

export default function AdminPage() {
  const { isAuthenticated, isAdmin } = useAuth();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const [walletInput, setWalletInput] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role>('MANAGER');
  const [selectedAction, setSelectedAction] = useState<Action>('assign');
  const [error, setError] = useState<string | null>(null);
  const [isAwaitingSignature, setIsAwaitingSignature] = useState(false);
  const [txState, setTxState] = useState<TxState | null>(null);

  const { writeContractAsync } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txState?.hash,
  });

  // ── Guards ────────────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="section">
        <div className="container" style={{ maxWidth: 560 }}>
          <div className="card" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
            <ShieldCheck size={56} color="var(--primary-400)" style={{ marginBottom: 16 }} />
            <h3>Connect Your Wallet</h3>
            <p style={{ color: 'var(--gray-600)' }}>You must be authenticated to access the Admin Panel.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="section">
        <div className="container" style={{ maxWidth: 560 }}>
          <div className="card" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
            <AlertTriangle size={56} color="var(--danger)" style={{ marginBottom: 16 }} />
            <h3 style={{ color: 'var(--danger)' }}>Access Denied</h3>
            <p style={{ color: 'var(--gray-600)' }}>Only the Admin wallet can manage roles.</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const addr = walletInput.trim();
    if (!addr.startsWith('0x') || addr.length !== 42) {
      setError('Please enter a valid Ethereum wallet address (0x...).');
      return;
    }

    if (chainId !== sepolia.id) {
      try { switchChain({ chainId: sepolia.id }); } catch { /* ignore */ }
      setError('Please switch to Sepolia testnet first.');
      return;
    }

    setIsAwaitingSignature(true);
    try {
      const roleBytes = ROLE_HASHES[selectedRole];
      const fnName = selectedAction === 'assign' ? 'assignRole' : 'unassignRole';

      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESSES.ROLE_MANAGER,
        abi: ROLE_MANAGER_ABI,
        functionName: fnName,
        args: [roleBytes, addr as `0x${string}`],
      });

      setTxState({ hash, role: selectedRole, action: selectedAction, address: addr });
      setWalletInput('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('User rejected') || msg.includes('user rejected')) {
        setError('Transaction rejected in wallet.');
      } else {
        setError(msg.slice(0, 200));
      }
    } finally {
      setIsAwaitingSignature(false);
    }
  };

  const handleNewAction = () => {
    setTxState(null);
    setError(null);
  };

  // ── Success screen ────────────────────────────────────────────────────────
  if (txState?.hash && isConfirmed) {
    const roleLabel = ROLE_CONFIG[txState.role].label;
    const actionLabel = txState.action === 'assign' ? 'granted' : 'revoked';
    return (
      <div className="section">
        <div className="container" style={{ maxWidth: 560 }}>
          <div className="card" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
            <CheckCircle size={56} color="var(--success)" style={{ marginBottom: 16 }} />
            <h3 style={{ color: 'var(--success)' }}>Role {actionLabel}!</h3>
            <p style={{ color: 'var(--gray-700)', margin: '8px 0 20px' }}>
              <strong>{roleLabel}</strong> role successfully {actionLabel} to{' '}
              <code className="mono" style={{ fontSize: '0.8rem' }}>
                {txState.address.slice(0, 10)}...{txState.address.slice(-8)}
              </code>
            </p>
            <a
              href={`https://sepolia.etherscan.io/tx/${txState.hash}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16 }}
            >
              <ExternalLink size={14} /> View on Etherscan
            </a>
            <br />
            <button className="btn btn-primary" onClick={handleNewAction}>
              Manage Another Role
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="container" style={{ maxWidth: 680 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 'var(--space-6)' }}>
          <ShieldCheck size={36} color="var(--primary-600)" />
          <div>
            <h2 className="section-title" style={{ marginBottom: 4 }}>Admin Panel — Role Management</h2>
            <p style={{ color: 'var(--gray-600)', margin: 0, fontSize: 'var(--text-sm)' }}>
              Grant or revoke roles for wallet addresses directly on the blockchain.
            </p>
          </div>
        </div>

        {/* Role Info Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 'var(--space-6)' }}>
          {(Object.keys(ROLE_CONFIG) as Role[]).map((role) => {
            const cfg = ROLE_CONFIG[role];
            return (
              <div
                key={role}
                onClick={() => setSelectedRole(role)}
                style={{
                  padding: '14px 16px',
                  borderRadius: 8,
                  border: `2px solid ${selectedRole === role ? cfg.color : cfg.border}`,
                  background: selectedRole === role ? cfg.bg : 'white',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: selectedRole === role ? `0 0 0 3px ${cfg.border}` : 'none',
                }}
              >
                <div style={{ fontWeight: 700, color: cfg.color, fontSize: 'var(--text-sm)' }}>
                  {cfg.label}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--gray-500)', marginTop: 2 }}>
                  {role === 'MANAGER' && 'Can issue credentials'}
                  {role === 'AUDITOR' && 'Can view audit logs'}
                  {role === 'USER' && 'Basic access'}
                </div>
              </div>
            );
          })}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="card" style={{ padding: 'var(--space-8)' }}>

          {/* Action Toggle */}
          <div className="form-group">
            <label className="form-label">Action</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                id="action-assign"
                type="button"
                onClick={() => setSelectedAction('assign')}
                className={selectedAction === 'assign' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <UserPlus size={15} /> Grant Role
              </button>
              <button
                id="action-unassign"
                type="button"
                onClick={() => setSelectedAction('unassign')}
                className={selectedAction === 'unassign' ? 'btn btn-danger btn-sm' : 'btn btn-secondary btn-sm'}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <UserMinus size={15} /> Revoke Role
              </button>
            </div>
          </div>

          {/* Role Selector */}
          <div className="form-group">
            <label className="form-label">Role to {selectedAction === 'assign' ? 'Grant' : 'Revoke'} *</label>
            <select
              id="role-select"
              className="form-input"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as Role)}
            >
              <option value="MANAGER">Manager — Can issue credentials</option>
              <option value="AUDITOR">Auditor — Can view audit logs</option>
              <option value="USER">User — Basic access</option>
            </select>
          </div>

          {/* Wallet Address */}
          <div className="form-group">
            <label className="form-label">Wallet Address *</label>
            <input
              id="wallet-address-input"
              type="text"
              className="form-input mono"
              placeholder="0x..."
              value={walletInput}
              onChange={(e) => setWalletInput(e.target.value)}
              required
              style={{ fontFamily: 'monospace' }}
            />
            <p className="form-hint" style={{ marginTop: 4, color: 'var(--gray-500)', fontSize: '0.8rem' }}>
              The Ethereum address of the user whose role you want to {selectedAction === 'assign' ? 'grant' : 'revoke'}.
            </p>
          </div>

          {/* Summary box */}
          {walletInput.length > 10 && (
            <div style={{
              padding: '12px 16px',
              borderRadius: 8,
              background: selectedAction === 'assign' ? '#eff6ff' : '#fef2f2',
              border: `1px solid ${selectedAction === 'assign' ? '#bfdbfe' : '#fecaca'}`,
              marginBottom: 'var(--space-4)',
              fontSize: '0.85rem',
              color: selectedAction === 'assign' ? '#1e40af' : '#991b1b',
            }}>
              {selectedAction === 'assign' ? '✅' : '❌'}{' '}
              <strong>
                {selectedAction === 'assign' ? 'Granting' : 'Revoking'} {ROLE_CONFIG[selectedRole].label} role
              </strong>{' '}
              {selectedAction === 'assign' ? 'to' : 'from'}{' '}
              <code style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{walletInput}</code>
            </div>
          )}

          {error && (
            <div className="form-error" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 'var(--space-4)' }}>
              <XCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              {error}
            </div>
          )}

          {/* Confirming state */}
          {txState?.hash && isConfirming && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--primary-700)',
              background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px',
              marginBottom: 'var(--space-4)', fontSize: '0.875rem' }}>
              <Loader2 size={16} className="spin" />
              Waiting for blockchain confirmation...
              <a href={`https://sepolia.etherscan.io/tx/${txState.hash}`} target="_blank" rel="noreferrer"
                style={{ marginLeft: 'auto', color: 'var(--primary-600)', fontSize: '0.8rem' }}>
                <ExternalLink size={13} />
              </a>
            </div>
          )}

          <button
            id="submit-role-btn"
            type="submit"
            className={`btn btn-lg ${selectedAction === 'assign' ? 'btn-primary' : 'btn-danger'}`}
            disabled={isAwaitingSignature || isConfirming}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            {isAwaitingSignature ? (
              <><Loader2 size={18} className="spin" /> Confirm in MetaMask...</>
            ) : isConfirming ? (
              <><Loader2 size={18} className="spin" /> Confirming on-chain...</>
            ) : selectedAction === 'assign' ? (
              <><UserPlus size={18} /> Grant {ROLE_CONFIG[selectedRole].label} Role</>
            ) : (
              <><UserMinus size={18} /> Revoke {ROLE_CONFIG[selectedRole].label} Role</>
            )}
          </button>
        </form>

        {/* Info box */}
        <div className="card" style={{ padding: 'var(--space-5)', marginTop: 'var(--space-4)',
          background: '#fffbeb', border: '1px solid #fde68a' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '0.85rem', color: '#92400e' }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>On-chain transaction required.</strong> This action writes directly to the{' '}
              <code>RoleManager</code> smart contract on Sepolia. MetaMask will prompt you to sign
              the transaction. Gas fees apply.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
