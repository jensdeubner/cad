/**
 * Subtrahieren workflow — pick tool body, then pick scan target.
 */
import type { BodyKind } from './body-kind';
import type { CadBodyId, CadBodyRecord } from './cad-scene';
import { t } from './i18n';

export type SubtractPhase = 'idle' | 'pickTool' | 'pickTarget';

export type SubtractHost = {
  setStatus: (msg: string) => void;
  getBody: (id: CadBodyId) => CadBodyRecord | undefined;
  runSubtract: (toolId: CadBodyId, targetId: CadBodyId) => Promise<void>;
};

let phase: SubtractPhase = 'idle';
let toolBodyId: CadBodyId | null = null;

export function subtractPhase(): SubtractPhase {
  return phase;
}

export function isSubtractPicking(): boolean {
  return phase !== 'idle';
}

export function cancelSubtract(host?: Pick<SubtractHost, 'setStatus'>) {
  phase = 'idle';
  toolBodyId = null;
  host?.setStatus(t('status.subtractCancelled'));
}

export function beginSubtract(host: SubtractHost) {
  phase = 'pickTool';
  toolBodyId = null;
  host.setStatus(t('status.subtractPickTool'));
}

function isToolKind(kind: BodyKind): boolean {
  return kind === 'loft' || kind === 'solid';
}

export function handleSubtractBodyPick(bodyId: CadBodyId, host: SubtractHost): boolean {
  if (phase === 'idle') return false;

  const body = host.getBody(bodyId);
  if (!body?.geometry || !body.meshBuffer) {
    host.setStatus(t('status.subtractNoMesh'));
    return true;
  }

  if (phase === 'pickTool') {
    if (!isToolKind(body.bodyKind)) {
      host.setStatus(t('status.subtractToolKind'));
      return true;
    }
    toolBodyId = bodyId;
    phase = 'pickTarget';
    host.setStatus(t('status.subtractPickTarget', { label: body.label }));
    return true;
  }

  if (phase === 'pickTarget') {
    if (body.bodyKind !== 'scan') {
      host.setStatus(t('status.subtractTargetKind'));
      return true;
    }
    if (toolBodyId === bodyId) {
      host.setStatus(t('status.subtractSameBody'));
      return true;
    }
    const toolId = toolBodyId!;
    phase = 'idle';
    toolBodyId = null;
    void host.runSubtract(toolId, bodyId);
    return true;
  }

  return false;
}