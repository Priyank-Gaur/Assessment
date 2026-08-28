import './ParentGuardianConsent.css'

// Shown by host pages (not this component) next to whatever "continue" action
// is blocked until the section above is complete.
export const GUARDIAN_CONSENT_BLOCKED_MESSAGE =
  'Please acknowledge the consent statement above before continuing.'

// Every literal string this component renders through `tx()`. Host pages
// (AuthPage, QuizAttempt) spread this into their own translation batch so the
// section is localized consistently wherever it appears, instead of only
// translating whatever strings that page already happens to render.
export const GUARDIAN_CONSENT_STRINGS = [
  'I confirm that I have informed my parent/guardian about my use of the HappiMynd platform and the emotional wellness assessment/quiz. I understand that the assessment is intended for self-awareness and emotional wellbeing and is not a clinical diagnosis. I have obtained my parent/guardian’s consent to proceed with the assessment/quiz.',
  'Please acknowledge the consent statement to continue.',
  GUARDIAN_CONSENT_BLOCKED_MESSAGE,
]

// Parent/Guardian Consent — the mandatory acknowledgement shown for users
// aged 13-17, wherever a minor reaches signup or an assessment/quiz.
// Fully controlled: the caller owns `value` and decides when the section is
// shown (based on age) and whether the surrounding flow may proceed
// (via isConsentComplete from utils/guardianConsent).
function ParentGuardianConsent({ value, onChange, showValidation, tx = (s) => s }) {
  const setAcknowledged = (e) => {
    onChange({ ...value, acknowledged: e.target.checked })
  }

  return (
    <section className="guardian-consent">
      <label className="guardian-consent__checkbox-row">
        <input
          type="checkbox"
          checked={Boolean(value.acknowledged)}
          onChange={setAcknowledged}
          required
        />
        <span>
          {tx('I confirm that I have informed my parent/guardian about my use of the HappiMynd platform and the emotional wellness assessment/quiz. I understand that the assessment is intended for self-awareness and emotional wellbeing and is not a clinical diagnosis. I have obtained my parent/guardian’s consent to proceed with the assessment/quiz.')}
        </span>
      </label>
      {showValidation && !value.acknowledged && (
        <p className="guardian-consent__error">{tx('Please acknowledge the consent statement to continue.')}</p>
      )}
    </section>
  )
}

export default ParentGuardianConsent
