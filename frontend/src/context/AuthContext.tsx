/* ═══════════════════════════════════════════════════════════════════════════
   TrustChain — Auth Context
   RainbowKit & Wagmi powered authentication state provider
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import {
  useConnectModal,
  useAccountModal,
  useChainModal,
} from '@rainbow-me/rainbowkit';
import type { AuthState } from '../types';
import {
  authenticateWithWallet,
  disconnectWallet,
  getOnChainRoles,
  ADMIN_ADDRESS,
} from '../services/auth';
import { setToken, getToken } from '../services/api';

export interface AuthContextType extends AuthState {
  login: () => Promise<void>;
  logout: () => void;
  openWalletModal: () => void;
  openAccountModal?: () => void;
  openChainModal?: () => void;
  /** Sign an arbitrary message with the connected wallet (EIP-191 personal_sign) */
  signMessage: (message: string) => Promise<string>;
  loading: boolean;
  error: string | null;
  isConnected: boolean;
}

const initialState: AuthState = {
  isAuthenticated: false,
  address: null,
  did: null,
  isAdmin: false,
  isManager: false,
  isAuditor: false,
  isUser: false,
  token: null,
};

const AuthContext = createContext<AuthContextType>({
  ...initialState,
  login: async () => {},
  logout: () => {},
  openWalletModal: () => {},
  signMessage: async () => { throw new Error('Not connected'); },
  loading: false,
  error: null,
  isConnected: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { address: wagmiAddress, isConnected, status } = useAccount();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();
  const { openChainModal } = useChainModal();

  const [state, setState] = useState<AuthState>(initialState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the address we last authenticated for to prevent infinite loops
  const lastAuthenticatedAddress = useRef<string | null>(null);

  // ── Perform Authentication for a specific address ──────────────────────
  const handleAuthenticate = useCallback(async (addr: string) => {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      // Check if we already have a valid session in localStorage for THIS exact address
      const savedAddress = localStorage.getItem('trustchain_address');
      const savedToken = getToken();
      const savedRoles = localStorage.getItem('trustchain_roles');
      const isKnownAdmin = addr.toLowerCase() === ADMIN_ADDRESS.toLowerCase();

      if (
        savedToken &&
        savedAddress &&
        savedAddress.toLowerCase() === addr.toLowerCase()
      ) {
        let roles = { isAdmin: false, isManager: false, isAuditor: false, isUser: false };
        try {
          roles = JSON.parse(savedRoles || '{}');
        } catch {}

        const isAdmin = roles.isAdmin || isKnownAdmin;
        const isManager = roles.isManager || isKnownAdmin;
        const isAuditor = roles.isAuditor || false;
        const isUser = roles.isUser || true;

        const savedDid = localStorage.getItem('trustchain_did') || `did:trustchain:${addr.toLowerCase()}`;
        setState({
          isAuthenticated: true,
          address: addr,
          did: savedDid,
          isAdmin,
          isManager,
          isAuditor,
          isUser,
          token: savedToken,
        });
        lastAuthenticatedAddress.current = addr.toLowerCase();
        setLoading(false);

        // Always re-verify roles on-chain in background to keep state accurate and fresh
        getOnChainRoles(addr).then((onChain) => {
          setState((prev) => ({
            ...prev,
            isAdmin: onChain.isAdmin || isKnownAdmin,
            isManager: onChain.isManager || isKnownAdmin,
            isAuditor: onChain.isAuditor,
            isUser: onChain.isUser,
          }));
          localStorage.setItem(
            'trustchain_roles',
            JSON.stringify({
              isAdmin: onChain.isAdmin || isKnownAdmin,
              isManager: onChain.isManager || isKnownAdmin,
              isAuditor: onChain.isAuditor,
              isUser: onChain.isUser,
            })
          );
        }).catch(() => {});

        return;
      }

      // Fresh connection or switched account — authenticate with wallet
      const result = await authenticateWithWallet(addr);
      const isAdmin = result.is_admin || isKnownAdmin;
      const isManager = result.is_manager || isKnownAdmin;
      const isAuditor = result.is_auditor;
      const isUser = result.is_user;

      const newState: AuthState = {
        isAuthenticated: true,
        address: result.address,
        did: result.did,
        isAdmin,
        isManager,
        isAuditor,
        isUser,
        token: result.token,
      };

      // Persist to localStorage
      localStorage.setItem('trustchain_address', result.address);
      localStorage.setItem('trustchain_did', result.did);
      localStorage.setItem(
        'trustchain_roles',
        JSON.stringify({
          isAdmin,
          isManager,
          isAuditor,
          isUser,
        })
      );

      lastAuthenticatedAddress.current = addr.toLowerCase();
      setState(newState);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      setError(message);
      console.error('Wallet authentication failed:', err);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  // ── Synchronize with Wagmi account changes ─────────────────────────────
  useEffect(() => {
    if (!isConnected || !wagmiAddress) {
      // User disconnected or no wallet
      if (state.isAuthenticated || state.address) {
        setState(initialState);
        lastAuthenticatedAddress.current = null;
        localStorage.removeItem('trustchain_address');
        localStorage.removeItem('trustchain_did');
        localStorage.removeItem('trustchain_roles');
        setToken(null);
      }
      return;
    }

    const currentAddr = wagmiAddress.toLowerCase();

    // If the address is different from what was previously authenticated
    // or if the admin address is currently misclassified as non-admin
    if (
      lastAuthenticatedAddress.current !== currentAddr ||
      (currentAddr === ADMIN_ADDRESS.toLowerCase() && !state.isAdmin)
    ) {
      handleAuthenticate(wagmiAddress);
    }
  }, [isConnected, wagmiAddress, state.isAuthenticated, state.address, state.isAdmin, handleAuthenticate]);

  // ── Login trigger ───────────────────────────────────────────────────────
  const handleLogin = useCallback(async () => {
    setError(null);

    if (!isConnected) {
      if (openConnectModal) {
        openConnectModal();
      } else {
        setError('Wallet connection modal is not available.');
      }
      return;
    }

    if (wagmiAddress) {
      await handleAuthenticate(wagmiAddress);
    }
  }, [isConnected, openConnectModal, wagmiAddress, handleAuthenticate]);

  // ── Logout ──────────────────────────────────────────────────────────────
  const handleLogout = useCallback(() => {
    disconnectWallet();
    wagmiDisconnect();
    localStorage.removeItem('trustchain_address');
    localStorage.removeItem('trustchain_did');
    localStorage.removeItem('trustchain_roles');
    lastAuthenticatedAddress.current = null;
    setState(initialState);
    setError(null);
  }, [wagmiDisconnect]);

  // ── Sign Message (EIP-191 personal_sign) ────────────────────────────────
  const handleSignMessage = useCallback(async (message: string): Promise<string> => {
    if (!wagmiAddress) throw new Error('No wallet connected');
    const win = window as unknown as { ethereum?: { request: (a: { method: string; params: unknown[] }) => Promise<string> } };
    if (!win.ethereum) throw new Error('MetaMask not available');
    const signature = await win.ethereum.request({
      method: 'personal_sign',
      params: [message, wagmiAddress],
    });
    return signature;
  }, [wagmiAddress]);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login: handleLogin,
        logout: handleLogout,
        signMessage: handleSignMessage,
        openWalletModal: openConnectModal || (() => {}),
        openAccountModal,
        openChainModal,
        loading: loading || status === 'connecting' || status === 'reconnecting',
        error,
        isConnected,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
