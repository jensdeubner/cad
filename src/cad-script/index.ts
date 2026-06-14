/**
 * cad-script · public barrel
 *
 * The LLM-driven CAD layer recommended by `CAD-LLM-Architektur.md`, adapted to
 * this browser TS + WASM engine. Imports here give the feature module, tests,
 * and any future MCP server one entry point.
 *
 *   import { createCadTools } from './cad-script';
 *   const cad = createCadTools();
 *   cad.run_cad_code('emit(box(20).cut(cylinder(6, 30)), "plate")');
 *   cad.query_geometry({ kind: 'faces', pick: 'max', metricAxis: 'z' }); // topmost face
 *   cad.render_view(['front', 'iso']);
 */
export * from './mesh';
export * from './primitives';
export * from './triangulate';
export * from './sketch';
export * from './csg';
export * from './selectors';
export * from './solid';
export * from './sdf';
export * from './surface-nets';
export * from './errors';
export * from './query';
export * from './render';
export * from './runtime';
export * from './tools';
export { meshToGeometry } from './geometry';
