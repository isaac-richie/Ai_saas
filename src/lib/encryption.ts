import CryptoJS from 'crypto-js';

function getSecretKey(): string {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
        throw new Error("ENCRYPTION_KEY is required. Set it in your environment.");
    }
    return key;
}

export function encryptApiKey(plainKey: string): string {
    return CryptoJS.AES.encrypt(plainKey, getSecretKey()).toString();
}

export function decryptApiKey(encryptedKey: string): string {
    const bytes = CryptoJS.AES.decrypt(encryptedKey, getSecretKey());
    return bytes.toString(CryptoJS.enc.Utf8);
}
