/**
 * Routes pointer input across active Fusion-style solid commands (extrude, revolve, loft).
 */
import {
  cancelExtrude,
  handleExtrudePointerCancel,
  handleExtrudePointerDown,
  handleExtrudePointerMove,
  handleExtrudePointerUp,
  isExtrudeActive,
  type ExtrudeHost,
} from './solid-extrude';
import {
  cancelLoft,
  handleLoftPointerDown,
  handleLoftPointerMove,
  handleLoftPointerUp,
  isLoftActive,
  type LoftHost,
} from './solid-loft';
import {
  cancelRevolve,
  handleRevolvePointerDown,
  handleRevolvePointerMove,
  handleRevolvePointerUp,
  isRevolveActive,
  type RevolveHost,
} from './solid-revolve';

export type SolidCommandHosts = {
  extrude: ExtrudeHost;
  revolve: RevolveHost;
  loft: LoftHost;
};

export function isSolidCommandActive(): boolean {
  return isExtrudeActive() || isRevolveActive() || isLoftActive();
}

export function cancelAllSolidCommands(hosts: SolidCommandHosts) {
  if (isExtrudeActive()) cancelExtrude(hosts.extrude);
  if (isRevolveActive()) cancelRevolve(hosts.revolve);
  if (isLoftActive()) cancelLoft(hosts.loft);
}

export function handleSolidCommandPointerDown(e: PointerEvent, hosts: SolidCommandHosts): boolean {
  if (handleExtrudePointerDown(e, hosts.extrude)) return true;
  if (handleRevolvePointerDown(e, hosts.revolve)) return true;
  if (handleLoftPointerDown(e, hosts.loft)) return true;
  return false;
}

export function handleSolidCommandPointerMove(e: PointerEvent, hosts: SolidCommandHosts): boolean {
  if (handleExtrudePointerMove(e, hosts.extrude)) return true;
  if (handleRevolvePointerMove(e, hosts.revolve)) return true;
  if (handleLoftPointerMove(e, hosts.loft)) return true;
  return false;
}

export function handleSolidCommandPointerUp(e: PointerEvent, hosts: SolidCommandHosts): boolean {
  if (handleExtrudePointerUp(e, hosts.extrude)) return true;
  if (handleRevolvePointerUp(e, hosts.revolve)) return true;
  if (handleLoftPointerUp(e, hosts.loft)) return true;
  return false;
}

export function handleSolidCommandPointerCancel(e: PointerEvent, hosts: SolidCommandHosts): boolean {
  if (handleExtrudePointerCancel(e, hosts.extrude)) return true;
  return false;
}