import { isAxiosError } from 'axios'
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import type { ApiErrorBody } from './types'

export function getApiError(err: unknown): ApiErrorBody['error'] | null {
  if (isAxiosError<ApiErrorBody>(err) && err.response?.data?.error) return err.response.data.error
  return null
}

export function getErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const apiErr = getApiError(err)
  if (apiErr?.message) return apiErr.message
  if (isAxiosError(err)) {
    if (err.code === 'ECONNABORTED') return 'The request timed out. Check your connection and try again.'
    if (!err.response) return 'Unable to reach the server. Check your internet connection.'
  }
  return fallback
}

/** Map DRF field errors onto react-hook-form fields. Returns true if any field error was applied. */
export function applyFieldErrors<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>): boolean {
  const apiErr = getApiError(err)
  // Business-rule errors can point at one field: {"code": "...", "message": "...", "field": "date"}
  if (apiErr && typeof apiErr.field === 'string') {
    setError(apiErr.field as Path<T>, { type: 'server', message: apiErr.message })
    return true
  }
  const fields = apiErr?.fields
  if (!fields) return false
  let applied = false
  for (const [key, val] of Object.entries(fields)) {
    if (key === 'non_field_errors') continue
    const msg = Array.isArray(val) ? val[0] : undefined
    if (msg) {
      setError(key as Path<T>, { type: 'server', message: msg })
      applied = true
    }
  }
  return applied
}
