import { createRoot } from 'react-dom/client'
import { ModelViewer } from '../src/renderer/src/libs/web-hlmv/ui/ModelViewer'
import {
  getSkinCameraDistanceMultiplier,
  getSkinCameraTarget,
  getSkinPresentationRotation
} from '../src/renderer/src/features/skins/skin-model-presentation'

const root = createRoot(document.getElementById('preview')!)

const cropToCard = (source: HTMLCanvasElement): string => {
  const { width, height } = source
  const snapshot = document.createElement('canvas')
  snapshot.width = width
  snapshot.height = height
  const context = snapshot.getContext('2d')
  if (!context) throw new Error('Could not read rendered model')
  context.drawImage(source, 0, 0)
  const pixels = context.getImageData(0, 0, width, height).data
  let left = width,
    top = height,
    right = -1,
    bottom = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] < 12) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }
  if (right < left) throw new Error('Rendered model is blank')
  const output = document.createElement('canvas')
  output.width = 512
  output.height = 256
  const target = output.getContext('2d')!
  const objectWidth = right - left + 1
  const objectHeight = bottom - top + 1
  const scale = Math.min(460 / objectWidth, 210 / objectHeight)
  const drawWidth = objectWidth * scale
  const drawHeight = objectHeight * scale
  target.drawImage(
    snapshot,
    left,
    top,
    objectWidth,
    objectHeight,
    (output.width - drawWidth) / 2,
    (output.height - drawHeight) / 2,
    drawWidth,
    drawHeight
  )
  return output.toDataURL('image/png')
}

declare global {
  interface Window {
    renderWeaponPreview: (file: string, rotation?: [number, number, number]) => Promise<string>
  }
}

window.renderWeaponPreview = async (file, rotation) => {
  if (!/^p_[a-z0-9_]+\.mdl$/.test(file)) throw new Error('Invalid model name')
  const response = await fetch(new URL(`../__weapon_model/${file}`, window.location.href))
  if (!response.ok) throw new Error(`Could not read ${file}: ${response.status}`)
  const modelBuffer = await response.arrayBuffer()
  const weaponKey = file.slice(2, -4) === 'mp5' ? 'mp5navy' : file.slice(2, -4)

  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out rendering ${file}`)), 15000)
    root.render(
      <ModelViewer
        key={`${file}:${rotation?.join(',') ?? 'default'}`}
        modelBuffer={modelBuffer}
        modelKey={file}
        presentationRotation={rotation ?? getSkinPresentationRotation(weaponKey)}
        camera={{
          distanceMultiplier: getSkinCameraDistanceMultiplier(weaponKey, 1.1),
          target: getSkinCameraTarget(weaponKey)
        }}
        animation="idle1"
        maxFrameRate={20}
        cameraLocked
        onFirstFrame={(canvas) => {
          clearTimeout(timeout)
          try {
            resolve(cropToCard(canvas))
          } catch (error) {
            reject(error)
          }
        }}
        onLoadError={(error) => {
          clearTimeout(timeout)
          reject(error)
        }}
      />
    )
  })
}
