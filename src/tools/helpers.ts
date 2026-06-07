/**
 * Tool-mode predicates shared by pointer routing, gizmo, and orbit controls.
 */
import type { Tool } from '../types';

export function bodyGizmoTool(tool: Tool): boolean {
  return tool === 'move-body' || tool === 'scale-body';
}

export function smoothToolActive(tool: Tool): boolean {
  return tool === 'smooth-body' || tool === 'smooth-section';
}

export function meshSculptTool(tool: Tool): boolean {
  return tool === 'press-pull' || smoothToolActive(tool);
}

export function orbitToolActive(tool: Tool): boolean {
  return tool === 'navigate' || tool === 'align' || tool === 'sketch-pick' || bodyGizmoTool(tool);
}

export function isSketchPrimitiveTool(t: Tool): boolean {
  return (
    t === 'sketch-line' ||
    t === 'sketch-circle' ||
    t === 'sketch-arc' ||
    t === 'sketch-rect' ||
    t === 'sketch-triangle'
  );
}

export function isSketchDrawTool(t: Tool, activeSketchId: string | null): boolean {
  return isSketchPrimitiveTool(t) || (t === 'freehand' && !!activeSketchId);
}

export { toolRequiresActiveSketch, SKETCH_TOOLS_REQUIRE_ACTIVE } from '../sketch-mode/ribbon-state';