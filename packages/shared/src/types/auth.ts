export interface KDFParams {
  algorithm: 'argon2id';
  memory: number;
  iterations: number;
  parallelism: number;
  keyLength: number;
}

// SRP Registration
export interface SRPRegisterRequest {
  email: string;
  srpSalt: string;
  srpVerifier: string;
  encryptedVaultKey: string;
  vaultKeyNonce: string;
  vaultKeyTag: string;
  kdfParams: KDFParams;
  publicKey?: string;
}

export interface SRPRegisterResponse {
  userId: string;
}

// SRP Login Init
export interface SRPLoginInitRequest {
  email: string;
  clientPublicA: string;
}

export interface SRPLoginInitResponse {
  srpSalt: string;
  serverPublicB: string;
}

// SRP Login Verify
export interface SRPLoginVerifyRequest {
  email: string;
  clientProofM1: string;
}

export interface SRPLoginVerifyResponse {
  sessionToken: string;
  serverProofM2: string;
  encryptedVaultKey: string;
  vaultKeyNonce: string;
  vaultKeyTag: string;
  kdfParams: KDFParams;
}

// Session
export interface Session {
  id: string;
  userId: string;
  deviceName: string;
  ipAddress: string;
  userAgent: string;
  expiresAt: string;
  createdAt: string;
}

// OAuth Connections
export enum ConnectionStatus {
  Active = 'active',
  Expired = 'expired',
  Revoked = 'revoked',
  Error = 'error',
}

export interface AuthConnection {
  id: string;
  userId: string;
  provider: string;
  providerAccountId?: string;
  status: ConnectionStatus;
  scopes: string[];
  accessTokenEnc: string;
  refreshTokenEnc?: string;
  tokenNonce: string;
  tokenTag: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}
