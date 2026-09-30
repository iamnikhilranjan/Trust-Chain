use sqlx::{PgPool, Row};
use chrono::{DateTime, Utc};
use uuid::Uuid;
use crate::error::AppError;
use crate::models::IdentityRecord;

/// Row type matching the `identities` table
#[derive(Debug)]
pub struct IdentityRow {
    pub id: Uuid,
    pub did: String,
    pub controller_address: String,
    pub status: i16,
    pub metadata_uri: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub registration_tx: Option<String>,
}

impl From<IdentityRow> for IdentityRecord {
    fn from(row: IdentityRow) -> Self {
        let status_str = match row.status {
            0 => "ACTIVE",
            1 => "SUSPENDED",
            2 => "REVOKED",
            _ => "UNKNOWN",
        };
        IdentityRecord {
            did: row.did,
            controller: row.controller_address,
            status: status_str.to_string(),
            public_key: String::new(),
            metadata_uri: row.metadata_uri,
            is_active: row.status == 0,
            pending_controller: String::new(),
        }
    }
}

fn map_identity_row(row: sqlx::postgres::PgRow) -> IdentityRow {
    use sqlx::Row;
    IdentityRow {
        id: row.get("id"),
        did: row.get("did"),
        controller_address: row.get("controller_address"),
        status: row.get("status"),
        metadata_uri: row.get("metadata_uri"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
        registration_tx: row.get("registration_tx"),
    }
}

/// Upsert an identity record (insert or update on did conflict)
pub async fn upsert_identity(
    pool: &PgPool,
    did: &str,
    controller_address: &str,
    status: i16,
    metadata_uri: &str,
    registration_tx: Option<&str>,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
        INSERT INTO identities (did, controller_address, status, metadata_uri, registration_tx)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (did) DO UPDATE SET
            controller_address = EXCLUDED.controller_address,
            status = EXCLUDED.status,
            metadata_uri = EXCLUDED.metadata_uri,
            registration_tx = COALESCE(EXCLUDED.registration_tx, identities.registration_tx),
            updated_at = NOW()
        "#
    )
    .bind(did)
    .bind(controller_address)
    .bind(status)
    .bind(metadata_uri)
    .bind(registration_tx)
    .execute(pool)
    .await
    .map_err(|e| AppError::DatabaseError(format!("Failed to upsert identity: {}", e)))?;

    Ok(())
}

/// Fetch a single identity by DID from the DB cache
pub async fn get_identity_by_did(
    pool: &PgPool,
    did: &str,
) -> Result<Option<IdentityRow>, AppError> {
    let row = sqlx::query(
        r#"SELECT id, did, controller_address, status, metadata_uri, created_at, updated_at, registration_tx
           FROM identities WHERE did = $1"#
    )
    .bind(did)
    .fetch_optional(pool)
    .await
    .map_err(|e| AppError::DatabaseError(format!("DB query failed: {}", e)))?;

    Ok(row.map(map_identity_row))
}

/// Resolve DID from controller wallet address (reverse lookup)
pub async fn get_did_by_controller(
    pool: &PgPool,
    controller_address: &str,
) -> Result<Option<String>, AppError> {
    let row = sqlx::query(
        r#"SELECT did FROM identities WHERE LOWER(controller_address) = LOWER($1) AND status = 0 LIMIT 1"#
    )
    .bind(controller_address)
    .fetch_optional(pool)
    .await
    .map_err(|e| AppError::DatabaseError(format!("DB query failed: {}", e)))?;

    Ok(row.map(|r| r.get::<String, _>("did")))
}

/// Get all identities (paginated)
pub async fn list_identities(
    pool: &PgPool,
    limit: i64,
    offset: i64,
) -> Result<Vec<IdentityRow>, AppError> {
    let rows = sqlx::query(
        r#"SELECT id, did, controller_address, status, metadata_uri, created_at, updated_at, registration_tx
           FROM identities
           ORDER BY created_at DESC
           LIMIT $1 OFFSET $2"#
    )
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::DatabaseError(format!("DB query failed: {}", e)))?;

    Ok(rows.into_iter().map(map_identity_row).collect())
}
