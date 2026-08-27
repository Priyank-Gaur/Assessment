// Local persistence for parent/guardian consent so a minor who already
// completed the Parent/Guardian Information & Consent section at signup isn't
// asked again every time they open an assessment. Keyed by email because
// that's the one identifier available both at signup (before a user id
// exists) and later when resuming a session from `currentUser`.
//
// This is a client-side record of consent already captured in the signup/
// assessment flow's own form — it does not replace sending that same data to
// the backend as part of the request payload.

const STORAGE_PREFIX = 'happimynd_guardian_consent:'

const keyFor = (email) => `${STORAGE_PREFIX}${(email || '').trim().toLowerCase()}`

export const emptyGuardianConsent = () => ({
  acknowledged: false,
})

// Whether the acknowledgement checkbox is checked. This is the single source
// of truth for gating signup/quiz-start.
export const isConsentComplete = (consent) => Boolean(consent?.acknowledged)

export const saveGuardianConsent = (email, consent) => {
  if (!email) return
  try {
    localStorage.setItem(
      keyFor(email),
      JSON.stringify({ ...consent, consentedAt: new Date().toISOString() })
    )
  } catch (err) {
    console.error('Error saving guardian consent:', err)
  }
}

export const getGuardianConsent = (email) => {
  if (!email) return null
  try {
    const raw = localStorage.getItem(keyFor(email))
    return raw ? JSON.parse(raw) : null
  } catch (err) {
    console.error('Error reading guardian consent:', err)
    return null
  }
}
