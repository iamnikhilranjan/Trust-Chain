/* ═══════════════════════════════════════════════════════════════════════════
   HomePage — BEL-style landing page
   Hero Carousel, Flash News, About, Features, Recent Activity, Stats
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield,
  Users,
  FileCheck,
  Blocks,
  Zap,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Lock,
  Eye,
} from 'lucide-react';
import { getAuditSummary, getEvents } from '../services/api';
import type { AuditSummary, AuditEvent } from '../types';
import './HomePage.css';

// ── Hero Slides ───────────────────────────────────────────────────────────

const heroSlides = [
  {
    title: 'Guardians of Trust',
    subtitle: 'Decentralized Identity on Ethereum',
    description:
      'Self-sovereign W3C DIDs with tamper-proof blockchain verification',
    gradient: 'linear-gradient(135deg, #1a237e 0%, #283593 30%, #3949ab 60%, #1565c0 100%)',
    icon: Shield,
  },
  {
    title: 'Zero-Trust Verification',
    subtitle: 'Cryptographic Proof Engine',
    description:
      'ERC-721 NFT credentials with Keccak-256 hash anchoring & public QR verification',
    gradient: 'linear-gradient(135deg, #0d47a1 0%, #1565c0 30%, #1976d2 60%, #1e88e5 100%)',
    icon: Lock,
  },
  {
    title: 'Immutable Audit Trail',
    subtitle: 'Complete Asset Lifecycle Tracking',
    description:
      'Every issuance, transfer, and revocation recorded on-chain forever',
    gradient: 'linear-gradient(135deg, #004d40 0%, #00695c 30%, #00796b 60%, #00897b 100%)',
    icon: Eye,
  },
];

// ── Feature Cards ─────────────────────────────────────────────────────────

const features = [
  {
    icon: Shield,
    title: 'DID Registry',
    description: 'Self-sovereign W3C Decentralized Identifiers with controller rotation',
    color: '#3a7bd5',
  },
  {
    icon: Users,
    title: 'On-Chain RBAC',
    description: 'Admin, Manager, Auditor roles enforced in Solidity smart contracts',
    color: '#2e7d32',
  },
  {
    icon: FileCheck,
    title: 'Asset NFTs',
    description: 'ERC-721 verifiable digital asset NFTs with Keccak-256 hash anchoring',
    color: '#c62828',
  },
  {
    icon: Blocks,
    title: 'Schema Registry',
    description: 'W3C schema definitions for certificates, licenses, and land titles',
    color: '#e65100',
  },
  {
    icon: Zap,
    title: 'Account Abstraction',
    description: 'ERC-4337 Smart Accounts with gasless Paymaster sponsorship',
    color: '#6a1b9a',
  },
];

export default function HomePage() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [animatedStats, setAnimatedStats] = useState({
    assets: 0,
    schemas: 0,
    issuances: 0,
    transfers: 0,
  });

  // ── Auto-slide carousel ───────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const prevSlide = () =>
    setCurrentSlide((prev) => (prev - 1 + heroSlides.length) % heroSlides.length);
  const nextSlide = () =>
    setCurrentSlide((prev) => (prev + 1) % heroSlides.length);

  // ── Fetch data ────────────────────────────────────────────────────────
  useEffect(() => {
    getAuditSummary()
      .then(setSummary)
      .catch(() => {
        // Use mock data if backend unavailable
        setSummary({
          chain_id: 11155111,
          role_manager: '0xE1042c9Ba98BD841C363262b74F138545760F78D',
          identity_registry: '0x1f7521c73fA6Ed8F1D062cC348995D780134b75D',
          schema_registry: '0xE31Afcd77352eF8f8b6CE70E8FE9f5c5C5af46dF',
          asset_nft: '0x260B356FEC314f4EEF2e57734E2e468d90A7521E',
          asset_registry: '0x6B1DA7720651B20C8Fc8BE5d845Ac8D645C9713A',
          paymaster: '0xc5e88B4218069E95a22f41d09960f72e17618800',
          total_assets: 12,
          total_schemas: 5,
          indexed_assets: 12,
          indexed_schemas: 5,
          total_issuances: 15,
          total_transfers: 3,
          total_revocations: 1,
        });
      });

    getEvents(undefined, 10)
      .then(setEvents)
      .catch(() =>
        setEvents([
          { blockNumber: 7234567, transactionHash: '0xabc123...def456', eventName: 'AssetIssued', timestamp: new Date().toISOString() },
          { blockNumber: 7234565, transactionHash: '0x789abc...123def', eventName: 'DIDRegistered', timestamp: new Date().toISOString() },
          { blockNumber: 7234560, transactionHash: '0xdef789...abc456', eventName: 'SchemaRegistered', timestamp: new Date().toISOString() },
        ])
      );
  }, []);

  // ── Animate stats counters ────────────────────────────────────────────
  useEffect(() => {
    if (!summary) return;

    const targets = {
      assets: summary.total_assets,
      schemas: summary.total_schemas,
      issuances: summary.total_issuances,
      transfers: summary.total_transfers,
    };

    const duration = 1500;
    const steps = 40;
    const interval = duration / steps;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      const progress = Math.min(step / steps, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic

      setAnimatedStats({
        assets: Math.round(targets.assets * eased),
        schemas: Math.round(targets.schemas * eased),
        issuances: Math.round(targets.issuances * eased),
        transfers: Math.round(targets.transfers * eased),
      });

      if (step >= steps) clearInterval(timer);
    }, interval);

    return () => clearInterval(timer);
  }, [summary]);

  const formatEventName = (name?: string) => {
    if (!name) return 'Event';
    return name.replace(/([A-Z])/g, ' $1').trim();
  };

  return (
    <div className="home-page">
      {/* ═══ Hero Carousel ═══════════════════════════════════════════════ */}
      <section className="hero-carousel" aria-label="Hero carousel">
        <div className="hero-slides">
          {heroSlides.map((slide, idx) => {
            const IconComponent = slide.icon;
            return (
              <div
                key={idx}
                className={`hero-slide ${idx === currentSlide ? 'active' : ''}`}
                style={{ background: slide.gradient }}
              >
                <div className="hero-slide-content container-wide">
                  <div className="hero-text">
                    <h2 className="hero-title">{slide.title}</h2>
                    <p className="hero-subtitle">{slide.subtitle}</p>
                    <p className="hero-description">{slide.description}</p>
                    <div className="hero-actions">
                      <Link to="/dashboard" className="btn btn-gold btn-lg">
                        Get Started <ArrowRight size={18} />
                      </Link>
                      <Link to="/verify" className="btn btn-secondary btn-lg" style={{ borderColor: 'rgba(255,255,255,0.5)', color: 'white' }}>
                        Verify Credential
                      </Link>
                    </div>
                  </div>
                  <div className="hero-visual">
                    <div className="hero-icon-wrapper">
                      <IconComponent size={120} strokeWidth={1} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button className="hero-nav hero-nav-prev" onClick={prevSlide} aria-label="Previous slide">
          <ChevronLeft size={32} />
        </button>
        <button className="hero-nav hero-nav-next" onClick={nextSlide} aria-label="Next slide">
          <ChevronRight size={32} />
        </button>

        <div className="hero-dots">
          {heroSlides.map((_, idx) => (
            <button
              key={idx}
              className={`hero-dot ${idx === currentSlide ? 'active' : ''}`}
              onClick={() => setCurrentSlide(idx)}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
      </section>

      {/* ═══ Recent Activity Ticker ══════════════════════════════════════ */}
      <section className="flash-news" aria-label="Recent activity">
        <div className="flash-news-label">
          <TrendingUp size={14} /> Recent Activity
        </div>
        <div className="flash-news-ticker">
          <div className="flash-news-track">
            {events.length > 0 ? (
              <>
                {[...events, ...events].map((evt, i) => (
                  <span key={i} className="flash-news-item">
                    <span className="flash-news-badge">{formatEventName(evt.eventName)}</span>
                    Block #{evt.blockNumber} — {evt.transactionHash?.slice(0, 12)}...
                    {i < events.length * 2 - 1 && <span className="flash-news-sep">•</span>}
                  </span>
                ))}
              </>
            ) : (
              <span className="flash-news-item">
                TrustChain Platform — Decentralized Identity & Digital Asset Management on Ethereum Sepolia
              </span>
            )}
          </div>
        </div>
      </section>

      {/* ═══ About TrustChain ═══════════════════════════════════════════ */}
      <section className="section" id="about">
        <div className="container">
          <div className="about-grid">
            <div className="about-visual">
              <div className="about-video-placeholder">
                <div className="about-video-inner">
                  <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                    <circle cx="40" cy="40" r="38" stroke="var(--primary-500)" strokeWidth="3" fill="var(--primary-50)" />
                    <polygon points="32,24 60,40 32,56" fill="var(--primary-600)" />
                  </svg>
                  <p className="about-video-text">Platform Demo</p>
                  <p className="about-video-duration">▶ 0:00 / 1:04</p>
                </div>
              </div>
            </div>
            <div className="about-content">
              <h2 className="section-title" style={{ textAlign: 'left' }}>
                About TrustChain
              </h2>
              <p>
                TrustChain is a unified, tamper-proof blockchain architecture integrating
                Self-Sovereign Decentralized Identifiers (W3C DIDs), On-Chain Role-Based
                Access Control (RBAC) enforced in Solidity, and ERC-721 Verifiable Digital
                Asset NFTs with anchored Keccak-256 hashes.
              </p>
              <p>
                The platform also features a Rust + Axum Event Indexer & Cryptographic
                Proof Engine, ERC-4337 Account Abstraction with Gasless Paymaster
                Sponsorship, and Zero-Authentication Public QR & Credential Proof
                Verification — all deployed on Ethereum Sepolia testnet.
              </p>
              <p>
                Built for Smart India Hackathon 2026 (SIH26125), TrustChain solves
                critical vulnerabilities in centralized identity and access management
                systems, including single points of failure, data breaches, identity
                theft, and untraceable digital asset ownership.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Core Features (Dark Section) ═══════════════════════════════ */}
      <section className="section section-dark features-section" id="features">
        <div className="container">
          <h2 className="section-title section-title-light">Our Expertise</h2>
          <div className="features-grid">
            {features.map((feature) => {
              const IconComp = feature.icon;
              return (
                <div key={feature.title} className="feature-card">
                  <div className="feature-card-image" style={{ background: `linear-gradient(135deg, ${feature.color}22, ${feature.color}44)` }}>
                    <IconComp size={48} color={feature.color} strokeWidth={1.5} />
                  </div>
                  <div className="feature-card-label">
                    {feature.title}
                  </div>
                  <p className="feature-card-desc">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ Stats Counter ══════════════════════════════════════════════ */}
      <section className="section stats-section">
        <div className="container">
          <h2 className="section-title">Platform Statistics</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">
                <FileCheck size={28} color="var(--primary-600)" />
              </div>
              <div className="stat-number">{animatedStats.assets}</div>
              <div className="stat-label">Total Assets</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <Blocks size={28} color="var(--primary-600)" />
              </div>
              <div className="stat-number">{animatedStats.schemas}</div>
              <div className="stat-label">Registered Schemas</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <TrendingUp size={28} color="var(--success)" />
              </div>
              <div className="stat-number">{animatedStats.issuances}</div>
              <div className="stat-label">Total Issuances</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <ArrowRight size={28} color="var(--info)" />
              </div>
              <div className="stat-number">{animatedStats.transfers}</div>
              <div className="stat-label">Total Transfers</div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Recent Activity ════════════════════════════════════════════ */}
      <section className="section section-alt">
        <div className="container">
          <h2 className="section-title">Latest Activity</h2>
          <div className="activity-grid">
            {events.slice(0, 6).map((evt, idx) => (
              <div key={idx} className="activity-card card">
                <div className="activity-card-header">
                  <span className={`activity-badge activity-badge-${(evt.eventName || '').toLowerCase()}`}>
                    {formatEventName(evt.eventName)}
                  </span>
                  <span className="activity-block">Block #{evt.blockNumber}</span>
                </div>
                <div className="activity-card-body">
                  <p className="activity-tx mono">
                    {evt.transactionHash?.slice(0, 20)}...
                  </p>
                  {evt.timestamp && (
                    <p className="activity-time">
                      {new Date(evt.timestamp).toLocaleString()}
                    </p>
                  )}
                </div>
                <Link
                  to="/audit"
                  className="activity-link"
                >
                  View in Audit Trail →
                </Link>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 'var(--space-8)' }}>
            <Link to="/audit" className="btn btn-primary">
              View All Events <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
