import type { FormError } from '../api'
import { sentence } from '../formRules'

// Shows the backend's message under the input it is about.
export function FieldError({ error, field }: { error: FormError | null; field: string }) {
  if (!error || error.field !== field) return null
  return <FieldMessage message={error.message} />
}

// One message under an input, from the server or from checking as the user types.
export function FieldMessage({ message, id }: { message: string | null; id?: string }) {
  if (!message) return null
  return (
    <span id={id} className="small text-danger" role="alert">
      {sentence(message)}
    </span>
  )
}

// Shows any error that isn't about one of this form's own fields.
export function FormAlert({ error, fields }: { error: FormError | null; fields: string[] }) {
  if (!error || (error.field && fields.includes(error.field))) return null
  return (
    <p className="alert alert--danger" role="alert">
      {sentence(error.message)}
    </p>
  )
}
