use serde::{Deserialize, Serialize};

// ── JWT ───────────────────────────────────────────────────────────────────────

/// JWT payload — embedded in the signed token
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JwtClaims {
    /// Subject = wallet address (lowercase)
    pub sub: String,
    /// Resolved DID for this wallet
    pub did: String,
    pub is_admin: bool,
    pub is_manager: bool,
    pub is_auditor: bool,
    /// Issued-at (Unix timestamp)
    pub iat: u64,
    /// Expiry (Unix timestamp)
    pub exp: u64,
}

// ── Auth ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub service: String,
    pub network: String,
    pub chain_id: u64,
    pub db: String,
    pub rpc_latency_ms: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChallengeRequest {
    pub address: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChallengeResponse {
    pub address: String,
    pub nonce: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VerifySignatureRequest {
    pub address: String,
    pub signature: String,
    pub nonce: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VerifySignatureResponse {
    pub authenticated: bool,
    pub address: String,
    pub did: String,
    pub is_admin: bool,
    pub is_manager: bool,
    pub is_auditor: bool,
    /// JWT bearer token — use as `Authorization: Bearer <token>`
    pub token: String,
    pub expires_in: u64,
}

// ── Identity ──────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct IdentityRecord {
    pub did: String,
    pub controller: String,
    pub status: String,
    pub public_key: String,
    pub metadata_uri: String,
    pub is_active: bool,
    #[serde(default)]
    pub pending_controller: String,
}

// ── Schemas ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct SchemaRecord {
    pub schema_id: String,
    pub name: String,
    pub schema_uri: String,
    pub schema_hash: String,
    pub version: String,
    pub author: String,
    pub is_active: bool,
}

// ── Assets ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct AssetRecord {
    pub token_id: u64,
    pub recipient: String,
    pub owner_did: String,
    pub issuer_did: String,
    pub asset_type: String,
    pub schema_id: String,
    pub credential_hash: String,
    pub metadata_uri: String,
    pub issued_at: u64,
    pub expires_at: u64,
    pub status: String,
    pub is_transferable: bool,
    pub nft_owner: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VerifyAssetPayload {
    pub token_id: u64,
    pub credential_hash: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VerifyAssetResult {
    pub is_valid: bool,
    pub is_hash_match: bool,
    pub is_status_active: bool,
    pub is_not_expired: bool,
    pub is_owner_verified: bool,
    pub owner_did: String,
    pub issuer_did: String,
    pub status: String,
}

// ── Write Request Models (Phase 10) ──────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct RegisterIdentityRequest {
    pub did: String,
    #[serde(default)]
    pub controller: Option<String>,
    pub metadata_uri: Option<String>,
    pub public_key: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProposeControllerRequest {
    pub did: String,
    pub new_controller: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AcceptControllerRequest {
    pub did: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RegisterSchemaRequest {
    pub schema_id: String,
    pub name: String,
    pub schema_uri: String,
    pub version: String,
    /// Hex-encoded keccak256 of schema JSON — backend computes if omitted
    pub schema_hash: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IssueAssetRequest {
    pub owner_did: String,
    pub schema_id: String,
    pub asset_type: String,
    pub credential_hash: String,
    pub metadata_uri: String,
    pub is_transferable: bool,
    pub expires_at: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TransferAssetRequest {
    pub to_did: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RevokeAssetRequest {
    pub reason: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateAssetStatusRequest {
    pub status: u8,
    pub reason: String,
}

/// Returned for every write operation
#[derive(Debug, Serialize, Deserialize)]
pub struct TxResponse {
    pub success: bool,
    pub tx_hash: String,
    pub message: String,
}

// ── Metadata (Phase 11 — Mock IPFS) ──────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct MetadataUploadRequest {
    pub data: serde_json::Value,
    pub doc_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MetadataUploadResponse {
    pub id: String,
    pub uri: String, // "ipfs://mock/<uuid>"
}

// ── Audit ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct AuditSummary {
    pub chain_id: u64,
    pub role_manager: String,
    pub identity_registry: String,
    pub schema_registry: String,
    pub asset_nft: String,
    pub asset_registry: String,
    pub paymaster: String,
    pub total_assets: u64,
    pub total_schemas: usize,
    pub indexed_assets: u64,
    pub indexed_schemas: u64,
    pub total_issuances: u64,
    pub total_transfers: u64,
    pub total_revocations: u64,
}

// ── Verifiable Presentation (Phase VP) ───────────────────────────────────────

/// Request body for creating a VP
/// The holder signs the canonical VP message with their wallet before sending.
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateVpRequest {
    /// Which asset token to present
    pub token_id: u64,
    /// How many hours the VP should be valid (1–720)
    #[serde(default)]
    pub expiry_hours: Option<u64>,
    /// Explicit expiry timestamp (unix seconds) matching holder signature
    #[serde(default)]
    pub expires_at: Option<u64>,
    /// Human-readable purpose, e.g. "job_application", "background_check"
    pub purpose: String,
    /// EIP-191 signature of the canonical VP message (produced by MetaMask)
    pub holder_signature: String,
    /// Holder wallet address (lowercase 0x...)
    pub holder_address: String,
}

/// Returned after a VP is created
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateVpResponse {
    pub vp_id: String,
    /// The full signed JWT — share this with the verifier
    pub vp_token: String,
    /// Convenience URL: /verify/vp?token=<vp_token>
    pub shareable_url: String,
    pub expires_at: u64,
    pub purpose: String,
}

/// Request body for verifying a VP
#[derive(Debug, Serialize, Deserialize)]
pub struct VerifyVpRequest {
    pub vp_token: String,
}

/// Full VP verification result
#[derive(Debug, Serialize, Deserialize)]
pub struct VerifyVpResult {
    pub is_valid: bool,
    /// Checks breakdown
    pub checks: VpChecks,
    /// Credential details (from on-chain)
    pub credential: Option<VpCredentialDetails>,
    /// Human-readable failure reason if invalid
    pub failure_reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VpChecks {
    /// JWT signature by backend is intact
    pub token_integrity: bool,
    /// Holder's EIP-191 signature is valid
    pub holder_signature_valid: bool,
    /// Signing address matches the DID controller on-chain
    pub controller_match: bool,
    /// VP has not expired
    pub not_expired: bool,
    /// Credential still active on-chain (not revoked)
    pub credential_active: bool,
    /// VP has not been manually revoked by holder
    pub not_revoked: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VpCredentialDetails {
    pub token_id: u64,
    pub owner_did: String,
    pub issuer_did: String,
    pub asset_type: String,
    pub schema_id: String,
    pub metadata_uri: String,
    pub issued_at: u64,
    pub expires_at: u64,
    pub status: String,
    pub holder_address: String,
    pub holder_did: String,
    pub purpose: String,
    pub vp_issued_at: u64,
    pub vp_expires_at: u64,
}

/// JWT claims for the VP token (backend-signed)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VpTokenClaims {
    /// "verifiable_presentation"
    pub typ: String,
    pub vp_id: String,
    pub token_id: u64,
    pub credential_hash: String,
    pub holder_address: String,
    pub holder_did: String,
    pub purpose: String,
    pub holder_signature: String,
    /// issued-at (Unix)
    pub iat: u64,
    /// expiry (Unix)
    pub exp: u64,
}
