export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

export function actionError(message: string, fieldErrors?: Record<string, string[]>): ActionResult<never> {
  return { ok: false, message, fieldErrors };
}

export function actionSuccess<T = undefined>(message?: string, data?: T): ActionResult<T> {
  return { ok: true, message, data };
}
