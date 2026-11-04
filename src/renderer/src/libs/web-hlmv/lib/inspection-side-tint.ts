import * as THREE from './three'

/** One bounded depth-render identifies inspection-visible triangles, retaining the mask in model space. */
export function tintInspectionSide(
  meshes: THREE.Mesh[],
  renderer: THREE.WebGLRenderer,
  camera: THREE.Camera
): void {
  const scene = new THREE.Scene()
  const target = new THREE.WebGLRenderTarget(512, 512, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter
  })
  const prepared: { mesh: THREE.Mesh; first: number; count: number }[] = []
  let next = 1
  try {
    for (const mesh of meshes) {
      const source = mesh.geometry as THREE.BufferGeometry
      const positions = source.getAttribute('position')
      const colors = new Float32Array(positions.count * 3)
      const first = next
      for (let i = 0; i + 2 < positions.count; i += 3, next++) {
        for (let j = 0; j < 3; j++)
          colors.set(
            [(next & 255) / 255, ((next >> 8) & 255) / 255, ((next >> 16) & 255) / 255],
            (i + j) * 3
          )
      }
      const geometry = new THREE.BufferGeometry()
      geometry.addAttribute('position', positions)
      geometry.addAttribute('uv', source.getAttribute('uv'))
      geometry.addAttribute('color', new THREE.BufferAttribute(colors, 3))
      const map = (mesh.material as THREE.MeshBasicMaterial).map
      const material = new THREE.ShaderMaterial({
        uniforms: { sourceMap: { value: map }, hasMap: { value: Boolean(map) } },
        vertexShader:
          'attribute vec3 color; varying vec3 faceColor; varying vec2 texUv; void main(){faceColor=color; texUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader:
          'uniform sampler2D sourceMap; uniform bool hasMap; varying vec3 faceColor; varying vec2 texUv; void main(){if(hasMap && texture2D(sourceMap,texUv).a<0.5)discard;gl_FragColor=vec4(faceColor,1.0);}',
        side: THREE.DoubleSide,
        blending: THREE.NoBlending
      })
      const clone = new THREE.Mesh(geometry, material)
      clone.matrixAutoUpdate = false
      clone.matrix.copy(mesh.matrixWorld)
      scene.add(clone)
      prepared.push({ mesh, first, count: positions.count })
    }
    const previous = renderer.getRenderTarget()
    const clearColor = renderer.getClearColor().clone(),
      clearAlpha = renderer.getClearAlpha()
    const pixels = new Uint8Array(512 * 512 * 4)
    try {
      renderer.setClearColor(0, 0)
      renderer.setRenderTarget(target)
      renderer.clear()
      renderer.render(scene, camera, target)
      renderer.readRenderTargetPixels(target, 0, 0, 512, 512, pixels)
    } finally {
      renderer.setRenderTarget(previous)
      renderer.setClearColor(clearColor, clearAlpha)
    }
    const visible = new Set<number>()
    for (let i = 0; i < pixels.length; i += 4)
      visible.add(pixels[i] | (pixels[i + 1] << 8) | (pixels[i + 2] << 16))
    for (const { mesh, first, count } of prepared) {
      const geometry = mesh.geometry as THREE.BufferGeometry
      const mask = new Float32Array(count)
      for (let i = 0; i + 2 < count; i += 3) if (visible.has(first + i / 3)) mask.fill(1, i, i + 3)
      geometry.addAttribute('inspectionSide', new THREE.BufferAttribute(mask, 1))
      const material = mesh.material as THREE.MeshBasicMaterial & {
        onBeforeCompile: (shader: { vertexShader: string; fragmentShader: string }) => void
      }
      const original = material.onBeforeCompile
      material.onBeforeCompile = (shader) => {
        original.call(material, shader)
        shader.vertexShader =
          'attribute float inspectionSide; varying float vInspectionSide;\n' + shader.vertexShader
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvInspectionSide = inspectionSide;'
        )
        shader.fragmentShader = 'varying float vInspectionSide;\n' + shader.fragmentShader
        shader.fragmentShader = shader.fragmentShader.replace(
          'gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
          'gl_FragColor = vec4( outgoingLight, diffuseColor.a );\ngl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.82, 0.05), vInspectionSide * 0.48);'
        )
      }
      material.needsUpdate = true
    }
  } finally {
    for (const child of scene.children) {
      const mesh = child as THREE.Mesh
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    }
    target.dispose()
  }
}
