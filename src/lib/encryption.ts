import CryptoJS from 'crypto-js';

const SECRET_KEY = process.env.ENCRYPTION_KEY || 'default_secret_key_for_development_replace_me';

export function encryptApiKey(plainKey: string): string {
    return CryptoJS.AES.encrypt(plainKey, SECRET_KEY).toString();
}

export function decryptApiKey(encryptedKey: string): string {
    const bytes = CryptoJS.AES.decrypt(encryptedKey, SECRET_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
}
