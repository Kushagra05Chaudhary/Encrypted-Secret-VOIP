/**
 * CryptoService - Handles RSA key pair generation, storage, and RSA encryption
 * 
 * Uses Web Crypto API (window.crypto.subtle) - the standard browser API for cryptography
 * This is the browser equivalent of Node.js crypto API (require('crypto'))
 * 
 * Web Crypto API provides:
 * - RSA-OAEP encryption/decryption
 * - RSA key pair generation
 * - JWK format support
 * 
 * Fallback to node-forge for insecure contexts (HTTP/LAN) where Web Crypto API is unavailable
 * 
 * Reference: https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API
 */

import forge from 'node-forge';

const DB_NAME = 'SecureVOIP_Keys';
const DB_VERSION = 1;
const KEY_STORE = 'keyPairs';

// Check for secure context and crypto availability
// Web Crypto API is the standard browser API for cryptographic operations
const isSecureContext = window.isSecureContext || window.location.protocol === 'https:' || window.location.hostname === 'localhost';
const hasWebCrypto = !!(window.crypto && window.crypto.subtle);

class CryptoService {
    constructor() {
        this.db = null;
        this.keyPair = null;
        // Use native Web Crypto if available and secure, otherwise fallback to forge
        this.useNative = isSecureContext && hasWebCrypto;

        console.group('CryptoService Verification');
        console.log(`State: ${this.useNative ? 'Native Web Crypto' : 'Node-Forge Fallback'}`);
        console.log(`isSecureContext: ${isSecureContext} (window.isSecureContext: ${window.isSecureContext})`);
        console.log(`Protocol: ${window.location.protocol}`);
        console.log(`Hostname: ${window.location.hostname}`);
        console.log(`hasWebCrypto: ${hasWebCrypto}`);
        if (window.crypto) console.log(`window.crypto.subtle: ${!!window.crypto.subtle}`);
        console.groupEnd();

        console.log(`CryptoService initializing. Mode: ${this.useNative ? 'Native Web Crypto' : 'Node-Forge Fallback'}`);
        if (!this.useNative) {
            console.warn('Running in insecure context or Web Crypto unavailable. Using pure JS fallback (slower).');
        }
    }

    /**
     * Helper to encode ArrayBuffer to Base64URL (for JWK)
     */
    toBase64Url(buffer) {
        return btoa(String.fromCharCode(...new Uint8Array(buffer)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    /**
     * Helper to decode Base64URL to ArrayBuffer
     */
    fromBase64Url(str) {
        const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
        const padding = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
        const binary = atob(base64 + padding);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    /**
     * Check if crypto is available (always true now with fallback)
     */
    checkCryptoAvailable() {
        return true;
    }

    /**
     * Initialize IndexedDB connection
     */
    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(KEY_STORE)) {
                    db.createObjectStore(KEY_STORE, { keyPath: 'id' });
                }
            };
        });
    }

    /**
     * Store key pair in IndexedDB
     */
    async storeKeyPair(keyPair) {
        if (!this.db) await this.initDB();

        let publicKeyJwk, privateKeyJwk;

        if (this.useNative) {
            publicKeyJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
            privateKeyJwk = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);
        } else {
            // Forge keys are already stored as objects in our wrapper
            // or we export them manually to JWK-like structure for consistency
            publicKeyJwk = this.forgePublicKeyToJwk(keyPair.publicKey);
            privateKeyJwk = this.forgePrivateKeyToJwk(keyPair.privateKey);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([KEY_STORE], 'readwrite');
            const store = transaction.objectStore(KEY_STORE);

            const keyData = {
                id: 'user-keypair',
                publicKey: publicKeyJwk,
                privateKey: privateKeyJwk,
                createdAt: Date.now()
            };

            const request = store.put(keyData);
            request.onsuccess = () => resolve(keyData);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Convert Forge Public Key to JWK
     */
    forgePublicKeyToJwk(publicKey) {
        const n = this.byteArrayToBase64Url(publicKey.n.toByteArray());
        const e = this.byteArrayToBase64Url(publicKey.e.toByteArray());
        return {
            kty: 'RSA',
            n: n,
            e: e,
            alg: 'RSA-OAEP-256',
            ext: true,
            key_ops: ['encrypt']
        };
    }

    /**
     * Convert Forge Private Key to JWK
     */
    forgePrivateKeyToJwk(privateKey) {
        const n = this.byteArrayToBase64Url(privateKey.n.toByteArray());
        const e = this.byteArrayToBase64Url(privateKey.e.toByteArray());
        const d = this.byteArrayToBase64Url(privateKey.d.toByteArray());
        const p = this.byteArrayToBase64Url(privateKey.p.toByteArray());
        const q = this.byteArrayToBase64Url(privateKey.q.toByteArray());
        const dp = this.byteArrayToBase64Url(privateKey.dP.toByteArray());
        const dq = this.byteArrayToBase64Url(privateKey.dQ.toByteArray());
        const qi = this.byteArrayToBase64Url(privateKey.qInv.toByteArray());

        return {
            kty: 'RSA',
            n, e, d, p, q, dp, dq, qi,
            alg: 'RSA-OAEP-256',
            ext: true,
            key_ops: ['decrypt']
        };
    }

    /**
     * Helper to encode byte array to Base64URL
     */
    byteArrayToBase64Url(byteArray) {
        let binary = '';
        const bytes = new Uint8Array(byteArray);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    /**
     * Retrieve key pair from IndexedDB
     */
    async getStoredKeyPair() {
        if (!this.db) await this.initDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([KEY_STORE], 'readonly');
            const store = transaction.objectStore(KEY_STORE);
            const request = store.get('user-keypair');

            request.onsuccess = async () => {
                if (!request.result) {
                    resolve(null);
                    return;
                }

                try {
                    let publicKey, privateKey;

                    if (this.useNative) {
                        publicKey = await window.crypto.subtle.importKey(
                            'jwk',
                            request.result.publicKey,
                            { name: 'RSA-OAEP', hash: 'SHA-256' },
                            true,
                            ['encrypt']
                        );

                        privateKey = await window.crypto.subtle.importKey(
                            'jwk',
                            request.result.privateKey,
                            { name: 'RSA-OAEP', hash: 'SHA-256' },
                            true,
                            ['decrypt']
                        );
                    } else {
                        // Reconstruct forge keys from JWK
                        publicKey = this.jwkToForgePublicKey(request.result.publicKey);
                        privateKey = this.jwkToForgePrivateKey(request.result.privateKey);
                    }

                    resolve({ publicKey, privateKey, publicKeyJwk: request.result.publicKey });
                } catch (error) {
                    console.error('Error importing keys:', error);
                    resolve(null);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Convert JWK to Forge Public Key
     */
    jwkToForgePublicKey(jwk) {
        const n = new forge.jsbn.BigInteger(this.base64UrlToHex(jwk.n), 16);
        const e = new forge.jsbn.BigInteger(this.base64UrlToHex(jwk.e), 16);
        return forge.pki.setRsaPublicKey(n, e);
    }

    /**
     * Convert JWK to Forge Private Key
     */
    jwkToForgePrivateKey(jwk) {
        const n = new forge.jsbn.BigInteger(this.base64UrlToHex(jwk.n), 16);
        const e = new forge.jsbn.BigInteger(this.base64UrlToHex(jwk.e), 16);
        const d = new forge.jsbn.BigInteger(this.base64UrlToHex(jwk.d), 16);
        const p = new forge.jsbn.BigInteger(this.base64UrlToHex(jwk.p), 16);
        const q = new forge.jsbn.BigInteger(this.base64UrlToHex(jwk.q), 16);
        const dP = new forge.jsbn.BigInteger(this.base64UrlToHex(jwk.dp), 16);
        const dQ = new forge.jsbn.BigInteger(this.base64UrlToHex(jwk.dq), 16);
        const qInv = new forge.jsbn.BigInteger(this.base64UrlToHex(jwk.qi), 16);

        return forge.pki.setRsaPrivateKey(n, e, d, p, q, dP, dQ, qInv);
    }

    base64UrlToHex(str) {
        const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
        const padding = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
        const binary = atob(base64 + padding);
        let hex = '';
        for (let i = 0; i < binary.length; i++) {
            let h = binary.charCodeAt(i).toString(16);
            if (h.length === 1) h = '0' + h;
            hex += h;
        }
        return hex;
    }

    /**
     * Generate a new RSA-OAEP key pair
     */
    async generateRSAKeyPair() {
        if (this.useNative) {
            return await window.crypto.subtle.generateKey(
                {
                    name: 'RSA-OAEP',
                    modulusLength: 2048,
                    publicExponent: new Uint8Array([1, 0, 1]),
                    hash: 'SHA-256'
                },
                true,
                ['encrypt', 'decrypt']
            );
        } else {
            return new Promise((resolve, reject) => {
                forge.pki.rsa.generateKeyPair({ bits: 2048, workers: 2 }, (err, keypair) => {
                    if (err) reject(err);
                    else resolve(keypair);
                });
            });
        }
    }

    /**
     * Initialize or retrieve existing RSA key pair
     */
    async initializeKeyPair() {
        await this.initDB();
        const existingKeys = await this.getStoredKeyPair();

        if (existingKeys) {
            this.keyPair = {
                publicKey: existingKeys.publicKey,
                privateKey: existingKeys.privateKey
            };
            console.log('Loaded existing RSA key pair from IndexedDB');
            return existingKeys.publicKeyJwk;
        }

        console.log('Generating new RSA key pair...');
        const newKeyPair = await this.generateRSAKeyPair();
        const stored = await this.storeKeyPair(newKeyPair);

        this.keyPair = newKeyPair;
        console.log('New RSA key pair generated and stored');

        return stored.publicKey;
    }

    /**
     * Encrypt audio data directly using recipient's RSA public key
     * RSA-OAEP can only encrypt ~190 bytes at a time (for 2048-bit keys)
     * So we need to chunk the audio data
     */
    async encryptAudio(audioData, recipientPublicKeyJwk) {
        // RSA-OAEP with 2048-bit key can encrypt max ~190 bytes per chunk
        const MAX_CHUNK_SIZE = 190;
        const audioBytes = new Uint8Array(audioData);
        const chunks = [];

        // Split audio into chunks
        for (let i = 0; i < audioBytes.length; i += MAX_CHUNK_SIZE) {
            const chunk = audioBytes.slice(i, i + MAX_CHUNK_SIZE);
            chunks.push(chunk);
        }

        if (this.useNative) {
            const publicKey = await window.crypto.subtle.importKey(
                'jwk',
                recipientPublicKeyJwk,
                { name: 'RSA-OAEP', hash: 'SHA-256' },
                false,
                ['encrypt']
            );

            // Encrypt each chunk
            const encryptedChunks = await Promise.all(
                chunks.map(chunk =>
                    window.crypto.subtle.encrypt(
                        { name: 'RSA-OAEP' },
                        publicKey,
                        chunk
                    )
                )
            );

            // Combine encrypted chunks with length prefix for each chunk
            // Format: [chunk1_length][chunk1_data][chunk2_length][chunk2_data]...
            const result = [];
            for (const encryptedChunk of encryptedChunks) {
                const lengthBytes = new Uint8Array(4);
                const view = new DataView(lengthBytes.buffer);
                view.setUint32(0, encryptedChunk.byteLength, true); // little-endian
                result.push(lengthBytes);
                result.push(new Uint8Array(encryptedChunk));
            }

            // Flatten into single ArrayBuffer
            const totalLength = result.reduce((sum, arr) => sum + arr.length, 0);
            const combined = new Uint8Array(totalLength);
            let offset = 0;
            for (const arr of result) {
                combined.set(arr, offset);
                offset += arr.length;
            }

            return combined.buffer;
        } else {
            // Forge fallback
            const publicKey = this.jwkToForgePublicKey(recipientPublicKeyJwk);
            const encryptedChunks = [];

            for (const chunk of chunks) {
                const chunkStr = String.fromCharCode.apply(null, chunk);
                const encrypted = publicKey.encrypt(chunkStr, 'RSA-OAEP', {
                    md: forge.md.sha256.create(),
                    mgf1: {
                        md: forge.md.sha256.create()
                    }
                });

                // Convert to ArrayBuffer
                const encryptedBytes = new Uint8Array(encrypted.length);
                for (let i = 0; i < encrypted.length; i++) {
                    encryptedBytes[i] = encrypted.charCodeAt(i);
                }
                encryptedChunks.push(encryptedBytes);
            }

            // Combine with length prefixes
            const result = [];
            for (const encryptedChunk of encryptedChunks) {
                const lengthBytes = new Uint8Array(4);
                const view = new DataView(lengthBytes.buffer);
                view.setUint32(0, encryptedChunk.length, true);
                result.push(lengthBytes);
                result.push(encryptedChunk);
            }

            const totalLength = result.reduce((sum, arr) => sum + arr.length, 0);
            const combined = new Uint8Array(totalLength);
            let offset = 0;
            for (const arr of result) {
                combined.set(arr, offset);
                offset += arr.length;
            }

            return combined.buffer;
        }
    }

    /**
     * Decrypt audio data directly using own RSA private key
     */
    async decryptAudio(encryptedData) {
        if (!this.keyPair?.privateKey) {
            throw new Error('Private key not available');
        }

        // Parse chunks: [length][data][length][data]...
        const encryptedBytes = new Uint8Array(encryptedData);
        const chunks = [];
        let offset = 0;

        while (offset < encryptedBytes.length) {
            if (offset + 4 > encryptedBytes.length) {
                throw new Error('Invalid encrypted data format');
            }

            const view = new DataView(encryptedBytes.buffer, offset, 4);
            const chunkLength = view.getUint32(0, true); // little-endian
            offset += 4;

            if (offset + chunkLength > encryptedBytes.length) {
                throw new Error('Invalid chunk length');
            }

            const chunk = encryptedBytes.slice(offset, offset + chunkLength);
            chunks.push(chunk);
            offset += chunkLength;
        }

        if (this.useNative) {
            // Decrypt each chunk
            const decryptedChunks = await Promise.all(
                chunks.map(chunk =>
                    window.crypto.subtle.decrypt(
                        { name: 'RSA-OAEP' },
                        this.keyPair.privateKey,
                        chunk
                    )
                )
            );

            // Combine decrypted chunks
            const totalLength = decryptedChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
            const combined = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of decryptedChunks) {
                combined.set(new Uint8Array(chunk), offset);
                offset += chunk.byteLength;
            }

            return combined.buffer;
        } else {
            // Forge fallback
            const decryptedChunks = [];

            for (const chunk of chunks) {
                const chunkStr = String.fromCharCode.apply(null, chunk);
                const decrypted = this.keyPair.privateKey.decrypt(chunkStr, 'RSA-OAEP', {
                    md: forge.md.sha256.create(),
                    mgf1: {
                        md: forge.md.sha256.create()
                    }
                });

                // Convert to ArrayBuffer
                const decryptedBytes = new Uint8Array(decrypted.length);
                for (let i = 0; i < decrypted.length; i++) {
                    decryptedBytes[i] = decrypted.charCodeAt(i);
                }
                decryptedChunks.push(decryptedBytes);
            }

            // Combine decrypted chunks
            const totalLength = decryptedChunks.reduce((sum, arr) => sum + arr.length, 0);
            const combined = new Uint8Array(totalLength);
            let offset = 0;
            for (const arr of decryptedChunks) {
                combined.set(arr, offset);
                offset += arr.length;
            }

            return combined.buffer;
        }
    }

    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    getKeyPair() {
        return this.keyPair;
    }

    async clearKeys() {
        if (!this.db) await this.initDB();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([KEY_STORE], 'readwrite');
            const store = transaction.objectStore(KEY_STORE);
            const request = store.delete('user-keypair');
            request.onsuccess = () => {
                this.keyPair = null;
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * ------------------------------------------------------------------------
     * HYBRID ENCRYPTION (AES-256-GCM + RSA-OAEP)
     * ------------------------------------------------------------------------
     */

    /**
     * Generate a random AES-256-GCM session key
     */
    async generateSessionKey() {
        if (this.useNative) {
            return await window.crypto.subtle.generateKey(
                {
                    name: 'AES-GCM',
                    length: 256
                },
                true,
                ['encrypt', 'decrypt']
            );
        } else {
            // Forge fallback
            return forge.random.getBytesSync(32); // 256 bits
        }
    }

    /**
     * Export AES key to raw format (for transmission)
     */
    async exportSessionKey(key) {
        if (this.useNative) {
            const raw = await window.crypto.subtle.exportKey('raw', key);
            return raw;
        } else {
            // Forge key is already a string/buffer
            return key;
        }
    }

    /**
     * Import AES key from raw format
     */
    async importSessionKey(rawKey) {
        if (this.useNative) {
            return await window.crypto.subtle.importKey(
                'raw',
                rawKey,
                'AES-GCM',
                true,
                ['encrypt', 'decrypt']
            );
        } else {
            return rawKey;
        }
    }

    /**
     * Encrypt the session key with recipient's RSA public key (for exchange)
     */
    async encryptSessionKey(sessionKey, recipientPublicKeyJwk) {
        // Export session key first
        const rawKey = await this.exportSessionKey(sessionKey);

        // Use existing RSA encryption logic
        // We wrap it in an ArrayBuffer to match the interface
        const keyData = rawKey instanceof ArrayBuffer ? rawKey : this.base64ToArrayBuffer(btoa(rawKey));
        return await this.encryptAudio(keyData, recipientPublicKeyJwk);
    }

    /**
     * Decrypt the session key with own RSA private key
     */
    async decryptSessionKey(encryptedSessionKey) {
        const rawKeyBuffer = await this.decryptAudio(encryptedSessionKey);
        // Import back to CryptoKey object
        return await this.importSessionKey(rawKeyBuffer);
    }

    /**
     * Encrypt audio using AES-256-GCM
     * Much faster and supports larger payloads than RSA
     * Returns: [IV (12 bytes) + Ciphertext]
     */
    async encryptAudioAES(audioData, sessionKey) {
        // IV must be unique for every encryption
        // 12 bytes is standard for AES-GCM
        let iv;

        if (this.useNative) {
            iv = window.crypto.getRandomValues(new Uint8Array(12));
            const encrypted = await window.crypto.subtle.encrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                sessionKey,
                audioData // Float32Array or ArrayBuffer
            );

            // Combine IV + Encrypted Data
            const result = new Uint8Array(iv.length + encrypted.byteLength);
            result.set(iv, 0);
            result.set(new Uint8Array(encrypted), iv.length);
            return result.buffer;
        } else {
            // Forge Fallback
            iv = forge.random.getBytesSync(12);
            const cipher = forge.cipher.createCipher('AES-GCM', sessionKey);
            cipher.start({
                iv: iv,
                tagLength: 128 // 16 bytes tag
            });

            // Audio data to binary string
            const inputBytes = new Uint8Array(audioData.buffer || audioData);
            let inputStr = '';
            for (let i = 0; i < inputBytes.length; i++) inputStr += String.fromCharCode(inputBytes[i]);

            cipher.update(forge.util.createBuffer(inputStr));
            cipher.finish();

            const encrypted = cipher.output.getBytes();
            const tag = cipher.mode.tag.getBytes();

            // Forge output is binary string, convert to ArrayBuffer
            // Format: IV (12) + Encrypted + Tag (16)
            const ivBytes = new Uint8Array(iv.length);
            for (let i = 0; i < iv.length; i++) ivBytes[i] = iv.charCodeAt(i);

            const encBytes = new Uint8Array(encrypted.length);
            for (let i = 0; i < encrypted.length; i++) encBytes[i] = encrypted.charCodeAt(i);

            const tagBytes = new Uint8Array(tag.length);
            for (let i = 0; i < tag.length; i++) tagBytes[i] = tag.charCodeAt(i);

            const result = new Uint8Array(ivBytes.length + encBytes.length + tagBytes.length);
            result.set(ivBytes, 0);
            result.set(encBytes, ivBytes.length);
            result.set(tagBytes, ivBytes.length + encBytes.length);

            return result.buffer;
        }
    }

    /**
     * Decrypt audio using AES-256-GCM
     * Extracts IV from first 12 bytes
     */
    async decryptAudioAES(data, sessionKey) {
        const fullBuffer = new Uint8Array(data);

        if (this.useNative) {
            // Extract IV
            const iv = fullBuffer.slice(0, 12);
            const ciphertext = fullBuffer.slice(12);

            return await window.crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                sessionKey,
                ciphertext
            );
        } else {
            // Forge Fallback
            const iv = fullBuffer.slice(0, 12);
            // In Forge GCM, tag is usually appended to ciphertext or separate
            // Here we assume standard append: IV + Ciphertext + Tag
            const tagLength = 16;
            const ciphertext = fullBuffer.slice(12, fullBuffer.length - tagLength);
            const tag = fullBuffer.slice(fullBuffer.length - tagLength);

            // Convert to binary strings
            let ivStr = '';
            for (let i = 0; i < iv.length; i++) ivStr += String.fromCharCode(iv[i]);

            let cipherStr = '';
            for (let i = 0; i < ciphertext.length; i++) cipherStr += String.fromCharCode(ciphertext[i]);

            let tagStr = '';
            for (let i = 0; i < tag.length; i++) tagStr += String.fromCharCode(tag[i]);

            const decipher = forge.cipher.createDecipher('AES-GCM', sessionKey);
            decipher.start({
                iv: ivStr,
                tagLength: 128,
                tag: forge.util.createBuffer(tagStr)
            });

            decipher.update(forge.util.createBuffer(cipherStr));
            const success = decipher.finish();

            if (!success) throw new Error('Auth tag mismatch');

            const decrypted = decipher.output.getBytes();
            const result = new Uint8Array(decrypted.length);
            for (let i = 0; i < decrypted.length; i++) result[i] = decrypted.charCodeAt(i);

            return result.buffer;
        }
    }
}

export const cryptoService = new CryptoService();
export default cryptoService;
