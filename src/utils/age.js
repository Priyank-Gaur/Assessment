// The minor/adult gate used across the signup and assessment flows. Age is
// whatever the user entered directly, and the category below is derived from
// it automatically — never a manually-picked "I am a minor" toggle, so the
// gate can't be bypassed by mis-selecting an option.

export const MIN_SIGNUP_AGE = 13
export const MAX_SIGNUP_AGE = 120
export const ADULT_AGE = 18

// 'minor' (13-17) requires parent/guardian consent before continuing.
// 'adult' (18+) follows the normal flow. null means unknown/not yet entered.
export const getAgeCategory = (age) => {
  if (age === null || age === undefined || Number.isNaN(age)) return null
  if (age >= MIN_SIGNUP_AGE && age < ADULT_AGE) return 'minor'
  if (age >= ADULT_AGE) return 'adult'
  return null
}
