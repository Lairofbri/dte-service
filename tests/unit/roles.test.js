// tests/unit/roles.test.js
// Utilidades de autorización multi-rol (migración 035).

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ordenarRoles,
  rolPrincipal,
  rolesDeUsuario,
  tieneRol,
  puedeAdministrarTenant,
  esRolAdministrador,
} = require('../../src/utils/roles');

test('rolesDeUsuario: tolera filas legadas sin `roles` (cae a [rol])', () => {
  assert.deepEqual(rolesDeUsuario({ rol: 'operador' }), ['operador']);
  assert.deepEqual(rolesDeUsuario({ rol: 'administrador', roles: [] }), ['administrador']);
  assert.deepEqual(rolesDeUsuario({ roles: ['plataforma'] }), ['plataforma']);
  assert.deepEqual(rolesDeUsuario(null), []);
  assert.deepEqual(rolesDeUsuario({}), []);
});

test('ordenarRoles: deduplica y ordena por privilegio', () => {
  assert.deepEqual(ordenarRoles(['operador', 'administrador', 'operador']), ['administrador', 'operador']);
  assert.deepEqual(ordenarRoles(['operador', 'plataforma']), ['plataforma', 'operador']);
  assert.deepEqual(ordenarRoles(['desconocido', 'operador']), ['operador']);
  assert.deepEqual(ordenarRoles(undefined), []);
});

test('rolPrincipal: el de mayor privilegio (administrador > plataforma > operador)', () => {
  assert.equal(rolPrincipal(['operador', 'plataforma']), 'plataforma');
  assert.equal(rolPrincipal(['plataforma', 'administrador']), 'administrador');
  assert.equal(rolPrincipal([]), 'operador');
});

test('tieneRol: comprueba pertenencia (multi-rol y compat con `rol`)', () => {
  const usuario = { roles: ['plataforma', 'operador'] };
  assert.equal(tieneRol(usuario, 'plataforma'), true);
  assert.equal(tieneRol(usuario, 'operador'), true);
  assert.equal(tieneRol(usuario, 'administrador'), false);
  assert.equal(tieneRol(usuario, 'administrador', 'plataforma'), true);
  assert.equal(tieneRol({ rol: 'administrador' }, 'administrador'), true);
});

test('puedeAdministrarTenant: administrador o plataforma administran el tenant', () => {
  assert.equal(puedeAdministrarTenant({ roles: ['administrador'] }), true);
  assert.equal(puedeAdministrarTenant({ roles: ['plataforma'] }), true);
  assert.equal(puedeAdministrarTenant({ roles: ['operador'] }), false);
  assert.equal(puedeAdministrarTenant({ rol: 'administrador' }), true);
  assert.equal(puedeAdministrarTenant(undefined), false);
});

test('esRolAdministrador: estricto (plataforma NO cuenta para último admin)', () => {
  assert.equal(esRolAdministrador({ roles: ['administrador'] }), true);
  assert.equal(esRolAdministrador({ roles: ['administrador', 'plataforma'] }), true);
  assert.equal(esRolAdministrador({ roles: ['plataforma'] }), false);
  assert.equal(esRolAdministrador({ rol: 'operador' }), false);
});
