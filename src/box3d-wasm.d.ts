declare module 'box3d-wasm/standard' {
  type Box3DInit = (options?: Record<string, unknown>) => Promise<{
    createWorld: (options?: Record<string, unknown>) => unknown;
    threaded: boolean;
    maxWorkers: number;
  }>;

  const Box3D: Box3DInit;
  export default Box3D;
}
