use alloy::{
    primitives::{Address, FixedBytes, U256},
    providers::{ProviderBuilder, RootProvider},
    sol,
    transports::http::Http,
};
use reqwest::Url;
use std::sync::Arc;

use crate::config::Config;
use crate::error::AppError;
use crate::models::{AssetRecord, IdentityRecord, SchemaRecord, VerifyAssetResult};

sol! {
    #[sol(rpc)]
    interface IRoleManager {
        function isAdmin(address account) external view returns (bool);
        function isManager(address account) external view returns (bool);
        function isAuditor(address account) external view returns (bool);
        function isUser(address account) external view returns (bool);
    }

    #[sol(rpc)]
    interface IIdentityRegistry {
        struct Identity {
            string did;
            address controller;
            bytes publicKey;
            uint8 status;
            uint256 createdAt;
            uint256 updatedAt;
            string metadataUri;
            address pendingController;
        }

        function getIdentity(string calldata did) external view returns (Identity memory);
        function isValidController(string calldata did, address controller) external view returns (bool);
        function getDidsByController(address controller) external view returns (string[] memory);
    }

    #[sol(rpc)]
    interface ISchemaRegistry {
        struct SchemaStruct {
            string schemaId;
            string name;
            string schemaUri;
            bytes32 schemaHash;
            string version;
            address author;
            bool isActive;
            uint256 registeredAt;
        }

        function getSchema(string calldata schemaId) external view returns (SchemaStruct memory);
        function isSchemaValid(string calldata schemaId, bytes32 expectedHash) external view returns (bool);
        function getAllSchemaIds() external view returns (string[] memory);
    }

    #[sol(rpc)]
    interface IAssetRegistry {
        struct AssetStruct {
            uint256 tokenId;
            string assetType;
            string schemaId;
            bytes32 credentialHash;
            string ownerDID;
            string issuerDID;
            address issuerAddress;
            uint256 issuedAt;
            uint256 expiresAt;
            uint8 status;
            bool isTransferable;
            string metadataUri;
        }

        function getAsset(uint256 tokenId) external view returns (AssetStruct memory record, address currentOwner);
        function totalAssets() external view returns (uint256);
        function verifyAsset(uint256 tokenId, bytes32 payloadHash) external view returns (
            bool isValid,
            bool isHashMatch,
            bool isStatusActive,
            bool isNotExpired,
            bool isOwnerVerified,
            AssetStruct memory asset,
            address currentOwner
        );
    }

    #[sol(rpc)]
    interface IAssetNFT {
        function ownerOf(uint256 tokenId) external view returns (address);
        function tokenURI(uint256 tokenId) external view returns (string memory);
    }
}

#[derive(Clone)]
pub struct BlockchainClient {
    pub provider: Arc<RootProvider<Http<reqwest::Client>>>,
    pub role_manager_addr: Address,
    pub identity_registry_addr: Address,
    pub schema_registry_addr: Address,
    pub asset_nft_addr: Address,
    pub asset_registry_addr: Address,
    pub trust_paymaster_addr: Address,
}

impl BlockchainClient {
    pub fn new(config: &Config) -> Result<Self, AppError> {
        let rpc_url: Url = config
            .sepolia_rpc_url
            .parse()
            .map_err(|e| AppError::Internal(format!("Invalid RPC URL: {}", e)))?;

        let provider = ProviderBuilder::new().on_http(rpc_url);

        let parse_addr = |name: &str, s: &str| -> Result<Address, AppError> {
            s.parse().map_err(|e| {
                AppError::Internal(format!("Failed parsing contract address {}: {}", name, e))
            })
        };

        Ok(Self {
            provider: Arc::new(provider),
            role_manager_addr: parse_addr("role_manager", &config.role_manager_address)?,
            identity_registry_addr: parse_addr("identity_registry", &config.identity_registry_address)?,
            schema_registry_addr: parse_addr("schema_registry", &config.schema_registry_address)?,
            asset_nft_addr: parse_addr("asset_nft", &config.asset_nft_address)?,
            asset_registry_addr: parse_addr("asset_registry", &config.asset_registry_address)?,
            trust_paymaster_addr: parse_addr("trust_paymaster", &config.trust_paymaster_address)?,
        })
    }

    // ── Role Manager Reads ─────────────────────────────────────────────────────

    pub async fn is_admin(&self, account: Address) -> Result<bool, AppError> {
        let contract = IRoleManager::new(self.role_manager_addr, self.provider.as_ref());
        let res: IRoleManager::isAdminReturn = contract
            .isAdmin(account)
            .call()
            .await
            .map_err(|e| AppError::BlockchainError(format!("isAdmin call failed: {}", e)))?;
        Ok(res._0)
    }

    pub async fn is_manager(&self, account: Address) -> Result<bool, AppError> {
        let contract = IRoleManager::new(self.role_manager_addr, self.provider.as_ref());
        let res: IRoleManager::isManagerReturn = contract
            .isManager(account)
            .call()
            .await
            .map_err(|e| AppError::BlockchainError(format!("isManager call failed: {}", e)))?;
        Ok(res._0)
    }

    pub async fn is_auditor(&self, account: Address) -> Result<bool, AppError> {
        let contract = IRoleManager::new(self.role_manager_addr, self.provider.as_ref());
        let res: IRoleManager::isAuditorReturn = contract
            .isAuditor(account)
            .call()
            .await
            .map_err(|e| AppError::BlockchainError(format!("isAuditor call failed: {}", e)))?;
        Ok(res._0)
    }

    pub async fn is_user(&self, account: Address) -> Result<bool, AppError> {
        let contract = IRoleManager::new(self.role_manager_addr, self.provider.as_ref());
        let res: IRoleManager::isUserReturn = contract
            .isUser(account)
            .call()
            .await
            .map_err(|e| AppError::BlockchainError(format!("isUser call failed: {}", e)))?;
        Ok(res._0)
    }

    // ── Identity Registry Reads ───────────────────────────────────────────────

    pub async fn get_identity(&self, did: &str) -> Result<IdentityRecord, AppError> {
        let contract = IIdentityRegistry::new(self.identity_registry_addr, self.provider.as_ref());
        let res: IIdentityRegistry::getIdentityReturn = contract
            .getIdentity(did.to_string())
            .call()
            .await
            .map_err(|e| AppError::NotFound(format!("DID not found or call failed: {}", e)))?;

        let id = res._0;

        let status_str = match id.status {
            0 => "ACTIVE",
            1 => "SUSPENDED",
            2 => "REVOKED",
            _ => "UNKNOWN",
        };

        let pending_controller = if id.pendingController != Address::ZERO {
            format!("{:#x}", id.pendingController)
        } else {
            String::new()
        };

        Ok(IdentityRecord {
            did: id.did,
            controller: format!("{:#x}", id.controller),
            status: status_str.to_string(),
            public_key: format!("0x{}", hex::encode(id.publicKey)),
            metadata_uri: id.metadataUri,
            is_active: id.status == 0,
            pending_controller,
        })
    }

    pub async fn is_valid_controller(&self, did: &str, controller: Address) -> Result<bool, AppError> {
        let contract = IIdentityRegistry::new(self.identity_registry_addr, self.provider.as_ref());
        let res: IIdentityRegistry::isValidControllerReturn = contract
            .isValidController(did.to_string(), controller)
            .call()
            .await
            .map_err(|e| AppError::BlockchainError(format!("isValidController failed: {}", e)))?;
        Ok(res._0)
    }

    pub async fn get_dids_by_controller(&self, controller: Address) -> Result<Vec<String>, AppError> {
        let contract = IIdentityRegistry::new(self.identity_registry_addr, self.provider.as_ref());
        let res: IIdentityRegistry::getDidsByControllerReturn = contract
            .getDidsByController(controller)
            .call()
            .await
            .map_err(|e| AppError::BlockchainError(format!("getDidsByController failed: {}", e)))?;
        Ok(res._0)
    }

    // ── Schema Registry Reads ─────────────────────────────────────────────────

    pub async fn get_schema(&self, schema_id: &str) -> Result<SchemaRecord, AppError> {
        let contract = ISchemaRegistry::new(self.schema_registry_addr, self.provider.as_ref());
        let res: ISchemaRegistry::getSchemaReturn = contract
            .getSchema(schema_id.to_string())
            .call()
            .await
            .map_err(|e| AppError::NotFound(format!("Schema not found: {}", e)))?;

        let s = res._0;

        Ok(SchemaRecord {
            schema_id: s.schemaId,
            name: s.name,
            schema_uri: s.schemaUri,
            schema_hash: format!("0x{}", hex::encode(s.schemaHash)),
            version: s.version,
            author: format!("{:#x}", s.author),
            is_active: s.isActive,
        })
    }

    pub async fn get_all_schema_ids(&self) -> Result<Vec<String>, AppError> {
        let contract = ISchemaRegistry::new(self.schema_registry_addr, self.provider.as_ref());
        let res: ISchemaRegistry::getAllSchemaIdsReturn = contract
            .getAllSchemaIds()
            .call()
            .await
            .map_err(|e| AppError::BlockchainError(format!("getAllSchemaIds failed: {}", e)))?;
        Ok(res._0)
    }

    // ── Asset Registry Reads ──────────────────────────────────────────────────

    pub async fn get_asset(&self, token_id: u64) -> Result<AssetRecord, AppError> {
        let contract = IAssetRegistry::new(self.asset_registry_addr, self.provider.as_ref());
        let res: IAssetRegistry::getAssetReturn = contract
            .getAsset(U256::from(token_id))
            .call()
            .await
            .map_err(|e| AppError::NotFound(format!("Asset #{} not found: {}", token_id, e)))?;

        let asset = res.record;
        let nft_owner = format!("{:#x}", res.currentOwner);

        let status_str = match asset.status {
            0 => "ACTIVE",
            1 => "SUSPENDED",
            2 => "REVOKED",
            3 => "EXPIRED",
            _ => "UNKNOWN",
        };

        Ok(AssetRecord {
            token_id,
            recipient: format!("{:#x}", asset.issuerAddress),
            owner_did: asset.ownerDID,
            issuer_did: asset.issuerDID,
            asset_type: asset.assetType,
            schema_id: asset.schemaId,
            credential_hash: format!("0x{}", hex::encode(asset.credentialHash)),
            metadata_uri: asset.metadataUri,
            issued_at: asset.issuedAt.to::<u64>(),
            expires_at: asset.expiresAt.to::<u64>(),
            status: status_str.to_string(),
            is_transferable: asset.isTransferable,
            nft_owner,
        })
    }

    pub async fn get_asset_count(&self) -> Result<u64, AppError> {
        let contract = IAssetRegistry::new(self.asset_registry_addr, self.provider.as_ref());
        let res: IAssetRegistry::totalAssetsReturn = contract
            .totalAssets()
            .call()
            .await
            .map_err(|e| AppError::BlockchainError(format!("totalAssets failed: {}", e)))?;
        Ok(res._0.to::<u64>())
    }

    pub async fn verify_asset(&self, token_id: u64, payload_hash: &str) -> Result<VerifyAssetResult, AppError> {
        let hash_bytes: FixedBytes<32> = payload_hash
            .trim_start_matches("0x")
            .parse()
            .map_err(|e| AppError::BadRequest(format!("Invalid hash hex string: {}", e)))?;

        let contract = IAssetRegistry::new(self.asset_registry_addr, self.provider.as_ref());
        let res: IAssetRegistry::verifyAssetReturn = contract
            .verifyAsset(U256::from(token_id), hash_bytes)
            .call()
            .await
            .map_err(|e| AppError::BlockchainError(format!("verifyAsset failed: {}", e)))?;

        let asset_record = self.get_asset(token_id).await?;

        Ok(VerifyAssetResult {
            is_valid: res.isValid,
            is_hash_match: res.isHashMatch,
            is_status_active: res.isStatusActive,
            is_not_expired: res.isNotExpired,
            is_owner_verified: res.isOwnerVerified,
            owner_did: res.asset.ownerDID,
            issuer_did: res.asset.issuerDID,
            status: asset_record.status,
        })
    }
}
