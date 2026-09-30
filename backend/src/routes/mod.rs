pub mod assets;
pub mod audit;
pub mod auth;
pub mod health;
pub mod identity;
pub mod metadata;
pub mod schemas;
pub mod vp;
pub mod write;

use axum::{
    middleware,
    routing::{get, post},
    Router,
};
use tower_http::cors::{Any, CorsLayer};

use crate::{middleware::auth::require_auth, AppState};

pub fn create_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let write_routes = Router::new()
        .route("/api/identity/register", post(write::register_identity))
        .route("/api/identity/propose-controller", post(write::propose_controller))
        .route("/api/identity/accept-controller", post(write::accept_controller))
        .route("/api/schemas", post(write::register_schema))
        .route("/api/assets/issue", post(write::issue_asset))
        .route("/api/assets/:token_id/transfer", post(write::transfer_asset))
        .route("/api/assets/:token_id/revoke", post(write::revoke_asset))
        .route("/api/assets/:token_id/status", post(write::update_asset_status))
        .route("/api/assets/:token_id/sync-owner", post(write::sync_nft_owner))
        .route("/api/metadata/upload", post(metadata::upload_metadata))
        // VP — protected endpoints (holder must be authenticated)
        .route("/api/vp/create", post(vp::create_vp))
        .route("/api/vp/my", get(vp::list_my_vps))
        .route("/api/vp/:vp_id/revoke", post(vp::revoke_vp))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_auth));

    Router::new()
        // Health
        .route("/health", get(health::health_check))
        // Auth
        .route("/api/auth/challenge", post(auth::request_challenge))
        .route("/api/auth/verify", post(auth::verify_signature))
        // Identity
        .route("/api/identity/me", get(identity::get_my_identity))
        .route("/api/identity/sync", post(identity::sync_identity))
        .route("/api/identity/:did", get(identity::get_identity))
        .route("/api/identity/controller/:address", get(identity::resolve_controller_identity))
        // Schemas
        .route("/api/schemas", get(schemas::list_standard_schemas))
        .route("/api/schemas/:schema_id", get(schemas::get_schema))
        // Assets
        .route("/api/assets", get(assets::list_all_assets))
        .route("/api/assets/my", get(assets::get_my_assets))
        .route("/api/assets/verify", post(assets::verify_asset))
        .route("/api/assets/:token_id", get(assets::get_asset))
        // Audit
        .route("/api/audit/summary", get(audit::get_audit_summary))
        .route("/api/audit/assets", get(audit::get_auditable_assets))
        .route("/api/audit/issuances", get(audit::get_issuances))
        .route("/api/audit/transfers", get(audit::get_transfers))
        .route("/api/audit/revocations", get(audit::get_revocations))
        .route("/api/audit/events", get(audit::get_events))
        // Metadata (public read)
        .route("/api/metadata/:id", get(metadata::get_metadata))
        // VP — public verify & resolve (no auth, no holder online needed)
        .route("/api/vp/verify", post(vp::verify_vp))
        .route("/api/vp/resolve/:vp_id", get(vp::resolve_vp))
        // Merge write routes (includes protected VP create/revoke/list)
        .merge(write_routes)
        .layer(cors)
        .with_state(state)
}
