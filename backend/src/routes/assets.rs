use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::Deserialize;
use crate::db::asset as db_asset;
use crate::error::AppError;
use crate::models::{AssetRecord, VerifyAssetPayload, VerifyAssetResult};
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct MyAssetsQuery {
    pub address: Option<String>,
}

/// GET /api/assets/my?address=0x...
/// List all assets/credentials owned or controlled by the user
pub async fn get_my_assets(
    State(state): State<AppState>,
    Query(params): Query<MyAssetsQuery>,
) -> Result<Json<Vec<AssetRecord>>, AppError> {
    let addr = params.address.map(|a| a.to_lowercase()).unwrap_or_default();
    if addr.is_empty() {
        return Ok(Json(Vec::new()));
    }

    let expected_did = format!("did:trustchain:{}", addr);

    // 1. Try DB first
    let db_assets = db_asset::list_assets(&state.db, None, None, None, 100, 0)
        .await
        .unwrap_or_default();

    let mut my_assets: Vec<AssetRecord> = db_assets
        .into_iter()
        .filter(|a| {
            a.nft_owner_address.to_lowercase() == addr
                || a.owner_did.to_lowercase() == expected_did
                || a.owner_did.to_lowercase().contains(&addr)
        })
        .map(AssetRecord::from)
        .collect();

    // 2. Query on-chain for real-time live data and enrich incomplete records
    if let Ok(count) = state.client.get_asset_count().await {
        for token_id in 1..=count {
            if let Some(existing) = my_assets.iter_mut().find(|a| a.token_id == token_id) {
                if existing.asset_type.is_empty() || existing.schema_id.is_empty() {
                    if let Ok(onchain_asset) = state.client.get_asset(token_id).await {
                        *existing = onchain_asset;
                    }
                }
                continue;
            }
            if let Ok(asset) = state.client.get_asset(token_id).await {
                if asset.nft_owner.to_lowercase() == addr
                    || asset.owner_did.to_lowercase() == expected_did
                    || asset.owner_did.to_lowercase().contains(&addr)
                {
                    my_assets.push(asset);
                }
            }
        }
    }

    // Sort by tokenId ascending
    my_assets.sort_by_key(|a| a.token_id);

    Ok(Json(my_assets))
}

/// GET /api/assets
/// List all assets
pub async fn list_all_assets(
    State(state): State<AppState>,
) -> Result<Json<Vec<AssetRecord>>, AppError> {
    let mut assets = Vec::new();
    if let Ok(count) = state.client.get_asset_count().await {
        for token_id in 1..=count {
            if let Ok(asset) = state.client.get_asset(token_id).await {
                assets.push(asset);
            }
        }
    }
    Ok(Json(assets))
}

pub async fn get_asset(
    State(state): State<AppState>,
    Path(token_id): Path<u64>,
) -> Result<Json<AssetRecord>, AppError> {
    let asset = state.client.get_asset(token_id).await?;
    Ok(Json(asset))
}

pub async fn verify_asset(
    State(state): State<AppState>,
    Json(payload): Json<VerifyAssetPayload>,
) -> Result<Json<VerifyAssetResult>, AppError> {
    let result = state
        .client
        .verify_asset(payload.token_id, &payload.credential_hash)
        .await?;

    Ok(Json(result))
}
