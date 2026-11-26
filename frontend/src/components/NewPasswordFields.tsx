import type { FormError } from '../api'
import { confirmProblem, MIN_PASSWORD_LENGTH, passwordProblem, passwordStrength } from '../formRules'
import { FieldError, FieldMessage } from './FieldError'
import { PasswordInput } from './PasswordInput'

const STRENGTH_LABEL = { weak: 'Weak', okay: 'Okay', strong: 'Strong' }

// Password and "Confirm password" for a new account, checked as the user types.
export function NewPasswordFields({
  idPrefix,
  password,
  confirm,
  onPasswordChange,
  onConfirmChange,
  serverError,
}: {
  idPrefix: string
  password: string
  confirm: string
  onPasswordChange: (value: string) => void
  onConfirmChange: (value: string) => void
  serverError: FormError | null
}) {
  const problem = password === '' ? null : passwordProblem(password)
  const mismatch = confirm === '' ? null : confirmProblem(password, confirm)
  const strength = passwordStrength(password)
  const hintId = `${idPrefix}-password-hint`

  return (
    <>
      <div className="field">
        <label htmlFor={`${idPrefix}-password`}>Password</label>
        <PasswordInput
          id={`${idPrefix}-password`}
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          required
          autoComplete="new-password"
          aria-invalid={problem !== null}
          aria-describedby={hintId}
        />
        <span id={hintId} className="muted small">
          At least {MIN_PASSWORD_LENGTH} characters, with a letter and a number.
          {password !== '' && (
            <>
              {' '}
              Strength: <strong className={`strength strength--${strength}`}>{STRENGTH_LABEL[strength]}</strong>
            </>
          )}
        </span>
        <FieldMessage message={problem} />
        <FieldError error={serverError} field="password" />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-confirm`}>Confirm password</label>
        <PasswordInput
          id={`${idPrefix}-confirm`}
          value={confirm}
          onChange={(e) => onConfirmChange(e.target.value)}
          required
          autoComplete="new-password"
          aria-invalid={mismatch !== null}
        />
        <FieldMessage message={mismatch} />
      </div>
    </>
  )
}
