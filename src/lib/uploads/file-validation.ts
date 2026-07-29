import "server-only";

const DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export const PHOTO_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function isAllowedAgentDocumentMimeType(contentType: string) {
  return DOCUMENT_MIME_TYPES.has(contentType);
}

export function isAllowedAgentPhotoMimeType(contentType: string) {
  return PHOTO_MIME_TYPES.has(contentType);
}

function startsWithBytes(buffer: Buffer, signature: readonly number[]) {
  return signature.every((byte, index) => buffer[index] === byte);
}

export function hasExpectedFileSignature(buffer: Buffer, contentType: string) {
  if (buffer.length < 4) return false;

  switch (contentType) {
    case "application/pdf":
      return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
    case "image/jpeg":
      return startsWithBytes(buffer, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return buffer.length >= 12
        && buffer.subarray(0, 4).toString("ascii") === "RIFF"
        && buffer.subarray(8, 12).toString("ascii") === "WEBP";
    case "application/msword":
      return startsWithBytes(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return startsWithBytes(buffer, [0x50, 0x4b, 0x03, 0x04]);
    default:
      return false;
  }
}