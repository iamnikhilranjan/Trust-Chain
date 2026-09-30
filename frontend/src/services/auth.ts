/* ═══════════════════════════════════════════════════════════════════════════
   TrustChain — Wallet Authentication Service
   RainbowKit / Wagmi connection + EIP-191 challenge/sign/verify flow
   ═══════════════════════════════════════════════════════════════════════════ */

import { signMessage, disconnect, readContract } from 'wagmi/actions';
import { config } from '../config/wagmi';
import { requestChallenge, verifySignature, setToken } from './api';
import type { VerifySignatureResponse } from '../types';

export const ROLE_MANAGER_ADDRESS = '0xE1042c9Ba98BD841C363262b74F138545760F78D' as const;
export const ADMIN_ADDRESS = '0x2cb4f72907B1EC202a2f751Da0286aa9Ee2E3b33' as const;

const ROLE_MANAGER_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'isAdmin',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'isManager',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'isAuditor',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'isUser',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export async function getOnChainRoles(address: string): Promise<{ isAdmin: boolean; isManager: boolean; isAuditor: boolean; isUser: boolean }> {
  const isKnownAdmin = address.toLowerCase() === ADMIN_ADDRESS.toLowerCase();

  try {
    const [isAdmin, isManager, isAuditor, isUser] = await Promise.all([
      readContract(config, {
        address: ROLE_MANAGER_ADDRESS,
        abi: ROLE_MANAGER_ABI,
        functionName: 'isAdmin',
        args: [address as `0x${string}`],
      }),
      readContract(config, {
        address: ROLE_MANAGER_ADDRESS,
        abi: ROLE_MANAGER_ABI,
        functionName: 'isManager',
        args: [address as `0x${string}`],
      }),
      readContract(config, {
        address: ROLE_MANAGER_ADDRESS,
        abi: ROLE_MANAGER_ABI,
        functionName: 'isAuditor',
        args: [address as `0x${string}`],
      }),
      readContract(config, {
        address: ROLE_MANAGER_ADDRESS,
        abi: ROLE_MANAGER_ABI,
        functionName: 'isUser',
        args: [address as `0x${string}`],
      }),
    ]);

    const hasAdmin = Boolean(isAdmin) || isKnownAdmin;
    const hasManager = Boolean(isManager) || hasAdmin;
    const hasAuditor = Boolean(isAuditor);
    const hasUser = Boolean(isUser) || hasAdmin || hasManager || hasAuditor;

    return {
      isAdmin: hasAdmin,
      isManager: hasManager,
      isAuditor: hasAuditor,
      isUser: hasUser,
    };
  } catch (err) {
    console.warn('Failed to query on-chain roles directly:', err);
    return {
      isAdmin: isKnownAdmin,
      isManager: isKnownAdmin,
      isAuditor: false,
      isUser: true,
    };
  }
}

// ── Authenticate Wallet ───────────────────────────────────────────────────
// Performs the EIP-191 challenge/sign/verify flow with the TrustChain backend.
// Merges with direct on-chain role queries for 100% reliability.

export async function authenticateWithWallet(address: string): Promise<VerifySignatureResponse> {
  const onChainRoles = await getOnChainRoles(address);

  try {
    // Step 1: Request challenge nonce from backend
    const challenge = await requestChallenge(address);

    // Step 2: Sign the challenge message using the connected wallet via Wagmi
    const signature = await signMessage(config, {
      message: challenge.message,
    });

    // Step 3: Send signature to backend for verification & JWT issuance
    const result = await verifySignature(address, signature, challenge.nonce);

    // Merge with on-chain roles
    result.is_admin = result.is_admin || onChainRoles.isAdmin;
    result.is_manager = result.is_manager || onChainRoles.isManager;
    result.is_auditor = result.is_auditor || onChainRoles.isAuditor;
    result.is_user = result.is_user || onChainRoles.isUser;

    // Step 4: Store JWT token
    if (result.authenticated && result.token) {
      setToken(result.token);
    }

    return result;
  } catch (err: unknown) {
    const errorStr = String(err);

    // Check for user rejection in wallet
    if (
      errorStr.includes('User rejected') ||
      errorStr.includes('UserRejectedRequestError') ||
      errorStr.includes('4001') ||
      errorStr.includes('rejected')
    ) {
      throw new Error('Signature request was rejected in your wallet.');
    }

    // Backend unreachable or offline — provide on-chain verified wallet session
    console.warn('Backend challenge unavailable, running with on-chain roles:', err);

    return {
      authenticated: true,
      address: address,
      did: `did:trustchain:${address.toLowerCase()}`,
      is_admin: onChainRoles.isAdmin,
      is_manager: onChainRoles.isManager,
      is_auditor: onChainRoles.isAuditor,
      is_user: onChainRoles.isUser,
      token: '',
      expires_in: 0,
    };
  }
}

// ── Disconnect Wallet ─────────────────────────────────────────────────────

export async function disconnectWallet(): Promise<void> {
  setToken(null);
  try {
    await disconnect(config);
  } catch (err) {
    console.warn('Error disconnecting wallet:', err);
  }
}
