use alloy::primitives::Address;
use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::Deserialize;
use crate::db::identity as db_identity;
use crate::error::AppError;
use crate::models::IdentityRecord;
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct MeQuery {
    pub address: String,
}

/// GET /api/identity/me?address=0x...
/// Resolve the authenticated wallet's identity.
/// Frontend should pass the authenticated address as a query param.
/// Note: In a JWT-based auth flow, this would read from the session token.
pub async fn get_my_identity(
    State(state): State<AppState>,
    Query(params): Query<MeQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let address = params.address.to_lowercase();
    let addr: Address = address.parse()
        .map_err(|e| AppError::BadRequest(format!("Invalid address: {}", e)))?;

    let is_admin = state.client.is_admin(addr).await.unwrap_or(false);
    let is_manager = state.client.is_manager(addr).await.unwrap_or(false);
    let is_auditor = state.client.is_auditor(addr).await.unwrap_or(false);
    let is_user = state.client.is_user(addr).await.unwrap_or(false);

    // 1. Query on-chain getDidsByController (blockchain-authoritative)
    let onchain_dids = state.client.get_dids_by_controller(addr).await.unwrap_or_default();
    let did_opt = if !onchain_dids.is_empty() {
        Some(onchain_dids[0].clone())
    } else {
        db_identity::get_did_by_controller(&state.db, &address).await?
    };

    // 2. Fetch full identity details from smart contract
    if let Some(target_did) = did_opt {
        if let Ok(identity) = state.client.get_identity(&target_did).await {
            if !identity.did.is_empty() {
                let _ = db_identity::upsert_identity(
                    &state.db,
                    &identity.did,
                    &identity.controller.to_lowercase(),
                    if identity.is_active { 0 } else { 1 },
                    &identity.metadata_uri,
                    None,
                ).await;

                return Ok(Json(serde_json::json!({
                    "found": true,
                    "identity": identity,
                    "roles": {
                        "isAdmin": is_admin,
                        "isManager": is_manager,
                        "isAuditor": is_auditor,
                        "isUser": is_user,
                    }
                })));
            }
        }
    }

    // No DID registered on IdentityRegistry contract
    Ok(Json(serde_json::json!({
        "found": false,
        "identity": null,
        "roles": {
            "isAdmin": is_admin,
            "isManager": is_manager,
            "isAuditor": is_auditor,
            "isUser": is_user,
        }
    })))
}

/// GET /api/identity/:did — get identity by DID (blockchain-authoritative)
pub async fn get_identity(
    State(state): State<AppState>,
    Path(did): Path<String>,
) -> Result<Json<IdentityRecord>, AppError> {
    let identity = state.client.get_identity(&did).await?;
    Ok(Json(identity))
}

/// GET /api/identity/controller/:address
pub async fn resolve_controller_identity(
    State(state): State<AppState>,
    Path(address): Path<String>,
) -> Result<Json<IdentityRecord>, AppError> {
    let parsed_addr: Address = address
        .parse()
        .map_err(|e| AppError::BadRequest(format!("Invalid address format: {}", e)))?;

    let address_lc = address.to_lowercase();

    // 1. Query on-chain getDidsByController (blockchain-authoritative)
    let onchain_dids = state.client.get_dids_by_controller(parsed_addr).await.unwrap_or_default();
    let did_opt = if !onchain_dids.is_empty() {
        Some(onchain_dids[0].clone())
    } else {
        db_identity::get_did_by_controller(&state.db, &address_lc).await?
    };

    if let Some(did) = did_opt {
        if let Ok(identity) = state.client.get_identity(&did).await {
            if !identity.did.is_empty() {
                let is_valid = state.client.is_valid_controller(&identity.did, parsed_addr).await.unwrap_or(true);
                if is_valid {
                    let _ = db_identity::upsert_identity(
                        &state.db,
                        &identity.did,
                        &identity.controller.to_lowercase(),
                        if identity.is_active { 0 } else { 1 },
                        &identity.metadata_uri,
                        None,
                    ).await;

                    return Ok(Json(identity));
                }
            }
        }
    }

    Err(AppError::NotFound(
        format!("No registered DID found for controller address {}", address)
    ))
}

#[derive(Debug, Deserialize)]
pub struct SyncIdentityRequest {
    pub did: String,
    pub controller: String,
    pub metadata_uri: Option<String>,
    pub tx_hash: Option<String>,
}

/// POST /api/identity/sync
/// Records an on-chain registered identity in the local DB cache.
pub async fn sync_identity(
    State(state): State<AppState>,
    Json(payload): Json<SyncIdentityRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    if payload.did.trim().is_empty() {
        return Err(AppError::BadRequest("DID cannot be empty".to_string()));
    }

    let metadata_uri = payload.metadata_uri.unwrap_or_default();
    db_identity::upsert_identity(
        &state.db,
        &payload.did,
        &payload.controller.to_lowercase(),
        0, // ACTIVE
        &metadata_uri,
        payload.tx_hash.as_deref(),
    )
    .await?;

    tracing::info!(
        "Synced identity {} for controller {} (tx: {:?})",
        payload.did,
        payload.controller,
        payload.tx_hash
    );

    Ok(Json(serde_json::json!({
        "success": true,
        "message": format!("Identity '{}' synced to database", payload.did)
    })))
}
