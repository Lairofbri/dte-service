// src/config/crypto.js
// Encriptación de credenciales sensibles en BD (usuario_hacienda, password_hacienda).
//
// SEGURIDAD:
// → AES-256-GCM: cifrado autenticado (detecta manipulación del ciphertext).
// → KDF basado en scrypt (password → clave de 256 bits).
// → Salt e IV aleatorios por operación.
// → Formato versionado: "enc:v2:<salt>:<iv>:<authTag>:<ciphertext>".
// → Compatibilidad temporal con el formato anterior (CryptoJS AES) SOLO para
//   descifrar datos existentes. No se genera nuevo contenido en formato viejo.
//
// REGLA DE ORO: ENCRYPTION_KEY vive SOLO en variables de entorno (o Secret
// Manager) — nunca en código, logs ni respuestas HTTP.

const crypto = require('crypto');
const CryptoJS = require('crypto-js');
const { ENCRYPTION_KEY } = require('./env');

const PREFIJO_V2 = 'enc:v2:';

/**
 * Deriva una clave AES-256 a partir de la ENCRYPTION_KEY usando scrypt.
 * @param {Buffer} salt — salt de 16 bytes aleatorio por operación
 * @returns {Buffer} clave de 32 bytes
 */
const derivarClave = (salt) =>
  crypto.scryptSync(ENCRYPTION_KEY, salt, 32);

/**
 * Encripta un texto usando AES-256-GCM.
 * @param {string} texto — valor a encriptar
 * @returns {string|null} — formato "enc:v2:salt:iv:tag:ciphertext" en base64
 */
const encriptar = (texto) => {
  if (!texto) return null;
  try {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const clave = derivarClave(salt);

    const cipher = crypto.createCipheriv('aes-256-gcm', clave, iv);
    const ciphertext = Buffer.concat([cipher.update(String(texto), 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return PREFIJO_V2 + [
      salt.toString('base64'),
      iv.toString('base64'),
      authTag.toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');
  } catch (err) {
    throw new Error('Error al encriptar: ' + err.message);
  }
};

/**
 * Desencripta un texto cifrado con AES-256-GCM (formato v2).
 * @param {string} textoEncriptado — formato "enc:v2:..."
 * @returns {string} texto original
 */
const desencriptarV2 = (textoEncriptado) => {
  const resto = textoEncriptado.slice(PREFIJO_V2.length);
  const [saltB64, ivB64, tagB64, dataB64] = resto.split(':');
  if (!saltB64 || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Formato de cifrado v2 inválido.');
  }

  const salt = Buffer.from(saltB64, 'base64');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const clave = derivarClave(salt);

  const decipher = crypto.createDecipheriv('aes-256-gcm', clave, iv);
  decipher.setAuthTag(authTag);
  const texto = Buffer.concat([decipher.update(data), decipher.final()]);
  return texto.toString('utf8');
};

/**
 * Desencripta datos en el formato ANTERIOR (CryptoJS AES con password).
 * Solo para migración de datos existentes. Nunca se usa para encriptar.
 * @param {string} textoEncriptado — ciphertext CryptoJS
 * @returns {string} texto original
 */
const desencriptarLegacy = (textoEncriptado) => {
  const bytes = CryptoJS.AES.decrypt(textoEncriptado, ENCRYPTION_KEY);
  const resultado = bytes.toString(CryptoJS.enc.Utf8);
  if (!resultado) {
    throw new Error('Desencriptación legacy produjo resultado vacío — clave incorrecta?');
  }
  return resultado;
};

const desencriptar = (textoEncriptado) => {
  if (!textoEncriptado) return null;
  try {
    if (textoEncriptado.startsWith(PREFIJO_V2)) {
      return desencriptarV2(textoEncriptado);
    }
    // Compatibilidad: formato CryptoJS anterior
    return desencriptarLegacy(textoEncriptado);
  } catch (err) {
    throw new Error('Error al desencriptar: ' + err.message);
  }
};

module.exports = { encriptar, desencriptar };