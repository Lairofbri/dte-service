// src/modules/contingencia/contingencia.service.js
// Maneja el proceso completo de contingencia según el manual de Hacienda
// Principio S (SOLID): solo opera datos, no valida ni responde HTTP
//
// FLUJO SEGÚN MANUAL HACIENDA:
// 1. Notificar evento de contingencia (firmado)
// 2. Enviar DTEs en lotes de máximo 100
// 3. Consultar estado de cada lote
// 4. Actualizar estado de DTEs procesados
//
// SEGURIDAD:
// → passwordPri NUNCA se almacena — viene en request, se descarta en finally
// → passwordPri NUNCA aparece en logs
// → Auditoría registra cada operación

const { query, getClient }    = require('../../config/database');
const configuracionService    = require('../configuracion/configuracion.service');
const firmadorService         = require('../firmador/firmador.service');
const haciendaService         = require('../hacienda/hacienda.service');
const { generarCodigoGeneracion, getFechaHoraEmision, formatearNIT } = require('../generador/generador.utils');
const logger = require('../../utils/logger');

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────
const MAX_DTES_POR_LOTE = 100; // Según manual de Hacienda

// ─────────────────────────────────────────────
// HELPER: registrar en auditoría
// ─────────────────────────────────────────────
const registrarAuditoria = async (evento, detalles, ip) => {
  try {
    await query(
      `INSERT INTO auditoria (evento, detalles, ip)
       VALUES ($1, $2, $3)`,
      [evento, JSON.stringify(detalles), ip || null]
    );
  } catch (err) {
    logger.error('Error al registrar auditoría en contingencia', {
      error:  err.message,
      evento,
    });
  }
};

// ─────────────────────────────────────────────
// HELPER: construir JSON del evento de contingencia
// Basado en el esquema contingencia-schema-v3.json
// TODOS los campos requeridos según el esquema
// ─────────────────────────────────────────────
const construirJsonContingencia = ({ config, dtes, datos }) => {
  // Una sola instancia de Date para fTransmision y hTransmision
  // Evita inconsistencias en cambios de día (lección aprendida)
  const { fecEmi: fTransmision, horEmi: hTransmision } = getFechaHoraEmision();
  const codigoGeneracion = generarCodigoGeneracion();

  return {
    identificacion: {
      version:          3, // const según esquema v3
      ambiente:         config.ambiente,
      codigoGeneracion, // UUID en MAYÚSCULAS — generarCodigoGeneracion() ya lo hace
      fTransmision,
      hTransmision,
    },
    emisor: {
      nit:                  formatearNIT(config.nit),
      nombre:               config.nombre,
      // Responsable del proceso de contingencia
      nombreResponsable:    datos.nombre_responsable,
      tipoDocResponsable:   datos.tipo_doc_responsable,
      numeroDocResponsable: datos.num_doc_responsable,
      tipoEstablecimiento:  config.tipo_establecimiento || '02',
      // codEstableMH y codPuntoVenta son opcionales en el esquema
      codEstableMH:         config.codigo_establecimiento || null,
      codPuntoVenta:        config.codigo_punto_venta    || null,
      telefono:             config.telefono || '00000000',
      correo:               config.email    || 'sin@correo.com',
    },
    // detalleDTE: mínimo 1, máximo 1000 según esquema
    // Solo incluimos los campos requeridos: noItem, codigoGeneracion, tipoDoc
    detalleDTE: dtes.map((dte, idx) => ({
      noItem:           idx + 1,
      codigoGeneracion: dte.codigo_generacion.toUpperCase(), // MAYÚSCULAS según esquema
      tipoDoc:          dte.tipo_dte,
    })),
    motivo: {
      // Todos los campos del motivo son requeridos según esquema
      fInicio:            datos.fecha_inicio,
      fFin:               datos.fecha_fin,
      hInicio:            datos.hora_inicio,
      hFin:               datos.hora_fin,
      tipoContingencia:   datos.tipo_contingencia,   // integer enum 1-5
      motivoContingencia: datos.motivo_contingencia,
    },
  };
};

// ═════════════════════════════════════════════
// MÉTODOS DEL SERVICE
// ═════════════════════════════════════════════

/**
 * Obtener todos los DTEs en estado contingencia
 * Ordenados por fecha de emisión para procesarlos en orden cronológico
 */
const obtenerDTEsEnContingencia = async () => {
  const { rows } = await query(
    `SELECT
       d.id, d.tipo_dte, d.codigo_generacion, d.numero_control,
       d.ambiente, d.fecha_emision, d.hora_emision,
       d.total, d.receptor_nombre,
       d.creado_en
     FROM dtes d
     WHERE d.estado = 'contingencia'
     ORDER BY d.fecha_emision ASC, d.hora_emision ASC`
  );

  return {
    total:            rows.length,
    dtes:             rows,
    lotes_necesarios: Math.ceil(rows.length / MAX_DTES_POR_LOTE),
  };
};

/**
 * Proceso completo de notificación de contingencia
 * 1. Obtiene DTEs en contingencia
 * 2. Construye y firma el evento
 * 3. Notifica a Hacienda
 * 4. Envía DTEs en lotes de máximo 100
 * 5. Actualiza estado de cada DTE procesado
 *
 * @param {object} datos    — datos del evento de contingencia
 * @param {string} passwordPri — contraseña del certificado (NUNCA se almacena)
 * @param {string} ip       — IP del cliente para auditoría
 */
const notificarContingencia = async ({ datos, passwordPri, ip }) => {
  try {
    // ── PASO 1: Obtener DTEs en contingencia ──
    const { rows: dtesEnContingencia } = await query(
      `SELECT
         d.id, d.tipo_dte, d.codigo_generacion,
         d.numero_control, d.json_firmado,
         d.fecha_emision, d.ambiente
       FROM dtes d
       WHERE d.estado = 'contingencia'
       ORDER BY d.fecha_emision ASC, d.hora_emision ASC`
    );

    if (dtesEnContingencia.length === 0) {
      throw { status: 404, mensaje: 'No hay DTEs en contingencia para procesar.' };
    }

    logger.info('Iniciando proceso de contingencia', {
      total_dtes:      dtesEnContingencia.length,
      lotes_necesarios: Math.ceil(dtesEnContingencia.length / MAX_DTES_POR_LOTE),
      // NUNCA loguear passwordPri
    });

    // ── PASO 2: Obtener configuración del emisor ──
    const config = await configuracionService.obtenerConfiguracion();

    // ── PASO 3: Construir JSON del evento de contingencia ──
    const jsonContingencia = construirJsonContingencia({
      config,
      dtes: dtesEnContingencia,
      datos,
    });

    // ── PASO 4: Firmar el evento de contingencia ──
    // passwordPri se usa aquí y se descarta — NUNCA se almacena
    const jsonFirmado = await firmadorService.firmarDTE({
      jsonDte:     jsonContingencia,
      passwordPri,
    });

    // ── PASO 5: Notificar evento a Hacienda ──
    const resultadoNotificacion = await haciendaService.notificarContingencia({
      documentoFirmado: jsonFirmado,
    });

    if (resultadoNotificacion.estado !== 'RECIBIDO') {
      throw {
        status:  422,
        mensaje: `Hacienda rechazó el evento de contingencia: ${resultadoNotificacion.observaciones?.join(', ')}`,
      };
    }

    logger.info('Evento de contingencia aceptado por Hacienda', {
      sello:        resultadoNotificacion.sello?.substring(0, 10) + '...',
      total_dtes:   dtesEnContingencia.length,
    });

    await registrarAuditoria('CONTINGENCIA_NOTIFICADA', {
      sello:           resultadoNotificacion.sello,
      total_dtes:      dtesEnContingencia.length,
      tipo_contingencia: datos.tipo_contingencia,
      motivo:          datos.motivo_contingencia,
    }, ip);

    // ── PASO 6: Enviar DTEs en lotes de máximo 100 ──
    // Dividir en lotes y procesar secuencialmente
    const resultadosLotes = [];
    const lotes = [];

    for (let i = 0; i < dtesEnContingencia.length; i += MAX_DTES_POR_LOTE) {
      lotes.push(dtesEnContingencia.slice(i, i + MAX_DTES_POR_LOTE));
    }

    for (let numLote = 0; numLote < lotes.length; numLote++) {
      const lote = lotes[numLote];

      logger.info(`Enviando lote ${numLote + 1} de ${lotes.length}`, {
        dtes_en_lote: lote.length,
      });

      try {
        // Enviar lote a Hacienda usando el servicio de recepción por lotes
        const resultadoLote = await haciendaService.transmitirLote({
          documentos: lote.map((dte) => dte.json_firmado),
          nitEmisor:  formatearNIT(config.nit),
          ambiente:   config.ambiente,
        });

        resultadosLotes.push({
          numero_lote:  numLote + 1,
          codigo_lote:  resultadoLote.codigoLote,
          estado:       resultadoLote.estado,
          dtes_en_lote: lote.length,
        });

        await registrarAuditoria('CONTINGENCIA_LOTE_ENVIADO', {
          numero_lote:  numLote + 1,
          codigo_lote:  resultadoLote.codigoLote,
          dtes_en_lote: lote.length,
        }, ip);

        // Actualizar estado de DTEs del lote a 'transmitido'
        // Usar transacción para garantizar consistencia
        const client = await getClient();
        try {
          await client.query('BEGIN');
          for (const dte of lote) {
            await client.query(
              `UPDATE dtes SET estado = 'transmitido'
               WHERE id = $1 AND estado = 'contingencia'`,
              [dte.id]
            );
          }
          await client.query('COMMIT');
        } catch (errTx) {
          await client.query('ROLLBACK');
          logger.error('Error al actualizar estado de DTEs del lote', {
            error:       errTx.message,
            numero_lote: numLote + 1,
          });
        } finally {
          client.release();
        }

      } catch (errLote) {
        // Si un lote falla no interrumpimos los demás
        logger.error(`Error al enviar lote ${numLote + 1}`, {
          error:        errLote.mensaje || errLote.message,
          dtes_en_lote: lote.length,
        });

        resultadosLotes.push({
          numero_lote:  numLote + 1,
          estado:       'error',
          error:        errLote.mensaje || 'Error al enviar el lote',
          dtes_en_lote: lote.length,
        });
      }
    }

    return {
      evento_notificado:    true,
      sello_contingencia:   resultadoNotificacion.sello,
      total_dtes:           dtesEnContingencia.length,
      total_lotes:          lotes.length,
      lotes:                resultadosLotes,
    };

  } catch (err) {
    if (err.status && err.mensaje) throw err;

    logger.error('Error no controlado en proceso de contingencia', {
      error: err.message,
    });

    throw { status: 500, mensaje: 'Error interno al procesar la contingencia.' };
  } finally {
    // SEGURIDAD: limpiar referencia al passwordPri
    passwordPri = null;
  }
};

/**
 * Consultar estado de un lote enviado a Hacienda
 * Hacienda procesa los lotes de forma asíncrona
 * El cliente puede consultar el estado hasta que estén PROCESADOS
 *
 * @param {string} codigoLote — código devuelto por Hacienda al enviar el lote
 */
const consultarLote = async ({ codigoLote }) => {
  try {
    const resultado = await haciendaService.consultarLote({ codigoLote });

    // Si el lote fue procesado, actualizar estado de DTEs en BD
    if (resultado.procesados?.length > 0) {
      const client = await getClient();
      try {
        await client.query('BEGIN');

        for (const dte of resultado.procesados) {
          await client.query(
            `UPDATE dtes
             SET estado          = 'aceptado',
                 sello_recepcion = $1
             WHERE codigo_generacion = $2
               AND estado IN ('transmitido', 'contingencia')`,
            [
              dte.selloRecibido,
              dte.codigoGeneracion.toLowerCase(), // BD guarda en minúsculas
            ]
          );
        }

        for (const dte of (resultado.rechazados || [])) {
          await client.query(
            `UPDATE dtes
             SET estado           = 'rechazado',
                 errores_hacienda = $1
             WHERE codigo_generacion = $2
               AND estado IN ('transmitido', 'contingencia')`,
            [
              JSON.stringify({
                codigo:      dte.codigoMsg,
                descripcion: dte.descripcionMsg,
              }),
              dte.codigoGeneracion.toLowerCase(),
            ]
          );
        }

        await client.query('COMMIT');

        logger.info('Estado de DTEs del lote actualizado', {
          procesados: resultado.procesados.length,
          rechazados: resultado.rechazados?.length || 0,
        });

      } catch (errTx) {
        await client.query('ROLLBACK');
        logger.error('Error al actualizar estado de DTEs del lote consultado', {
          error: errTx.message,
        });
      } finally {
        client.release();
      }
    }

    return {
      codigo_lote: codigoLote,
      procesados:  resultado.procesados?.length  || 0,
      rechazados:  resultado.rechazados?.length  || 0,
      detalle: {
        procesados: resultado.procesados || [],
        rechazados: resultado.rechazados || [],
      },
    };

  } catch (err) {
    if (err.status && err.mensaje) throw err;

    logger.error('Error al consultar lote en Hacienda', {
      codigo_lote: codigoLote,
      error:       err.message,
    });

    throw { status: 502, mensaje: 'Error al consultar el estado del lote en Hacienda.' };
  }
};

module.exports = {
  obtenerDTEsEnContingencia,
  notificarContingencia,
  consultarLote,
};
