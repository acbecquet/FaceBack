export interface CollectionItem {
  id: string;
  imageBlob: Blob;
  mimeType: string;
  width: number;
  height: number;
  createdAt: string; // ISO 8601
}
