export interface Account {
  username: string;
  email: string;
  pinHash: string; // base64 PBKDF2(pin, salt)
  pinSalt: string; // base64
  createdAt: string; // ISO 8601
}

export interface WrappedKeyRecord {
  ciphertext: string; // base64 AES-GCM ciphertext of the API key
  iv: string; // base64 12-byte IV
}

export interface CollectionItem {
  id: string;
  imageBlob: Blob;
  mimeType: string;
  width: number;
  height: number;
  createdAt: string; // ISO 8601
}
