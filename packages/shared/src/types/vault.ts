// Vault item types - these represent the plaintext data BEFORE encryption
// The server only ever sees encrypted blobs

export enum ItemType {
  Login = 'login',
  ApiKey = 'api_key',
  SecureNote = 'secure_note',
  Identity = 'identity',
  Card = 'card',
}

export interface VaultItemBase {
  id: string;
  vaultId: string;
  itemType: ItemType;
  name: string;
  folderId?: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface LoginItem extends VaultItemBase {
  itemType: ItemType.Login;
  uri: string[];
  username: string;
  password: string;
  totpSecret?: string;
  notes?: string;
}

export interface ApiKeyItem extends VaultItemBase {
  itemType: ItemType.ApiKey;
  service: string;
  keyName: string;
  keyValue: string;
  expiresAt?: string;
  notes?: string;
}

export interface SecureNoteItem extends VaultItemBase {
  itemType: ItemType.SecureNote;
  content: string;
}

export interface IdentityItem extends VaultItemBase {
  itemType: ItemType.Identity;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
}

export interface CardItem extends VaultItemBase {
  itemType: ItemType.Card;
  cardholderName: string;
  number: string;
  expMonth: string;
  expYear: string;
  cvv: string;
  brand?: string;
}

export type VaultItem =
  | LoginItem
  | ApiKeyItem
  | SecureNoteItem
  | IdentityItem
  | CardItem;

export interface EncryptedVaultItem {
  id: string;
  vaultId: string;
  itemType: ItemType;
  encryptedData: string;
  nonce: string;
  tag: string;
  uriHash?: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface Vault {
  id: string;
  userId: string;
  name: string;
  vaultType: 'personal' | 'shared';
  createdAt: string;
  updatedAt: string;
}
