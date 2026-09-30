/* ═══════════════════════════════════════════════════════════════════════════
   TrustChain — Smart Contract Addresses & ABIs
   Deployed on Ethereum Sepolia Testnet (Chain ID: 11155111)
   ═══════════════════════════════════════════════════════════════════════════ */

export const CONTRACT_ADDRESSES = {
  ROLE_MANAGER: '0xE1042c9Ba98BD841C363262b74F138545760F78D' as const,
  IDENTITY_REGISTRY: '0x1f7521c73fA6Ed8F1D062cC348995D780134b75D' as const,
  SCHEMA_REGISTRY: '0xE31Afcd77352eF8f8b6CE70E8FE9f5c5C5af46dF' as const,
  ASSET_NFT: '0x260B356FEC314f4EEF2e57734E2e468d90A7521E' as const,
  ASSET_REGISTRY: '0x6B1DA7720651B20C8Fc8BE5d845Ac8D645C9713A' as const,
  TRUST_PAYMASTER: '0xc5e88B4218069E95a22f41d09960f72e17618800' as const,
};

export const IDENTITY_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'registerIdentity',
    stateMutability: 'nonpayable',
    inputs: [
      { internalType: 'string', name: 'did', type: 'string' },
      { internalType: 'address', name: 'controller', type: 'address' },
      { internalType: 'bytes', name: 'publicKey', type: 'bytes' },
      { internalType: 'string', name: 'metadataUri', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getIdentity',
    stateMutability: 'view',
    inputs: [{ internalType: 'string', name: 'did', type: 'string' }],
    outputs: [
      {
        components: [
          { internalType: 'string', name: 'did', type: 'string' },
          { internalType: 'address', name: 'controller', type: 'address' },
          { internalType: 'bytes', name: 'publicKey', type: 'bytes' },
          { internalType: 'uint8', name: 'status', type: 'uint8' },
          { internalType: 'uint256', name: 'createdAt', type: 'uint256' },
          { internalType: 'uint256', name: 'updatedAt', type: 'uint256' },
          { internalType: 'string', name: 'metadataUri', type: 'string' },
          { internalType: 'address', name: 'pendingController', type: 'address' },
        ],
        internalType: 'struct IdentityRegistry.Identity',
        name: '',
        type: 'tuple',
      },
    ],
  },
  {
    type: 'function',
    name: 'isValidController',
    stateMutability: 'view',
    inputs: [
      { internalType: 'string', name: 'did', type: 'string' },
      { internalType: 'address', name: 'caller', type: 'address' },
    ],
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'proposeController',
    stateMutability: 'nonpayable',
    inputs: [
      { internalType: 'string', name: 'did', type: 'string' },
      { internalType: 'address', name: 'newController', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'acceptController',
    stateMutability: 'nonpayable',
    inputs: [{ internalType: 'string', name: 'did', type: 'string' }],
    outputs: [],
  },
] as const;

export const ASSET_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'issueAsset',
    stateMutability: 'nonpayable',
    inputs: [
      { internalType: 'address', name: 'recipient', type: 'address' },
      { internalType: 'string', name: 'ownerDID', type: 'string' },
      { internalType: 'string', name: 'issuerDID', type: 'string' },
      { internalType: 'string', name: 'assetType', type: 'string' },
      { internalType: 'string', name: 'schemaId', type: 'string' },
      { internalType: 'bytes32', name: 'credentialHash', type: 'bytes32' },
      { internalType: 'string', name: 'metadataUri', type: 'string' },
      { internalType: 'uint256', name: 'expiresAt', type: 'uint256' },
      { internalType: 'bool', name: 'isTransferable', type: 'bool' },
    ],
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'transferAsset',
    stateMutability: 'nonpayable',
    inputs: [
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'string', name: 'newOwnerDID', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'revokeAsset',
    stateMutability: 'nonpayable',
    inputs: [
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { internalType: 'string', name: 'reason', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'verifyAsset',
    stateMutability: 'view',
    inputs: [
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { internalType: 'bytes32', name: 'expectedCredentialHash', type: 'bytes32' },
    ],
    outputs: [
      { internalType: 'bool', name: 'isValid', type: 'bool' },
      { internalType: 'bool', name: 'isHashMatch', type: 'bool' },
      { internalType: 'bool', name: 'isNotExpired', type: 'bool' },
      { internalType: 'bool', name: 'isNotRevoked', type: 'bool' },
      { internalType: 'uint8', name: 'currentStatus', type: 'uint8' },
    ],
  },
] as const;

export const SCHEMA_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'registerSchema',
    stateMutability: 'nonpayable',
    inputs: [
      { internalType: 'string', name: 'schemaId', type: 'string' },
      { internalType: 'string', name: 'name', type: 'string' },
      { internalType: 'string', name: 'schemaUri', type: 'string' },
      { internalType: 'bytes32', name: 'schemaHash', type: 'bytes32' },
      { internalType: 'string', name: 'version', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setSchemaStatus',
    stateMutability: 'nonpayable',
    inputs: [
      { internalType: 'string', name: 'schemaId', type: 'string' },
      { internalType: 'bool', name: 'isActive', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getSchema',
    stateMutability: 'view',
    inputs: [{ internalType: 'string', name: 'schemaId', type: 'string' }],
    outputs: [
      {
        components: [
          { internalType: 'string', name: 'schemaId', type: 'string' },
          { internalType: 'string', name: 'name', type: 'string' },
          { internalType: 'string', name: 'schemaUri', type: 'string' },
          { internalType: 'bytes32', name: 'schemaHash', type: 'bytes32' },
          { internalType: 'string', name: 'version', type: 'string' },
          { internalType: 'address', name: 'author', type: 'address' },
          { internalType: 'bool', name: 'isActive', type: 'bool' },
          { internalType: 'uint256', name: 'registeredAt', type: 'uint256' },
        ],
        internalType: 'struct SchemaRegistry.Schema',
        name: '',
        type: 'tuple',
      },
    ],
  },
  {
    type: 'function',
    name: 'isSchemaValid',
    stateMutability: 'view',
    inputs: [
      { internalType: 'string', name: 'schemaId', type: 'string' },
      { internalType: 'bytes32', name: 'expectedHash', type: 'bytes32' },
    ],
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'getAllSchemaIds',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ internalType: 'string[]', name: '', type: 'string[]' }],
  },
] as const;

