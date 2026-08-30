// All viewer modules must share this one Three.js module identity. Three.js
// uses instanceof checks while traversing and rendering scene objects.
export * from 'three'
import * as THREE from 'three'

export default THREE
