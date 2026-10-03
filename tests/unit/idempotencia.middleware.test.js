const test = require('node:test');
const assert = require('node:assert/strict');
const {
  idempotenciaObligatoria,
  esUuidV4,
  extraerOperationId,
} = require('../../src/middlewares/idempotencia.middleware');

const uuidValido = 'a0000000-0000-4000-8000-000000000001';

const mockReq = (opciones = {}) => ({
  headers: opciones.headers || {},
  body: opciones.body || {},
});

const mockRes = () => {
  const res = {};
  res.status = (codigo) => {
    res.statusCode = codigo;
    return res;
  };
  res.json = (cuerpo) => {
    res.cuerpo = cuerpo;
    return res;
  };
  return res;
};

test('esUuidV4 acepta únicamente UUID v4', () => {
  assert.equal(esUuidV4(uuidValido), true);
  assert.equal(esUuidV4('a0000000-0000-4000-8000-000000000001'.toUpperCase()), true);
  assert.equal(esUuidV4('not-a-uuid'), false);
  assert.equal(esUuidV4('a0000000-0000-5000-8000-000000000001'), false); // versión 5
  assert.equal(esUuidV4(null), false);
  assert.equal(esUuidV4({}), false);
});

test('extrae la clave con prioridad al header Idempotency-Key', () => {
  assert.equal(
    extraerOperationId(mockReq({ headers: { 'idempotency-key': uuidValido } })),
    uuidValido
  );
  assert.equal(
    extraerOperationId(mockReq({ body: { operation_id: uuidValido } })),
    uuidValido
  );
  assert.equal(
    extraerOperationId(mockReq({
      headers: { 'idempotency-key': uuidValido },
      body: { operation_id: 'a0000000-0000-4000-8000-000000000002' },
    })),
    uuidValido
  );
  assert.equal(extraerOperationId(mockReq()), null);
});

test('idempotenciaObligatoria adjunta req.operationId normalizado', () => {
  let nextLlamado = false;
  const req = mockReq({
    headers: { 'idempotency-key': uuidValido.toUpperCase() },
  });
  idempotenciaObligatoria(req, mockRes(), () => { nextLlamado = true; });
  assert.equal(nextLlamado, true);
  assert.equal(req.operationId, uuidValido);
});

test('idempotenciaObligatoria rechaza cuando falta la clave', () => {
  const res = mockRes();
  idempotenciaObligatoria(mockReq(), res, () => {
    throw new Error('No debería continuar');
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.cuerpo.ok, false);
});

test('idempotenciaObligatoria rechaza claves sin formato UUID v4', () => {
  const res = mockRes();
  idempotenciaObligatoria(mockReq({ headers: { 'idempotency-key': 'op-123' } }), res, () => {
    throw new Error('No debería continuar');
  });
  assert.equal(res.statusCode, 400);
});