import * as React from 'react'

type Data = {
  buffer: null | ArrayBuffer
  isLoading: boolean
}

type Actions = {
  setFile: (file: File) => void
  setFileUrl: (fileUrl: string) => void
}

type Props = {
  defaultFileUrl?: string
  children: (data: Data, actions: Actions) => React.ReactNode
}

/**
 * Manages the model buffer
 */
export const FileContainer = (props: Props): React.JSX.Element => {
  const [fileUrl, setFileUrl] = React.useState<string | undefined>(props.defaultFileUrl)
  const [isLoading, setLoadingState] = React.useState(typeof fileUrl === 'string')
  const [buffer, setBuffer] = React.useState<null | ArrayBuffer>(null)

  /** Loads default model file and saves it to state */
  const loadingDemo = async (modelFile: string): Promise<void> => {
    setLoadingState(true)
    console.info('[HLMV] Loading model URL', modelFile)

    try {
      const resp = await fetch(modelFile)
      if (!resp.ok) {
        throw new Error(`Model request failed with status ${resp.status}`)
      }

      const buffer = await resp.arrayBuffer()
      console.info('[HLMV] Model URL loaded', { bytes: buffer.byteLength })
      setBuffer(buffer)
    } catch (error) {
      console.error('[HLMV] Model URL load failed', error)
    } finally {
      setLoadingState(false)
    }
  }

  /** Loads file to buffer */
  const loadFile = (file: File): void => {
    const fileReader = new FileReader()
    console.info('[HLMV] Loading local model', {
      name: file.name,
      size: file.size,
      type: file.type
    })

    fileReader.addEventListener('load', () => {
      if (!(fileReader.result instanceof ArrayBuffer)) {
        console.error('[HLMV] Local model load returned an invalid buffer')
        setLoadingState(false)
        return
      }

      console.info('[HLMV] Local model loaded', { bytes: fileReader.result.byteLength })
      setBuffer(fileReader.result)
      setLoadingState(false)
    })

    fileReader.addEventListener('error', () => {
      console.error('[HLMV] Local model read failed', fileReader.error)
      setLoadingState(false)
    })

    fileReader.addEventListener('abort', () => {
      console.warn('[HLMV] Local model read was cancelled')
      setLoadingState(false)
    })

    fileReader.readAsArrayBuffer(file)
    setLoadingState(true)
  }

  React.useEffect(() => {
    if (typeof fileUrl === 'string') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadingDemo(fileUrl)
    }
  }, [fileUrl])

  return (
    <React.Fragment>
      {props.children(
        { buffer, isLoading },
        {
          setFile: loadFile,
          setFileUrl
        }
      )}
    </React.Fragment>
  )
}
