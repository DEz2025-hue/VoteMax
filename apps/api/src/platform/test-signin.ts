import type { PlatformService } from './platform.service';

/** Test helper: staff sign-in is two steps; outside production the first returns the code. */
export async function signIn(svc: PlatformService, email: string, password: string) {
  const step = await svc.login(email, password);
  if (!step.devCode) throw new Error('expected a dev code (is NODE_ENV=production?)');
  return svc.verifyLogin(email, step.devCode);
}
