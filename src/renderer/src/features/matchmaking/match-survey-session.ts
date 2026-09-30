const SURVEY_DEFER_KEY = '16competitive.match-survey.deferred-this-session'

export const isMatchSurveyDeferredForSession = (): boolean =>
  window.sessionStorage.getItem(SURVEY_DEFER_KEY) === '1'

export const deferMatchSurveyForSession = (): void => {
  window.sessionStorage.setItem(SURVEY_DEFER_KEY, '1')
}
