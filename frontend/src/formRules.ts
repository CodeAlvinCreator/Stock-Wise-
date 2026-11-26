// Every rule a form checks before sending. The messages are the backend's own
// (backend/app/services/passwords.py and validation.py), so a hint shown while
// typing reads the same as the error the server would send back.

export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_BYTES = 72

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const HAS_LETTER = /\p{L}/u
const HAS_DIGIT = /\p{Nd}/u

export function emailProblem(email: string): string | null {
  if (email.trim() === '') return 'email is required'
  if (!EMAIL_PATTERN.test(email.trim())) return 'email is not a valid address'
  return null
}

export function passwordProblem(password: string): string | null {
  // Count characters the way Python does, so an emoji counts as one, not two.
  if ([...password].length < MIN_PASSWORD_LENGTH) return `password must be at least ${MIN_PASSWORD_LENGTH} characters`
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
    return `password must be at most ${MAX_PASSWORD_BYTES} bytes`
  }
  if (!HAS_LETTER.test(password) || !HAS_DIGIT.test(password)) {
    return 'password must include at least one letter and one number'
  }
  return null
}

export function confirmProblem(password: string, confirm: string): string | null {
  return confirm === password ? null : 'the two passwords do not match'
}

export function newPasswordIsValid(password: string, confirm: string): boolean {
  return passwordProblem(password) === null && confirmProblem(password, confirm) === null
}

export type Strength = 'weak' | 'okay' | 'strong'

// A rough hint, not a guarantee: longer passwords with mixed kinds of characters score higher.
export function passwordStrength(password: string): Strength {
  if (passwordProblem(password) !== null) return 'weak'
  const score =
    Number(password.length >= 12) +
    Number(password.length >= 16) +
    Number(/[a-z]/.test(password) && /[A-Z]/.test(password)) +
    Number(/[^\p{L}\p{Nd}]/u.test(password))
  return score >= 2 ? 'strong' : 'okay'
}

// Backend messages start lower case ("password is incorrect"); shown on their own they read better capitalised.
export function sentence(message: string): string {
  return message.charAt(0).toUpperCase() + message.slice(1)
}
