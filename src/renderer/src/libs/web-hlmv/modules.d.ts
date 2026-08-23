// Allowing import MDL-files
declare module '*.mdl'

declare module 'fast-png'

declare module 'fast-dataview' {
  const FastDataView: {
    new (buffer: ArrayBuffer, byteOffset?: number, byteLength?: number): DataView
  }

  export default FastDataView
}
