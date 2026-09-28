/* ═══════════════════════════════════════════════════════════════════════════
   TrustChain — API Service Layer
   Connects to Rust Axum backend at http://localhost:3001
   ═══════════════════════════════════════════════════════════════════════════ */

import type {
  AuditEvent,
  AuditSummary,
  AssetRecord,
  ChallengeResponse,
  CreateVpRequest,
  CreateVpResponse,
  HealthResponse,
  IdentityRecord,
  IssueAssetRequest,
  MetadataUploadResponse,
  MyIdentityResponse,
  RegisterIdentityRequest,
  RegisterSchemaRequest,
  SchemaRecord,
  TxResponse,
  VerifyAssetPayload,
  VerifyAssetResult,
  VerifySignatureResponse,
  VerifyVpRequest,
  VerifyVpResult,
} from '../types';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const BASE_URL = `${API_BASE}/api`;

// ── Token Management ──────────────────────────────────────────────────────

let authToken: string | null = localStorage.getItem('trustchain_token');

export function setToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem('trustchain_token', token);
  } else {
    localStorage.removeItem('trustchain_token');
  }
}

export function getToken(): string | null {
  return authToken;
}

// ── Fetch Wrapper ─────────────────────────────────────────────────────────

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(errorBody || `Request failed: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export async function requestRaw(path: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  return fetch(path, { headers });
}

// ── Health ─────────────────────────────────────────────────────────────────

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
}

// ── Auth ───────────────────────────────────────────────────────────────────

export async function requestChallenge(address: string): Promise<ChallengeResponse> {
  return request<ChallengeResponse>('/auth/challenge', {
    method: 'POST',
    body: JSON.stringify({ address }),
  });
}

export async function verifySignature(
  address: string,
  signature: string,
  nonce: string
): Promise<VerifySignatureResponse> {
  return request<VerifySignatureResponse>('/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ address, signature, nonce }),
  });
}

// ── Identity ──────────────────────────────────────────────────────────────

export async function getMyIdentity(address: string): Promise<MyIdentityResponse> {
  return request<MyIdentityResponse>(`/identity/me?address=${encodeURIComponent(address)}`);
}

export async function getIdentity(did: string): Promise<IdentityRecord> {
  return request<IdentityRecord>(`/identity/${encodeURIComponent(did)}`);
}

export async function resolveController(address: string): Promise<IdentityRecord> {
  return request<IdentityRecord>(`/identity/controller/${encodeURIComponent(address)}`);
}

export async function registerIdentity(payload: RegisterIdentityRequest): Promise<TxResponse> {
  return request<TxResponse>('/identity/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface SyncIdentityPayload {
  did: string;
  controller: string;
  metadata_uri?: string;
  tx_hash?: string;
}

export async function syncIdentity(payload: SyncIdentityPayload): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>('/identity/sync', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ── Schemas ───────────────────────────────────────────────────────────────

export async function listSchemas(): Promise<SchemaRecord[]> {
  return request<SchemaRecord[]>('/schemas');
}

export async function getSchema(schemaId: string): Promise<SchemaRecord> {
  return request<SchemaRecord>(`/schemas/${encodeURIComponent(schemaId)}`);
}

export async function registerSchema(payload: RegisterSchemaRequest): Promise<TxResponse> {
  return request<TxResponse>('/schemas', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ── Assets ────────────────────────────────────────────────────────────────

export async function getMyAssets(address: string): Promise<AssetRecord[]> {
  return request<AssetRecord[]>(`/assets/my?address=${encodeURIComponent(address)}`);
}

export async function listAllAssets(): Promise<AssetRecord[]> {
  return request<AssetRecord[]>('/assets');
}

export async function getAsset(tokenId: number): Promise<AssetRecord> {
  return request<AssetRecord>(`/assets/${tokenId}`);
}

export async function verifyAsset(payload: VerifyAssetPayload): Promise<VerifyAssetResult> {
  return request<VerifyAssetResult>('/assets/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function issueAsset(payload: IssueAssetRequest): Promise<TxResponse> {
  return request<TxResponse>('/assets/issue', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function transferAsset(tokenId: number, toDid: string): Promise<TxResponse> {
  return request<TxResponse>(`/assets/${tokenId}/transfer`, {
    method: 'POST',
    body: JSON.stringify({ to_did: toDid }),
  });
}

export async function revokeAsset(tokenId: number, reason: string): Promise<TxResponse> {
  return request<TxResponse>(`/assets/${tokenId}/revoke`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function updateAssetStatus(
  tokenId: number,
  status: number,
  reason: string
): Promise<TxResponse> {
  return request<TxResponse>(`/assets/${tokenId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status, reason }),
  });
}

export async function syncNFTOwner(tokenId: number): Promise<TxResponse> {
  return request<TxResponse>(`/assets/${tokenId}/sync-owner`, {
    method: 'POST',
  });
}

// ── Audit ─────────────────────────────────────────────────────────────────

export async function getAuditSummary(): Promise<AuditSummary> {
  return request<AuditSummary>('/audit/summary');
}

export async function getAuditableAssets(params?: {
  owner_did?: string;
  issuer_did?: string;
  schema_id?: string;
  limit?: number;
  offset?: number;
}): Promise<AssetRecord[]> {
  const query = new URLSearchParams();
  if (params?.owner_did) query.set('owner_did', params.owner_did);
  if (params?.issuer_did) query.set('issuer_did', params.issuer_did);
  if (params?.schema_id) query.set('schema_id', params.schema_id);
  if (params?.limit) query.set('limit', params.limit.toString());
  if (params?.offset) query.set('offset', params.offset.toString());
  const qs = query.toString();
  return request<AssetRecord[]>(`/audit/assets${qs ? `?${qs}` : ''}`);
}

export async function getIssuances(limit = 50): Promise<AuditEvent[]> {
  return request<AuditEvent[]>(`/audit/issuances?limit=${limit}`);
}

export async function getTransfers(limit = 50): Promise<AuditEvent[]> {
  return request<AuditEvent[]>(`/audit/transfers?limit=${limit}`);
}

export async function getRevocations(limit = 50): Promise<AuditEvent[]> {
  return request<AuditEvent[]>(`/audit/revocations?limit=${limit}`);
}

export async function getEvents(eventName?: string, limit = 50): Promise<AuditEvent[]> {
  const query = new URLSearchParams({ limit: limit.toString() });
  if (eventName) query.set('event', eventName);
  return request<AuditEvent[]>(`/audit/events?${query.toString()}`);
}

// ── Metadata ──────────────────────────────────────────────────────────────

export async function uploadMetadata(
  data: Record<string, unknown>,
  docType?: string
): Promise<MetadataUploadResponse> {
  return request<MetadataUploadResponse>('/metadata/upload', {
    method: 'POST',
    body: JSON.stringify({ data, doc_type: docType }),
  });
}

export async function getMetadata(id: string): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`/metadata/${id}`);
}

// ── Verifiable Presentations ──────────────────────────────────────────────

export async function createVp(payload: CreateVpRequest): Promise<CreateVpResponse> {
  return request<CreateVpResponse>('/vp/create', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function verifyVp(payload: VerifyVpRequest): Promise<VerifyVpResult> {
  return request<VerifyVpResult>('/vp/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listMyVps(): Promise<{ presentations: VpListItem[] }> {
  return request<{ presentations: VpListItem[] }>('/vp/my');
}

export async function revokeVp(vpId: string): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>(`/vp/${vpId}/revoke`, {
    method: 'POST',
  });
}

export interface VpListItem {
  vp_id: string;
  token_id: number;
  purpose: string;
  issued_at: number;
  expires_at: number;
  status: string;
}
