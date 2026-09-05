export type { NewsPost } from '../../../../shared/news'

export const readableNewsContent = (html: string): string => {
  const document = new DOMParser().parseFromString(html, 'text/html')
  document.body.querySelectorAll('br').forEach((element) => element.replaceWith('\n'))
  document.body.querySelectorAll('p, li').forEach((element) => element.append('\n'))
  return (
    document.body.textContent
      ?.replace(/[ \t]+/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() ?? ''
  )
}
