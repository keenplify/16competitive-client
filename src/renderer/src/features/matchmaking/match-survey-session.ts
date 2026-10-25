const SURVEY_DEFER_KEY = '16competitive.match-survey.deferred-this-session'

const surveyKey = (playerId: string, matchId: string): string =>
  `${SURVEY_DEFER_KEY}:${playerId}:${matchId}`

export const isMatchSurveyDeferredForSession = (playerId: string, matchId: string): boolean =>
  window.sessionStorage.getItem(surveyKey(playerId, matchId)) === '1'

export const deferMatchSurveyForSession = (playerId: string, matchId: string): void =>
  window.sessionStorage.setItem(surveyKey(playerId, matchId), '1')

export const reopenMatchSurveyForSession = (playerId: string, matchId: string): void =>
  window.sessionStorage.removeItem(surveyKey(playerId, matchId))
