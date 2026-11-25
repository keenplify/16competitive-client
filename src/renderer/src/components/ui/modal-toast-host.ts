const dialogs: HTMLDialogElement[] = []
let host: HTMLElement | null = null

function placeToasts(): void {
  if (host) (dialogs[dialogs.length - 1] ?? document.body).appendChild(host)
}

// Native dialog backdrops sit above every body z-index. Keep the same mounted
// toast container in the top dialog so pending toasts survive open and close.
export function registerToastDialog(dialog: HTMLDialogElement): () => void {
  dialogs.push(dialog)
  placeToasts()
  return () => {
    dialogs.splice(dialogs.indexOf(dialog), 1)
    placeToasts()
  }
}

export function attachToastHost(element: HTMLElement): () => void {
  host = element
  placeToasts()
  return () => {
    host = null
    element.remove()
  }
}
