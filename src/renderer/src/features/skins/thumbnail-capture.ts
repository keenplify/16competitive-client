/** Firefox can throw synchronously when the canvas loses its graphics context. */
export const captureThumbnail = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Model thumbnail capture returned no image'))
      }, 'image/png')
    } catch (error) {
      reject(error)
    }
  })
