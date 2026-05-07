// src/config/crypto.js
// Encriptación AES-256 para credenciales sensibles en BD
// Se usa para: usuario_hacienda, password_hacienda
// La contraseña del certificado NUNCA se almacena — viene en cada request
//
// REGLA DE ORO: ENCRYPTION_KEY vive SOLO en variables de entorno
// nunca en código, nunca en logs, nunca en respuestas HTTP

const CryptoJS = require('crypto-js');
const { ENCRYPTION_KEY } = require('./env');

/**
 * Encripta un texto usando AES-256
 * @param {string} texto — valor a encriptar
 * @returns {string} — texto encriptado en base64
 */
const encriptar = (texto) => {
  if (!texto) return null;
  try {
    return CryptoJS.AES.encrypt(texto, ENCRYPTION_KEY).toString();
  } catch (err) {
    throw new Error('Error al encriptar: ' + err.message);
  }
};

/**
 * Desencripta un texto encriptado con AES-256
 * @param {string} textoEncriptado — valor encriptado en base64
 * @returns {string} — texto original
 */
const desencriptar = (textoEncriptado) => {
  if (!textoEncriptado) return null;
  try {
    const bytes = CryptoJS.AES.decrypt(textoEncriptado, ENCRYPTION_KEY);
    const resultado = bytes.toString(CryptoJS.enc.Utf8);
    if (!resultado) {
      throw new Error('Desencriptación produjo resultado vacío — clave incorrecta?');
    }
    return resultado;
  } catch (err) {
    throw new Error('Error al desencriptar: ' + err.message);
  }
};

module.exports = { encriptar, desencriptar };
