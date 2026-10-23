/**
 * Role resolution. app.js decides the role inline inside onSession():
 *     state.isAdmin = session.user.email.toLowerCase() === ADMIN_EMAIL;
 * This helper expresses that exact rule as a function; clinic-rules.test.ts contains a contract
 * test that fails if the expression in app.js ever changes.
 */
export type Role = 'ADMIN' | 'PATIENT';

export function getRole(email: string, adminEmail: string): Role {
  return email.toLowerCase() === adminEmail ? 'ADMIN' : 'PATIENT';
}
