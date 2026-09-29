/// Verifiable Presentation (VP) Routes
///
/// Two endpoints:
///   POST /api/vp/create  — Holder creates a signed, shareable VP
///   POST /api/vp/verify  — Anyone verifies a VP (no holder online needed)
///   GET  /api/vp/:vp_id  — Fetch a stored VP record by ID
///   POST /api/vp/:vp_id/revoke — Holder revokes a VP early

use std::time::{SystemTime, UNIX_EPOCH};

use axum::{
    extract::{Path, State},
    Extension, Json,
};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use k256::ecdsa::{RecoveryId, Signature as K256Sig, VerifyingKey};
use sha3::{Digest, Keccak256};
use uuid::Uuid;

use crate::{
    error::AppError,
    middleware::auth::AuthenticatedUser,
    models::{
        CreateVpRequest, CreateVpResponse, VerifyVpRequest, VerifyVpResult, VpChecks,
        VpCredentialDetails, VpTokenClaims,
    },
    AppState,
};

// ─────────────────────────────────────────────────────────────────────────────
// Canonical VP message (must be reproduced identically in the frontend)
// ─────────────────────────────────────────────────────────────────────────────

/// Build the exact human-readable message the holder signs with MetaMask.
/// Both the backend and frontend MUST produce byte-identical output.
pub fn vp_signing_message(
    token_id: u64,
    holder_address: &str,
    purpose: &str,
    expires_at: u64,
) -> String {
    format!(
        "TrustChain Verifiable Presentation\n\nI am presenting credential #{token_id} for: {purpose}\nHolder: {holder}\nThis presentation expires: {expires_at}\n\nBy signing, I prove I control this identity.",
        token_id = token_id,
        purpose = purpose,
        holder = holder_address.to_lowercase(),
        expires_at = expires_at,
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// EIP-191 signature recovery (reuses the same logic as AuthStore)
// ─────────────────────────────────────────────────────────────────────────────

fn recover_eip191_signer(message: &str, signature_hex: &str) -> Result<String, AppError> {
    // Ethereum prefix
    let eth_prefix = format!("\x19Ethereum Signed Message:\n{}", message.len());
    let mut hasher = Keccak256::new();
    hasher.update(eth_prefix.as_bytes());
    hasher.update(message.as_bytes());
    let msg_hash = hasher.finalize();

    let sig_bytes = hex::decode(signature_hex.trim_start_matches("0x"))
        .map_err(|e| AppError::BadRequest(format!("Invalid signature hex: {}", e)))?;

    if sig_bytes.len() != 65 {
        return Err(AppError::BadRequest("Signature must be 65 bytes".to_string()));
    }

    let mut r_s = [0u8; 64];
    r_s.copy_from_slice(&sig_bytes[..64]);
    let v = sig_bytes[64];
    let recovery_byte = if v >= 27 { v - 27 } else { v };

    let signature = K256Sig::from_bytes(&r_s.into())
        .map_err(|e| AppError::BadRequest(format!("Invalid signature: {}", e)))?;
    let recovery_id = RecoveryId::from_byte(recovery_byte)
        .ok_or_else(|| AppError::BadRequest("Invalid v value in signature".to_string()))?;
    let verifying_key =
        VerifyingKey::recover_from_prehash(&msg_hash, &signature, recovery_id)
            .map_err(|e| AppError::Unauthorized(format!("Cannot recover signer: {}", e)))?;

    let uncompressed = verifying_key.to_encoded_point(false);
    let pub_bytes = &uncompressed.as_bytes()[1..];
    let mut keccak = Keccak256::new();
    keccak.update(pub_bytes);
    let hash = keccak.finalize();
    let addr = format!("0x{}", hex::encode(&hash[12..]));
    Ok(addr.to_lowercase())
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/vp/create — Holder creates a shareable VP
// ─────────────────────────────────────────────────────────────────────────────

pub async fn create_vp(
    State(state): State<AppState>,
    Extension(user): Extension<AuthenticatedUser>,
    Json(payload): Json<CreateVpRequest>,
) -> Result<Json<CreateVpResponse>, AppError> {
    // 1. Validate expiry timestamp
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let expires_at = if let Some(exp) = payload.expires_at {
        if exp <= now {
            return Err(AppError::BadRequest("expires_at must be in the future".to_string()));
        }
        if exp > now + (720 * 3600) + 300 {
            return Err(AppError::BadRequest("expires_at exceeds maximum allowed duration of 30 days".to_string()));
        }
        exp
    } else {
        let hours = payload.expiry_hours.unwrap_or(24).clamp(1, 720);
        now + (hours * 3600)
    };

    // 2. Normalise holder address
    let holder_address = payload.holder_address.to_lowercase();
    if holder_address.is_empty() {
        return Err(AppError::BadRequest("holder_address is required".to_string()));
    }

    // 3. Reconstruct the canonical message and verify the holder's signature
    let vp_message =
        vp_signing_message(payload.token_id, &holder_address, &payload.purpose, expires_at);

    let recovered = recover_eip191_signer(&vp_message, &payload.holder_signature)?;
    if recovered != holder_address {
        return Err(AppError::Unauthorized(format!(
            "Signature mismatch: recovered {} but expected {}",
            recovered, holder_address
        )));
    }

    // 4. Fetch the asset on-chain to confirm holder owns / is associated with it
    let asset = state
        .client
        .get_asset(payload.token_id)
        .await
        .map_err(|e| AppError::BlockchainError(format!("Cannot fetch asset #{}: {}", payload.token_id, e)))?;

    // 5. Verify the holder is authorized (is NFT owner on-chain, or controller of owner_did)
    let expected_did = format!("did:trustchain:{}", holder_address);
    let mut is_authorized = false;
    let mut holder_did = expected_did.clone();

    if asset.nft_owner.to_lowercase() == holder_address {
        is_authorized = true;
        if !asset.owner_did.is_empty() {
            holder_did = asset.owner_did.clone();
        }
    } else if asset.owner_did.to_lowercase() == expected_did {
        is_authorized = true;
        holder_did = asset.owner_did.clone();
    } else if !asset.owner_did.is_empty() {
        if let Ok(id) = state.client.get_identity(&asset.owner_did).await {
            if id.controller.to_lowercase() == holder_address {
                is_authorized = true;
                holder_did = id.did;
            }
        }
    }

    if !is_authorized {
        return Err(AppError::Forbidden(
            format!("You ({}) are not the owner or DID controller of credential #{}", holder_address, payload.token_id)
        ));
    }

    // 6. Build VP token claims
    let vp_id = Uuid::new_v4().to_string();
    let claims = VpTokenClaims {
        typ: "verifiable_presentation".to_string(),
        vp_id: vp_id.clone(),
        token_id: payload.token_id,
        credential_hash: asset.credential_hash.clone(),
        holder_address: holder_address.clone(),
        holder_did: holder_did.clone(),
        purpose: payload.purpose.clone(),
        holder_signature: payload.holder_signature.clone(),
        iat: now,
        exp: expires_at,
    };

    // 7. Sign the VP token with the backend JWT secret
    let vp_token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.config.jwt_secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(format!("Failed to sign VP token: {}", e)))?;

    // 8. Persist to DB
    sqlx::query(
        r#"
        INSERT INTO verifiable_presentations
            (vp_id, token_id, credential_hash, holder_address, holder_did, purpose,
             issued_at, expires_at, holder_signature, vp_token, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active')
        "#,
    )
    .bind(&vp_id)
    .bind(payload.token_id as i64)
    .bind(&asset.credential_hash)
    .bind(&holder_address)
    .bind(&holder_did)
    .bind(&payload.purpose)
    .bind(now as i64)
    .bind(expires_at as i64)
    .bind(&payload.holder_signature)
    .bind(&vp_token)
    .execute(&state.db)
    .await
    .map_err(|e| AppError::DatabaseError(format!("Failed to store VP: {}", e)))?;

    tracing::info!(
        "VP created: vp_id={} token_id={} holder={} purpose={}",
        vp_id, payload.token_id, holder_address, payload.purpose
    );

    let shareable_url = format!("/verify/vp?token={}", urlencoding::encode(&vp_token));

    Ok(Json(CreateVpResponse {
        vp_id,
        vp_token,
        shareable_url,
        expires_at,
        purpose: payload.purpose,
    }))
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/vp/verify — Anyone verifies a VP (holder does NOT need to be online)
// ─────────────────────────────────────────────────────────────────────────────

pub async fn verify_vp(
    State(state): State<AppState>,
    Json(payload): Json<VerifyVpRequest>,
) -> Result<Json<VerifyVpResult>, AppError> {
    // Step 1 — Verify JWT integrity (backend signature)
    let token_data = decode::<VpTokenClaims>(
        &payload.vp_token,
        &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
        &Validation::default(),
    );

    let claims = match token_data {
        Ok(data) => data.claims,
        Err(e) => {
            tracing::warn!("VP JWT invalid: {}", e);
            return Ok(Json(VerifyVpResult {
                is_valid: false,
                checks: VpChecks {
                    token_integrity: false,
                    holder_signature_valid: false,
                    controller_match: false,
                    not_expired: false,
                    credential_active: false,
                    not_revoked: false,
                },
                credential: None,
                failure_reason: Some(format!("VP token is invalid or tampered: {}", e)),
            }));
        }
    };

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    // Step 2 — Check expiry
    let not_expired = claims.exp > now;

    // Step 3 — Check DB revocation
    let db_row = sqlx::query(
        "SELECT status FROM verifiable_presentations WHERE vp_id = $1",
    )
    .bind(&claims.vp_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::DatabaseError(format!("DB lookup failed: {}", e)))?;

    let not_revoked = match &db_row {
        Some(row) => {
            use sqlx::Row;
            row.get::<String, _>("status") == "active"
        }
        None => {
            // VP not found in DB — could be from a different backend instance
            // Trust the JWT content but flag it
            true
        }
    };

    // Step 4 — Reconstruct and verify the holder's EIP-191 signature
    let vp_message = vp_signing_message(
        claims.token_id,
        &claims.holder_address,
        &claims.purpose,
        claims.exp,
    );

    let sig_check = recover_eip191_signer(&vp_message, &claims.holder_signature);
    let holder_signature_valid = match &sig_check {
        Ok(recovered) => recovered.to_lowercase() == claims.holder_address.to_lowercase(),
        Err(_) => false,
    };

    // Step 5 & 6 — Fetch asset on-chain and check controller/owner match and status
    let asset_result = state.client.get_asset(claims.token_id).await;

    let mut controller_match = false;
    if !claims.holder_did.is_empty() {
        if let Ok(identity) = state.client.get_identity(&claims.holder_did).await {
            if identity.controller.to_lowercase() == claims.holder_address.to_lowercase() {
                controller_match = true;
            }
        }
    }
    if !controller_match {
        let expected_did = format!("did:trustchain:{}", claims.holder_address);
        if let Ok(identity) = state.client.get_identity(&expected_did).await {
            if identity.controller.to_lowercase() == claims.holder_address.to_lowercase() {
                controller_match = true;
            }
        }
    }
    if !controller_match {
        if let Ok(ref asset) = asset_result {
            if asset.nft_owner.to_lowercase() == claims.holder_address.to_lowercase() {
                controller_match = true;
            }
        }
    }

    // Step 6 — Check credential is still active on-chain
    let credential_active = match &asset_result {
        Ok(asset) => {
            let s = asset.status.to_uppercase();
            s == "ACTIVE" || s == "0"
        }
        Err(_) => false,
    };

    // Step 7 — Aggregate
    let all_checks = VpChecks {
        token_integrity: true,
        holder_signature_valid,
        controller_match,
        not_expired,
        credential_active,
        not_revoked,
    };

    let is_valid = holder_signature_valid
        && controller_match
        && not_expired
        && credential_active
        && not_revoked;

    let failure_reason = if !is_valid {
        let mut reasons = Vec::new();
        if !holder_signature_valid { reasons.push("Invalid holder signature"); }
        if !controller_match { reasons.push("Holder address does not match DID controller or NFT owner"); }
        if !not_expired { reasons.push("Presentation has expired"); }
        if !credential_active { reasons.push("Credential has been revoked or is inactive"); }
        if !not_revoked { reasons.push("Presentation has been revoked by the holder"); }
        Some(reasons.join("; "))
    } else {
        None
    };

    // Step 8 — Build credential details for the response
    let credential = if let Ok(asset) = asset_result {
        Some(VpCredentialDetails {
            token_id: claims.token_id,
            owner_did: asset.owner_did,
            issuer_did: asset.issuer_did,
            asset_type: asset.asset_type,
            schema_id: asset.schema_id,
            metadata_uri: asset.metadata_uri,
            issued_at: asset.issued_at,
            expires_at: asset.expires_at,
            status: asset.status,
            holder_address: claims.holder_address.clone(),
            holder_did: claims.holder_did.clone(),
            purpose: claims.purpose.clone(),
            vp_issued_at: claims.iat,
            vp_expires_at: claims.exp,
        })
    } else {
        None
    };

    tracing::info!(
        "VP verified: vp_id={} valid={} holder={}",
        claims.vp_id, is_valid, claims.holder_address
    );

    Ok(Json(VerifyVpResult {
        is_valid,
        checks: all_checks,
        credential,
        failure_reason,
    }))
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/vp/resolve/:vp_id — Public endpoint to fetch stored VP token by ID
// ─────────────────────────────────────────────────────────────────────────────

pub async fn resolve_vp(
    State(state): State<AppState>,
    Path(vp_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    use serde_json::json;

    let row = sqlx::query(
        "SELECT vp_token FROM verifiable_presentations WHERE vp_id = $1 AND status = 'active'",
    )
    .bind(&vp_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::DatabaseError(format!("DB lookup failed: {}", e)))?;

    match row {
        Some(r) => {
            use sqlx::Row;
            let token: String = r.get("vp_token");
            Ok(Json(json!({ "vp_id": vp_id, "vp_token": token })))
        }
        None => Err(AppError::NotFound("Verifiable presentation not found or expired".to_string())),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/vp/:vp_id/revoke — Holder revokes a VP early
// ─────────────────────────────────────────────────────────────────────────────

pub async fn revoke_vp(
    State(state): State<AppState>,
    Extension(user): Extension<AuthenticatedUser>,
    Path(vp_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    use serde_json::json;

    // Only the holder (by address) can revoke their own VP
    let rows_affected = sqlx::query(
        r#"
        UPDATE verifiable_presentations
        SET status = 'revoked'
        WHERE vp_id = $1 AND holder_address = $2 AND status = 'active'
        "#,
    )
    .bind(&vp_id)
    .bind(&user.address.to_lowercase())
    .execute(&state.db)
    .await
    .map_err(|e| AppError::DatabaseError(format!("Revoke failed: {}", e)))?;

    if rows_affected.rows_affected() == 0 {
        return Err(AppError::NotFound(
            "VP not found or you are not the holder".to_string(),
        ));
    }

    tracing::info!("VP revoked: vp_id={} by={}", vp_id, user.address);
    Ok(Json(json!({ "success": true, "message": format!("VP {} revoked", vp_id) })))
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/vp/my — List all VPs created by the authenticated holder
// ─────────────────────────────────────────────────────────────────────────────

pub async fn list_my_vps(
    State(state): State<AppState>,
    Extension(user): Extension<AuthenticatedUser>,
) -> Result<Json<serde_json::Value>, AppError> {
    use serde_json::json;

    let rows = sqlx::query(
        r#"
        SELECT vp_id, token_id, purpose, issued_at, expires_at, status
        FROM verifiable_presentations
        WHERE holder_address = $1
        ORDER BY created_at DESC
        LIMIT 50
        "#,
    )
    .bind(&user.address.to_lowercase())
    .fetch_all(&state.db)
    .await
    .map_err(|e| AppError::DatabaseError(format!("Failed to list VPs: {}", e)))?;

    use sqlx::Row;
    let vps: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            json!({
                "vp_id": r.get::<String, _>("vp_id"),
                "token_id": r.get::<i64, _>("token_id"),
                "purpose": r.get::<String, _>("purpose"),
                "issued_at": r.get::<i64, _>("issued_at"),
                "expires_at": r.get::<i64, _>("expires_at"),
                "status": r.get::<String, _>("status"),
            })
        })
        .collect();

    Ok(Json(json!({ "presentations": vps })))
}
