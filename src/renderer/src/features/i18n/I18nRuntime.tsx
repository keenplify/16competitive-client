import { useEffect, useRef } from 'react'
import { useLanguageStore } from './i18n'
import { translateRuntimeFragment } from './ui-translations-extra'
import { translateRuntimeText } from './ui-translations'

const translatableAttributes = ['aria-label', 'aria-valuetext', 'title', 'placeholder', 'alt'] as const

type TranslatableAttribute = (typeof translatableAttributes)[number]

const shouldSkipElement = (element: Element | null): boolean =>
  Boolean(element?.closest('[data-i18n-skip], script, style, code, pre'))

export function I18nRuntime(): null {
  const language = useLanguageStore((state) => state.language)
  const textSources = useRef(new WeakMap<Text, string>())
  const attributeSources = useRef(new WeakMap<Element, Map<TranslatableAttribute, string>>())

  useEffect(() => {
    const applyingText = new WeakSet<Text>()
    const applyingAttributes = new WeakMap<Element, Set<TranslatableAttribute>>()
    const translate = (source: string): string => {
      const translated = translateRuntimeText(language, source)
      return translated === source ? translateRuntimeFragment(language, source) : translated
    }

    const markAttribute = (element: Element, attribute: TranslatableAttribute): void => {
      const marked = applyingAttributes.get(element) ?? new Set<TranslatableAttribute>()
      marked.add(attribute)
      applyingAttributes.set(element, marked)
    }

    const consumeMarkedAttribute = (
      element: Element,
      attribute: TranslatableAttribute
    ): boolean => {
      const marked = applyingAttributes.get(element)
      if (!marked?.has(attribute)) return false
      marked.delete(attribute)
      if (marked.size === 0) applyingAttributes.delete(element)
      return true
    }

    const translateTextNode = (node: Text, refreshSource = false): void => {
      if (shouldSkipElement(node.parentElement)) return
      const current = node.nodeValue ?? ''
      if (refreshSource || !textSources.current.has(node)) textSources.current.set(node, current)
      const source = textSources.current.get(node) ?? current
      const translated = translate(source)
      if (translated === current) return
      applyingText.add(node)
      node.nodeValue = translated
    }

    const translateAttribute = (
      element: Element,
      attribute: TranslatableAttribute,
      refreshSource = false
    ): void => {
      if (shouldSkipElement(element)) return
      const current = element.getAttribute(attribute)
      if (current === null) return
      let sources = attributeSources.current.get(element)
      if (!sources) {
        sources = new Map<TranslatableAttribute, string>()
        attributeSources.current.set(element, sources)
      }
      if (refreshSource || !sources.has(attribute)) sources.set(attribute, current)
      const source = sources.get(attribute) ?? current
      const translated = translate(source)
      if (translated === current) return
      markAttribute(element, attribute)
      element.setAttribute(attribute, translated)
    }

    const translateElement = (element: Element): void => {
      for (const attribute of translatableAttributes) translateAttribute(element, attribute)
    }

    const translateTree = (root: Node): void => {
      if (root instanceof Text) {
        translateTextNode(root)
        return
      }
      if (!(root instanceof Element || root instanceof DocumentFragment || root instanceof Document)) {
        return
      }
      if (root instanceof Element) translateElement(root)
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
      let current = walker.nextNode()
      while (current) {
        if (current instanceof Text) translateTextNode(current)
        else if (current instanceof Element) translateElement(current)
        current = walker.nextNode()
      }
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          const node = mutation.target
          if (!(node instanceof Text)) continue
          if (applyingText.has(node)) {
            applyingText.delete(node)
            continue
          }
          translateTextNode(node, true)
          continue
        }

        if (mutation.type === 'attributes') {
          const element = mutation.target
          const attribute = mutation.attributeName as TranslatableAttribute | null
          if (!(element instanceof Element) || !attribute) continue
          if (!translatableAttributes.includes(attribute)) continue
          if (consumeMarkedAttribute(element, attribute)) continue
          translateAttribute(element, attribute, true)
          continue
        }

        for (const node of mutation.addedNodes) translateTree(node)
      }
    })

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...translatableAttributes]
    })
    translateTree(document.body)

    return () => observer.disconnect()
  }, [language])

  return null
}
