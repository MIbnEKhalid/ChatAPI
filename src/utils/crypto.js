import crypto from "crypto";

const ENCRYPTION_SECRET = process.env.API_KEY_ENCRYPTION_SECRET;
const ENCRYPTION_KEY = crypto
  .createHash("sha256")
  .update(ENCRYPTION_SECRET || "mbk-chatapi-default-secret-please-set-env")
  .digest();

// Whether user-provided AI keys are enabled (requires API_KEY_ENCRYPTION_SECRET).
export const USER_KEY_STORAGE_ENABLED = Boolean(ENCRYPTION_SECRET);

export function encryptKey(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plainText), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptKey(encryptedText) {
  if (!encryptedText || typeof encryptedText !== "string") return null;
  const [ivHex, tagHex, encryptedHex] = encryptedText.split(":");
  if (!ivHex || !tagHex || !encryptedHex) return null;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
