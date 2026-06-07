import init, {
  parse_stl,
  parse_stl_with_stride,
  loft_contours_json,
  export_binary_stl,
  pack_project,
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
  export_binary_stl,
  pack_project,
  unpack_project,
};
export type { ParsedMesh };