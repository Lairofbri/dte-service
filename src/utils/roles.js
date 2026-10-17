// src/utils/roles.js
// Utilidades de autorización por roles (soporte multi-rol).
//
// Un usuario puede tener VARIOS roles a la vez (columna `usuarios.roles`).
// `usuarios.rol` se conserva como "rol principal" (legacy) y lo mantiene el
// trigger `sincronizar_roles_usuario` (migración 035): siempre es el primer
// elemento de `roles`, ordenado por privilegio.
//
// REGLAS DE NEGOCIO:
// → `administrador` y `plataforma` administran el tenant (dashboard, usuarios,
//   establecimientos, auditoría, configuración). Un `operador` solo opera su
//   establecimiento fijo.
// → `plataforma` es además el único que hace onboarding (alta de empresas).
// → La protección de "último administrador" SOLO cuenta a `administrador`
//   (no a `plataforma`).

const ROLES_VALIDOS = ['administrador', 'plataforma', 'operador'];

// Orden de privilegio: el primero es el más privilegiado (rol principal).
const PRIORIDAD_ROL = { administrador: 0, plataforma: 1, operador: 2 };

/**
 * Normaliza una lista de roles: deduplica y ordena por privilegio.
 * Devuelve [] si no hay roles válidos.
 */
const ordenarRoles = (roles) => {
  const lista = Array.isArray(roles) ? roles : [];
  return [...new Set(lista)]
    .filter((r) => ROLES_VALIDOS.includes(r))
    .sort((a, b) => PRIORIDAD_ROL[a] - PRIORIDAD_ROL[b]);
};

/**
 * Deriva el rol principal (mayor privilegio) de una lista de roles.
 */
const rolPrincipal = (roles) => ordenarRoles(roles)[0] || 'operador';

/**
 * Roles efectivos de un usuario. Tolera filas legadas sin `roles`
 * (cae a `[rol]`) y objetos que solo traen `rol` (ej: payload de tests).
 */
const rolesDeUsuario = (usuario) => {
  const roles = Array.isArray(usuario?.roles) ? usuario.roles : [];
  if (roles.length > 0) return roles;
  return usuario?.rol ? [usuario.rol] : [];
};

/**
 * ¿El usuario tiene ALGUNO de los roles indicados?
 */
const tieneRol = (usuario, ...roles) => {
  const efectivos = rolesDeUsuario(usuario);
  return roles.some((rol) => efectivos.includes(rol));
};

/**
 * ¿Puede administrar el tenant? (administrador o plataforma)
 */
const puedeAdministrarTenant = (usuario) =>
  tieneRol(usuario, 'administrador', 'plataforma');

/**
 * ¿Tiene el rol `administrador` estricto? (protección de último admin)
 */
const esRolAdministrador = (usuario) => tieneRol(usuario, 'administrador');

module.exports = {
  ROLES_VALIDOS,
  ordenarRoles,
  rolPrincipal,
  rolesDeUsuario,
  tieneRol,
  puedeAdministrarTenant,
  esRolAdministrador,
};
