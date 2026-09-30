let deferredForSession = false

export const isMatchSurveyDeferredForSession = (): boolean => deferredForSession

export const deferMatchSurveyForSession = (): void => {
  deferredForSession = true
}
