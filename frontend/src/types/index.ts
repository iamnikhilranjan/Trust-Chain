/* ═══════════════════════════════════════════════════════════════════════════
   TrustChain — TypeScript Interfaces
   Mirrors the Rust backend models (backend/src/models/mod.rs)
   ═══════════════════════════════════════════════════════════════════════════ */

// ── Auth ──────────────────────────────────────────────────────────────────

export interface ChallengeRequest {
  address: string;
}

export interface ChallengeResponse {
  address: string;
  nonce: string;
  message: string;
}

export interface VerifySignatureRequest {
  address: string;
  signature: string;
  nonce: string;
}

export interface VerifySignatureResponse {
  authenticated: boolean;
  address: string;
  did: string;
  is_admin: boolean;
  is_manager: boolean;
  is_auditor: boolean;
  is_user: boolean;
  token: string;
  expires_in: number;
}

// ── Identity ──────────────────────────────────────────────────────────────

export interface IdentityRecord {
  did: string;
  controller: string;
  status: string;
  public_key: string;
  metadata_uri: string;
  is_active: boolean;
}

export interface MyIdentityResponse {
  found: boolean;
  identity: IdentityRecord | null;
  roles: {
    isAdmin: boolean;
    isManager: boolean;
    isAuditor: boolean;
    isUser: boolean;
  };
}

// ── Schemas ───────────────────────────────────────────────────────────────

export interface SchemaRecord {
  schema_id: string;
  name: string;
  schema_uri: string;
  schema_hash: string;
  version: string;
  author: string;
  is_active: boolean;
}

// ── Assets ────────────────────────────────────────────────────────────────

export interface AssetRecord {
  token_id: number;
  recipient: string;
  owner_did: string;
  issuer_did: string;
  asset_type: string;
  schema_id: string;
  credential_hash: string;
  metadata_uri: string;
  issued_at: number;
  expires_at: number;
  status: string;
  is_transferable: boolean;
  nft_owner: string;
}

export interface VerifyAssetPayload {
  token_id: number;
  credential_hash: string;
}

export interface VerifyAssetResult {
  is_valid: boolean;
  is_hash_match: boolean;
  is_status_active: boolean;
  is_not_expired: boolean;
  is_owner_verified: boolean;
  owner_did: string;
  issuer_did: string;
  status: string;
}

// ── Write Requests ────────────────────────────────────────────────────────

export interface RegisterIdentityRequest {
  did: string;
  controller: string;
  metadata_uri?: string;
  public_key?: string;
}

export interface RegisterSchemaRequest {
  schema_id: string;
  name: string;
  schema_uri: string;
  version: string;
  schema_hash?: string;
}

export interface IssueAssetRequest {
  owner_did: string;
  schema_id: string;
  asset_type: string;
  credential_hash: string;
  metadata_uri: string;
  is_transferable: boolean;
  expires_at: number;
}

export interface TransferAssetRequest {
  to_did: string;
}

export interface RevokeAssetRequest {
  reason: string;
}

export interface UpdateAssetStatusRequest {
  status: number;
  reason: string;
}

export interface TxResponse {
  success: boolean;
  tx_hash: string;
  message: string;
}

// ── Metadata ──────────────────────────────────────────────────────────────

export interface MetadataUploadRequest {
  data: Record<string, unknown>;
  doc_type?: string;
}

export interface MetadataUploadResponse {
  id: string;
  uri: string;
}

// ── Audit ─────────────────────────────────────────────────────────────────

export interface AuditSummary {
  chain_id: number;
  role_manager: string;
  identity_registry: string;
  schema_registry: string;
  asset_nft: string;
  asset_registry: string;
  paymaster: string;
  total_assets: number;
  total_schemas: number;
  indexed_assets: number;
  indexed_schemas: number;
  total_issuances: number;
  total_transfers: number;
  total_revocations: number;
}

export interface AuditEvent {
  id?: number;
  contractAddress?: string;
  eventName?: string;
  blockNumber: number;
  transactionHash: string;
  logIndex?: number;
  timestamp?: string;
  data?: Record<string, unknown>;
  indexedAt?: string;
}

// ── Health ─────────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  service: string;
  network: string;
  chain_id: number;
  db: string;
  rpc_latency_ms: number;
}

// ── Auth Context ──────────────────────────────────────────────────────────

export interface AuthState {
  isAuthenticated: boolean;
  address: string | null;
  did: string | null;
  isAdmin: boolean;
  isManager: boolean;
  isAuditor: boolean;
  isUser: boolean;
  token: string | null;
}

// ── Verifiable Presentations ─────────────────────────────────────────────────

export interface CreateVpRequest {
  token_id: number;
  expiry_hours?: number;
  expires_at?: number;
  purpose: string;
  holder_signature: string;
  holder_address: string;
}

export interface CreateVpResponse {
  vp_id: string;
  vp_token: string;
  shareable_url: string;
  expires_at: number;
  purpose: string;
}

export interface VerifyVpRequest {
  vp_token: string;
}

export interface VpChecks {
  token_integrity: boolean;
  holder_signature_valid: boolean;
  controller_match: boolean;
  not_expired: boolean;
  credential_active: boolean;
  not_revoked: boolean;
}

export interface VpCredentialDetails {
  token_id: number;
  owner_did: string;
  issuer_did: string;
  asset_type: string;
  schema_id: string;
  metadata_uri: string;
  issued_at: number;
  expires_at: number;
  status: string;
  holder_address: string;
  holder_did: string;
  purpose: string;
  vp_issued_at: number;
  vp_expires_at: number;
}

export interface VerifyVpResult {
  is_valid: boolean;
  checks: VpChecks;
  credential: VpCredentialDetails | null;
  failure_reason: string | null;
}
