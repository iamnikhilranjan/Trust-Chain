/// Phase 10 — Write API Routes (Backend Signing)
///
/// All write routes:
/// 1. Require valid JWT (via middleware extension)
/// 2. Check caller's role (Admin/Manager as required)
/// 3. Build + sign transaction using backend PRIVATE_KEY
/// 4. Broadcast to Sepolia and return tx hash

use alloy::{
    network::EthereumWallet,
    primitives::{Address, Bytes, FixedBytes, U256},
    providers::{Provider, ProviderBuilder},
    signers::local::PrivateKeySigner,
    sol,
};
use axum::{
    extract::{Path, State},
    Extension, Json,
};
use reqwest::Url;
use sha3::{Digest, Keccak256};

use crate::{
    error::AppError,
    middleware::auth::AuthenticatedUser,
    models::{
        AcceptControllerRequest, IssueAssetRequest, ProposeControllerRequest,
        RegisterIdentityRequest, RegisterSchemaRequest, RevokeAssetRequest,
        TransferAssetRequest, TxResponse, UpdateAssetStatusRequest,
    },
    AppState,
};

// ── Contract write ABIs ───────────────────────────────────────────────────────

sol! {
    #[sol(rpc)]
    interface IIdentityRegistryWrite {
        function registerIdentity(
            string calldata did,
            address controller,
            bytes calldata publicKey,
            string calldata metadataUri
        ) external;

        function proposeController(string calldata did, address newController) external;
        function acceptController(string calldata did) external;
    }

    #[sol(rpc)]
    interface ISchemaRegistryWrite {
        function registerSchema(
            string calldata schemaId,
            string calldata name,
            string calldata schemaUri,
            bytes32 schemaHash,
            string calldata version
        ) external;

        function setSchemaStatus(string calldata schemaId, bool isActive) external;
    }

    #[sol(rpc)]
    interface IAssetRegistryWrite {
        function issueAsset(
            address recipient,
            string calldata ownerDID,
            string calldata issuerDID,
            string calldata assetType,
            string calldata schemaId,
            bytes32 credentialHash,
            string calldata metadataUri,
            uint256 expiresAt,
            bool isTransferable
        ) external returns (uint256 tokenId);

        function transferAsset(
            uint256 tokenId,
            address to,
            string calldata newOwnerDID
        ) external;

        function revokeAsset(
            uint256 tokenId,
            string calldata reason
        ) external;

        function updateAssetStatus(
            uint256 tokenId,
            uint8 newStatus,
            string calldata reason
        ) external;

        function syncNFTOwner(uint256 tokenId) external;
    }
}

// ── Helper: build a signer provider ──────────────────────────────────────────

macro_rules! build_provider {
    ($state:expr) => {{
        if $state.config.private_key.is_empty() {
            return Err(AppError::Internal(
                "PRIVATE_KEY not configured — cannot sign transactions".to_string(),
            ));
        }

        let signer: PrivateKeySigner = $state.config.private_key
            .parse()
            .map_err(|e| AppError::Internal(format!("Invalid PRIVATE_KEY: {}", e)))?;

        let wallet = EthereumWallet::from(signer);

        let url: Url = $state.config.sepolia_rpc_url
            .parse()
            .map_err(|e| AppError::Internal(format!("Invalid RPC URL: {}", e)))?;

        ProviderBuilder::new()
            .with_recommended_fillers()
            .wallet(wallet)
            .on_http(url)
    }};
}

// ── Identity write routes ─────────────────────────────────────────────────────

/// POST /api/identity/register
/// Registers a new DID in the IdentityRegistry. Requires Admin role.
pub async fn register_identity(
    State(state): State<AppState>,
    Extension(user): Extension<AuthenticatedUser>,
    Json(payload): Json<RegisterIdentityRequest>,
) -> Result<Json<TxResponse>, AppError> {
    if !user.is_admin {
        return Err(AppError::Forbidden("Admin role required".to_string()));
    }

    if payload.did.trim().is_empty() {
        return Err(AppError::BadRequest("DID cannot be empty".to_string()));
    }

    let controller: Address = match payload.controller.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(addr_str) => addr_str
            .parse()
            .map_err(|_| AppError::BadRequest("Invalid controller address (must be a valid 0x Ethereum address)".to_string()))?,
        None => user
            .address
            .parse()
            .map_err(|_| AppError::BadRequest("Controller address is required".to_string()))?,
    };

    if controller == Address::ZERO {
        return Err(AppError::BadRequest("Controller address cannot be the zero address".to_string()));
    }

    let provider = build_provider!(state);

    let registry = IIdentityRegistryWrite::new(state.client.identity_registry_addr, &provider);

    let pub_key_bytes: Bytes = payload
        .public_key
        .as_deref()
        .map(|hex| hex.trim_start_matches("0x"))
        .and_then(|h| hex::decode(h).ok())
        .map(Bytes::from)
        .unwrap_or_default();

    let metadata_uri = payload.metadata_uri.unwrap_or_default();

    let receipt = registry
        .registerIdentity(payload.did.clone(), controller, pub_key_bytes, metadata_uri)
        .send()
        .await
        .map_err(|e| AppError::BlockchainError(format!("registerIdentity failed: {}", e)))?
        .get_receipt()
        .await
        .map_err(|e| AppError::BlockchainError(format!("Tx receipt failed: {}", e)))?;

    let tx_hash = format!("{:?}", receipt.transaction_hash);
    tracing::info!("DID registered: {} tx={}", payload.did, tx_hash);

    Ok(Json(TxResponse {
        success: true,
        tx_hash,
        message: format!("DID '{}' registered successfully", payload.did),
    }))
}

// ── Schema write routes ───────────────────────────────────────────────────────

/// POST /api/schemas/register
/// Registers a new schema. Requires Admin or Manager role.
pub async fn register_schema(
    State(state): State<AppState>,
    Extension(user): Extension<AuthenticatedUser>,
    Json(payload): Json<RegisterSchemaRequest>,
) -> Result<Json<TxResponse>, AppError> {
    if !user.is_admin && !user.is_manager {
        return Err(AppError::Forbidden("Admin or Manager role required".to_string()));
    }

    // Compute schema hash if not provided
    let schema_hash_bytes: FixedBytes<32> = if let Some(hex_hash) = &payload.schema_hash {
        let hex_clean = hex_hash.trim_start_matches("0x");
        let bytes = hex::decode(hex_clean)
            .map_err(|_| AppError::BadRequest("Invalid schema_hash hex".to_string()))?;
        FixedBytes::from_slice(&bytes)
    } else {
        // Compute keccak256 of the schema URI as a deterministic hash
        let mut hasher = Keccak256::new();
        hasher.update(payload.schema_uri.as_bytes());
        let result = hasher.finalize();
        FixedBytes::from_slice(&result)
    };

    let provider = build_provider!(state);
    let registry = ISchemaRegistryWrite::new(state.client.schema_registry_addr, &provider);

    let receipt = registry
        .registerSchema(
            payload.schema_id.clone(),
            payload.name,
            payload.schema_uri,
            schema_hash_bytes,
            payload.version,
        )
        .send()
        .await
        .map_err(|e| AppError::BlockchainError(format!("registerSchema failed: {}", e)))?
        .get_receipt()
        .await
        .map_err(|e| AppError::BlockchainError(format!("Tx receipt failed: {}", e)))?;

    let tx_hash = format!("{:?}", receipt.transaction_hash);
    tracing::info!("Schema registered: {} tx={}", payload.schema_id, tx_hash);

    Ok(Json(TxResponse {
        success: true,
        tx_hash,
        message: format!("Schema '{}' registered successfully", payload.schema_id),
    }))
}

// ── Asset write routes ────────────────────────────────────────────────────────

/// POST /api/assets/issue
/// Issues a new asset NFT. Requires Manager role.
pub async fn issue_asset(
    State(state): State<AppState>,
    Extension(user): Extension<AuthenticatedUser>,
    Json(payload): Json<IssueAssetRequest>,
) -> Result<Json<TxResponse>, AppError> {
    if !user.is_manager && !user.is_admin {
        return Err(AppError::Forbidden("Manager or Admin role required".to_string()));
    }

    let provider = build_provider!(state);
    let registry = IAssetRegistryWrite::new(state.client.asset_registry_addr, &provider);

    // Decode credential hash from hex
    let cred_hex = payload.credential_hash.trim_start_matches("0x");
    let cred_bytes = hex::decode(cred_hex)
        .map_err(|_| AppError::BadRequest("Invalid credential_hash hex".to_string()))?;
    if cred_bytes.len() != 32 {
        return Err(AppError::BadRequest("credential_hash must be exactly 32 bytes (64 hex characters)".to_string()));
    }
    let cred_hash: FixedBytes<32> = FixedBytes::from_slice(&cred_bytes);
    if cred_hash == FixedBytes::ZERO {
        return Err(AppError::BadRequest("credential_hash cannot be all zeros. Please provide a valid non-zero Keccak-256 hash.".to_string()));
    }

    // Resolve recipient controller from owner DID on-chain
    let owner_identity = state.client.get_identity(&payload.owner_did).await
        .map_err(|e| AppError::BadRequest(format!("Owner DID '{}' is not registered on-chain: {}", payload.owner_did, e)))?;
    let recipient: Address = owner_identity.controller.parse()
        .map_err(|_| AppError::BadRequest(format!("Invalid controller address '{}' for owner DID", owner_identity.controller)))?;

    // Issuer DID: user's DID or configured Admin DID
    let issuer_did = if !user.did.trim().is_empty() {
        user.did.clone()
    } else {
        "did:trustchain:0x2cb4f72907B1EC202a2f751Da0286aa9Ee2E3b33".to_string()
    };

    let expires_at = U256::from(payload.expires_at);

    let receipt = registry
        .issueAsset(
            recipient,
            payload.owner_did.clone(),
            issuer_did,
            payload.asset_type,
            payload.schema_id,
            cred_hash,
            payload.metadata_uri,
            expires_at,
            payload.is_transferable,
        )
        .send()
        .await
        .map_err(|e| AppError::BlockchainError(format!("issueAsset failed: {}", e)))?
        .get_receipt()
        .await
        .map_err(|e| AppError::BlockchainError(format!("Tx receipt failed: {}", e)))?;

    let tx_hash = format!("{:?}", receipt.transaction_hash);
    tracing::info!("Asset issued for {} tx={}", payload.owner_did, tx_hash);

    Ok(Json(TxResponse {
        success: true,
        tx_hash,
        message: format!("Asset issued to '{}' successfully", payload.owner_did),
    }))
}

/// POST /api/assets/:token_id/transfer
/// Transfers an asset to a new DID. Requires Manager or Admin.
pub async fn transfer_asset(
    State(state): State<AppState>,
    Extension(user): Extension<AuthenticatedUser>,
    Path(token_id): Path<u64>,
    Json(payload): Json<TransferAssetRequest>,
) -> Result<Json<TxResponse>, AppError> {
    if !user.is_manager && !user.is_admin {
        return Err(AppError::Forbidden("Manager or Admin role required".to_string()));
    }

    let provider = build_provider!(state);
    let registry = IAssetRegistryWrite::new(state.client.asset_registry_addr, &provider);

    let to_identity = state.client.get_identity(&payload.to_did).await
        .map_err(|e| AppError::BadRequest(format!("Recipient DID '{}' is not registered on-chain: {}", payload.to_did, e)))?;
    let to_addr: Address = to_identity.controller.parse()
        .map_err(|_| AppError::BadRequest(format!("Invalid controller address '{}' for recipient DID", to_identity.controller)))?;

    let receipt = registry
        .transferAsset(U256::from(token_id), to_addr, payload.to_did.clone())
        .send()
        .await
        .map_err(|e| AppError::BlockchainError(format!("transferAsset failed: {}", e)))?
        .get_receipt()
        .await
        .map_err(|e| AppError::BlockchainError(format!("Tx receipt failed: {}", e)))?;

    let tx_hash = format!("{:?}", receipt.transaction_hash);
    tracing::info!("Asset #{} transferred to {} tx={}", token_id, payload.to_did, tx_hash);

    Ok(Json(TxResponse {
        success: true,
        tx_hash,
        message: format!("Token #{} transferred to '{}'", token_id, payload.to_did),
    }))
}

/// POST /api/assets/:token_id/revoke
/// Revokes an asset. Requires Manager or Admin.
pub async fn revoke_asset(
    State(state): State<AppState>,
    Extension(user): Extension<AuthenticatedUser>,
    Path(token_id): Path<u64>,
    Json(payload): Json<RevokeAssetRequest>,
) -> Result<Json<TxResponse>, AppError> {
    if !user.is_manager && !user.is_admin {
        return Err(AppError::Forbidden("Manager or Admin role required".to_string()));
    }

    let provider = build_provider!(state);
    let registry = IAssetRegistryWrite::new(state.client.asset_registry_addr, &provider);

    let receipt = registry
        .revokeAsset(U256::from(token_id), payload.reason.clone())
        .send()
        .await
        .map_err(|e| AppError::BlockchainError(format!("revokeAsset failed: {}", e)))?
        .get_receipt()
        .await
        .map_err(|e| AppError::BlockchainError(format!("Tx receipt failed: {}", e)))?;

    let tx_hash = format!("{:?}", receipt.transaction_hash);
    tracing::info!("Asset #{} revoked tx={}", token_id, tx_hash);

    Ok(Json(TxResponse {
        success: true,
        tx_hash,
        message: format!("Token #{} revoked: {}", token_id, payload.reason),
    }))
}

/// POST /api/assets/:token_id/status
/// Updates asset status. Requires Manager or Admin.
pub async fn update_asset_status(
    State(state): State<AppState>,
    Extension(user): Extension<AuthenticatedUser>,
    Path(token_id): Path<u64>,
    Json(payload): Json<UpdateAssetStatusRequest>,
) -> Result<Json<TxResponse>, AppError> {
    if !user.is_manager && !user.is_admin {
        return Err(AppError::Forbidden("Manager or Admin role required".to_string()));
    }

    let provider = build_provider!(state);
    let registry = IAssetRegistryWrite::new(state.client.asset_registry_addr, &provider);

    let receipt = registry
        .updateAssetStatus(U256::from(token_id), payload.status, payload.reason.clone())
        .send()
        .await
        .map_err(|e| AppError::BlockchainError(format!("updateAssetStatus failed: {}", e)))?
        .get_receipt()
        .await
        .map_err(|e| AppError::BlockchainError(format!("Tx receipt failed: {}", e)))?;

    let tx_hash = format!("{:?}", receipt.transaction_hash);

    Ok(Json(TxResponse {
        success: true,
        tx_hash,
        message: format!("Token #{} status updated to {}", token_id, payload.status),
    }))
}

/// POST /api/assets/:token_id/sync-owner
/// Syncs NFT ownership after DID controller rotation. Requires Manager or Admin.
pub async fn sync_nft_owner(
    State(state): State<AppState>,
    Extension(user): Extension<AuthenticatedUser>,
    Path(token_id): Path<u64>,
) -> Result<Json<TxResponse>, AppError> {
    if !user.is_manager && !user.is_admin {
        return Err(AppError::Forbidden("Manager or Admin role required".to_string()));
    }

    let provider = build_provider!(state);
    let registry = IAssetRegistryWrite::new(state.client.asset_registry_addr, &provider);

    let receipt = registry
        .syncNFTOwner(U256::from(token_id))
        .send()
        .await
        .map_err(|e| AppError::BlockchainError(format!("syncNFTOwner failed: {}", e)))?
        .get_receipt()
        .await
        .map_err(|e| AppError::BlockchainError(format!("Tx receipt failed: {}", e)))?;

    let tx_hash = format!("{:?}", receipt.transaction_hash);

    Ok(Json(TxResponse {
        success: true,
        tx_hash,
        message: format!("NFT owner synced for token #{}", token_id),
    }))
}

/// POST /api/identity/propose-controller
/// Step 1 of DID transfer: Proposes a new controller for a DID. Caller must be current controller or Admin.
pub async fn propose_controller(
    State(state): State<AppState>,
    Extension(_user): Extension<AuthenticatedUser>,
    Json(payload): Json<ProposeControllerRequest>,
) -> Result<Json<TxResponse>, AppError> {
    if payload.did.trim().is_empty() {
        return Err(AppError::BadRequest("DID cannot be empty".to_string()));
    }
    let new_controller: Address = payload.new_controller
        .parse()
        .map_err(|_| AppError::BadRequest("Invalid new_controller address".to_string()))?;

    if new_controller == Address::ZERO {
        return Err(AppError::BadRequest("New controller cannot be the zero address".to_string()));
    }

    let provider = build_provider!(state);
    let registry = IIdentityRegistryWrite::new(state.client.identity_registry_addr, &provider);

    let receipt = registry
        .proposeController(payload.did.clone(), new_controller)
        .send()
        .await
        .map_err(|e| AppError::BlockchainError(format!("proposeController failed: {}", e)))?
        .get_receipt()
        .await
        .map_err(|e| AppError::BlockchainError(format!("Tx receipt failed: {}", e)))?;

    let tx_hash = format!("{:?}", receipt.transaction_hash);
    tracing::info!("Proposed controller for {}: {} tx={}", payload.did, payload.new_controller, tx_hash);

    Ok(Json(TxResponse {
        success: true,
        tx_hash,
        message: format!("Proposed controller for DID '{}' to {}", payload.did, payload.new_controller),
    }))
}

/// POST /api/identity/accept-controller
/// Step 2 of DID transfer: Finalizes DID transfer. Caller must be the proposed pendingController.
pub async fn accept_controller(
    State(state): State<AppState>,
    Extension(_user): Extension<AuthenticatedUser>,
    Json(payload): Json<AcceptControllerRequest>,
) -> Result<Json<TxResponse>, AppError> {
    if payload.did.trim().is_empty() {
        return Err(AppError::BadRequest("DID cannot be empty".to_string()));
    }

    let provider = build_provider!(state);
    let registry = IIdentityRegistryWrite::new(state.client.identity_registry_addr, &provider);

    let receipt = registry
        .acceptController(payload.did.clone())
        .send()
        .await
        .map_err(|e| AppError::BlockchainError(format!("acceptController failed: {}", e)))?
        .get_receipt()
        .await
        .map_err(|e| AppError::BlockchainError(format!("Tx receipt failed: {}", e)))?;

    let tx_hash = format!("{:?}", receipt.transaction_hash);
    tracing::info!("Accepted controller for {} tx={}", payload.did, tx_hash);

    Ok(Json(TxResponse {
        success: true,
        tx_hash,
        message: format!("DID '{}' controller transfer accepted successfully", payload.did),
    }))
}
