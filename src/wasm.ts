import init, {
  parse_stl,
  parse_stl_with_stride,
  loft_contours_json,
  revolve_contour_json,
  mesh_boolean_subtract_json,
  mesh_boolean_union_json,
  export_binary_stl,
  pack_project,
  pack_project_multi,
  unpack_project,
  type ParsedMesh,
} from '../wasm-stl/pkg/wasm_stl';

let ready = false;

export async function initWasm(): Promise<void> {
  if (ready) return;
  await init();
  ready = true;
}

export {
  parse_stl,
  parse_stl_with_stride,
  loft_contours_json,
  revolve_contour_json,
  mesh_boolean_subtract_json,
  mesh_boolean_union_json,
  export_binary_stl,
  pack_project,
  pack_project_multi,
  unpack_project,
};
export type { ParsedMesh };