/* ═══════════════════════════════════════════════════════════════════════════
   Navbar — BEL-style blue horizontal navigation bar
   Mega-menu dropdowns, active states, RainbowKit Connect Wallet button
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Wallet, ChevronDown, Menu, X, AlertCircle } from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAuth } from '../../context/AuthContext';
import './Navbar.css';

interface NavItem {
  label: string;
  path?: string;
  children?: { label: string; path: string }[];
}

export default function Navbar() {
  const { logout, error: authError, isAdmin, isManager, isAuditor, isAuthenticated } = useAuth();
  const [connectError, setConnectError] = useState<string | null>(null);

  const identityChildren = [
    { label: 'Lookup DID', path: '/identity' },
    ...(isAdmin ? [{ label: 'Register Identity (Admin)', path: '/identity/register' }] : []),
  ];

  const assetsChildren = [
    { label: 'Browse Assets', path: '/assets' },
    ...(isManager || isAdmin ? [{ label: 'Issue Asset (Manager)', path: '/assets/issue' }] : []),
    { label: 'Share Credential (VP)', path: '/share' },
    { label: 'Verify Asset', path: '/verify' },
  ];

  const schemasChildren = [
    { label: 'Browse Schemas', path: '/schemas' },
    ...(isManager || isAdmin ? [{ label: 'Register Schema (Manager)', path: '/schemas/create' }] : []),
  ];

  const navItems: NavItem[] = [
    { label: 'Home', path: '/' },
    identityChildren.length > 1
      ? { label: 'Identity', children: identityChildren }
      : { label: 'Identity', path: '/identity' },
    {
      label: 'Assets',
      children: assetsChildren,
    },
    schemasChildren.length > 1
      ? { label: 'Schemas', children: schemasChildren }
      : { label: 'Schemas', path: '/schemas' },
    ...(isAuthenticated ? [{ label: 'Share', path: '/share' }] : []),
    { label: 'Verify', path: '/verify' },
    ...(isAdmin || isManager || isAuditor ? [{ label: 'Audit', path: '/audit' }] : []),
    ...(isAdmin ? [{ label: '⚙ Admin', path: '/admin' }] : []),
    { label: 'Dashboard', path: '/dashboard' },
  ];

  // Show auth errors
  useEffect(() => {
    if (authError) {
      setConnectError(authError);
      const timer = setTimeout(() => setConnectError(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [authError]);

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navRef = useRef<HTMLElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
    setOpenDropdown(null);
  }, [location.pathname]);

  const isActive = (path?: string) => {
    if (!path) return false;
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const truncateAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const getRoleBadge = () => {
    if (isAdmin) return 'Admin';
    if (isManager) return 'Manager';
    if (isAuditor) return 'Auditor';
    return 'User';
  };

  return (
    <nav className="navbar" ref={navRef} role="navigation" aria-label="Main navigation">
      <div className="navbar-inner container-wide">
        {/* Mobile toggle */}
        <button
          className="navbar-mobile-toggle"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle navigation menu"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>

        {/* Nav links */}
        <ul className={`navbar-menu ${mobileOpen ? 'navbar-menu-open' : ''}`}>
          {navItems.map((item) => (
            <li
              key={item.label}
              className={`navbar-item ${item.children ? 'has-dropdown' : ''} ${isActive(item.path) ? 'active' : ''
                }`}
              onMouseEnter={() => item.children && setOpenDropdown(item.label)}
              onMouseLeave={() => item.children && setOpenDropdown(null)}
            >
              {item.path ? (
                <Link to={item.path} className="navbar-link">
                  {item.label === 'Home' && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 4 }}>
                      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                    </svg>
                  )}
                  {item.label}
                </Link>
              ) : (
                <button
                  className="navbar-link navbar-dropdown-trigger"
                  onClick={() =>
                    setOpenDropdown(openDropdown === item.label ? null : item.label)
                  }
                >
                  {item.label}
                  <ChevronDown size={14} className="navbar-chevron" />
                </button>
              )}

              {/* Dropdown */}
              {item.children && openDropdown === item.label && (
                <ul className="navbar-dropdown">
                  {item.children.map((child) => (
                    <li key={child.path}>
                      <Link to={child.path} className="navbar-dropdown-link">
                        {child.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>

        {/* Wallet button with RainbowKit */}
        <div className="navbar-wallet">
          <ConnectButton.Custom>
            {({
              account,
              chain,
              openAccountModal,
              openChainModal,
              openConnectModal,
              mounted,
            }) => {
              const ready = mounted;
              const connected = ready && account && chain;

              return (
                <div
                  {...(!ready && {
                    'aria-hidden': true,
                    style: {
                      opacity: 0,
                      pointerEvents: 'none',
                      userSelect: 'none',
                    },
                  })}
                >
                  {(() => {
                    if (!connected) {
                      return (
                        <div className="navbar-connect-wrapper">
                          <button
                            className="navbar-connect-btn"
                            onClick={openConnectModal}
                            type="button"
                          >
                            <Wallet size={16} />
                            Connect Wallet
                          </button>
                          {connectError && (
                            <div className="navbar-connect-error">
                              <AlertCircle size={14} />
                              <span>{connectError}</span>
                              <button
                                onClick={() => setConnectError(null)}
                                className="navbar-error-close"
                                type="button"
                              >
                                ×
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    }

                    if (chain.unsupported) {
                      return (
                        <button
                          className="navbar-wrong-network-btn"
                          onClick={openChainModal}
                          type="button"
                        >
                          Wrong Network (Switch)
                        </button>
                      );
                    }

                    return (
                      <div className="navbar-wallet-info">
                        <button
                          className="navbar-chain-badge"
                          onClick={openChainModal}
                          type="button"
                          title="Switch Network"
                        >
                          {chain.name}
                        </button>
                        <span className="navbar-role-badge">{getRoleBadge()}</span>
                        <button
                          className="navbar-address-btn"
                          onClick={openAccountModal}
                          title="Account details & switch account"
                          type="button"
                        >
                          <span className="navbar-address">{truncateAddress(account.address)}</span>
                          <ChevronDown size={13} style={{ marginLeft: 4, opacity: 0.8 }} />
                        </button>
                        <button
                          className="navbar-logout-btn"
                          onClick={logout}
                          title="Disconnect wallet"
                          type="button"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })()}
                </div>
              );
            }}
          </ConnectButton.Custom>
        </div>
      </div>
    </nav>
  );
}
