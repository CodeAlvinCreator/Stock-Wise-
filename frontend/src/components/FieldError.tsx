import type { FormError } from '../api'

// Shows the backend's message under the input it is about.
export function FieldError({ error, field }: { error: FormError | null; field: string }) {
  if (!error || error.field !== field) return null
  return (
    <span className="small text-danger" role="alert">
      {error.message}
    </span>
  )
}

// Shows any error that isn't about one of this form's own fields.
export function FormAlert({ error, fields }: { error: FormError | null; fields: string[] }) {
  if (!error || (error.field && fields.includes(error.field))) return null
  return (
    <p className="alert alert--danger" role="alert">
      {error.message}
    </p>
  )
}
