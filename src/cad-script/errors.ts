/**
 * cad-script · actionable errors (§3 of the architecture doc)
 *
 * "Spiel keine rohen Stacktraces zurück, sondern aktionable Fehler." The
 * write→execute→observe→repair loop only closes if the *observe* step hands the
 * agent something it can act on — "Subtraktion ergab einen leeren Körper:
 * überlappen sich Werkzeug und Ziel?" beats a `TypeError` stack every time.
 *
 * `toActionableError` maps raw exceptions (and our own `CadError`s) to a stable
 * `code` plus a short German message with a concrete next step. The code is what
 * the tests assert on; the message is what the user/agent reads.
 */

export type CadErrorCode =
  | 'EMPTY_RESULT'
  | 'EMPTY_PROFILE'
  | 'OPEN_PROFILE'
  | 'NON_MANIFOLD'
  | 'NOT_FOUND'
  | 'UNKNOWN_NAME'
  | 'TYPE_ERROR'
  | 'SYNTAX_ERROR'
  | 'NAN_GEOMETRY'
  | 'NO_OUTPUT'
  | 'RUNTIME_ERROR';

export interface ActionableError {
  code: CadErrorCode;
  /** Short, actionable message (German — matches the app's UI language). */
  message: string;
  /** Optional raw detail for logs (never the only thing shown). */
  detail?: string;
}

/** A domain error raised intentionally by the kernel with an actionable code. */
export class CadError extends Error {
  constructor(readonly code: CadErrorCode, message: string, readonly detail?: string) {
    super(message);
    this.name = 'CadError';
  }
}

const NAMES_HINT =
  'Verfügbar: box, cylinder, sphere, cone, torus, wedge, extrude, revolve, rect, circle, polygon, sdf, emit, query, log.';

/** Translate any thrown value into a stable, actionable error object. */
export function toActionableError(err: unknown): ActionableError {
  if (err instanceof CadError) {
    return { code: err.code, message: err.message, detail: err.detail };
  }

  if (err instanceof SyntaxError) {
    return {
      code: 'SYNTAX_ERROR',
      message: `Syntaxfehler im Skript: ${err.message}. Klammern/Kommas prüfen.`,
      detail: err.message,
    };
  }

  if (err instanceof ReferenceError) {
    const m = /(\w+) is not defined/.exec(err.message);
    const name = m?.[1];
    return {
      code: 'UNKNOWN_NAME',
      message: name
        ? `Unbekannter Name „${name}“. ${NAMES_HINT}`
        : `Unbekannter Name. ${NAMES_HINT}`,
      detail: err.message,
    };
  }

  if (err instanceof TypeError) {
    return {
      code: 'TYPE_ERROR',
      message: `Typfehler: ${err.message}. Argumente und Methodennamen prüfen (z. B. .cut(), .fuse()).`,
      detail: err.message,
    };
  }

  if (err instanceof RangeError) {
    return {
      code: 'NAN_GEOMETRY',
      message: `Wertebereich überschritten: ${err.message}. Auflösung/Größen plausibel wählen.`,
      detail: err.message,
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  return { code: 'RUNTIME_ERROR', message: `Skriptfehler: ${message}`, detail: message };
}

/** Build the canonical actionable message for an empty boolean result. */
export function emptyBooleanError(op: 'cut' | 'fuse' | 'intersect'): CadError {
  const why: Record<typeof op, string> = {
    cut: 'Subtraktion ergab einen leeren Körper — überlappen sich Werkzeug und Ziel überhaupt?',
    fuse: 'Vereinigung ergab keinen Körper — sind beide Eingaben gültig und nicht leer?',
    intersect: 'Schnittmenge ist leer — die Körper berühren sich nicht.',
  };
  return new CadError('EMPTY_RESULT', why[op]);
}
