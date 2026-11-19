import { z } from 'zod'

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .refine((v) => !/^\d+$/.test(v), 'Password can’t be only numbers')

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})
export type LoginValues = z.infer<typeof loginSchema>

export const signupSchema = z.object({
  company_name: z.string().trim().min(2, 'Company name is required').max(150),
  name: z.string().trim().min(2, 'Your name is required').max(150),
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email'),
  password: passwordSchema,
})
export type SignupValues = z.infer<typeof signupSchema>

export const forgotSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email'),
})
export type ForgotValues = z.infer<typeof forgotSchema>

export const resetSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string().min(1, 'Please confirm your password'),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords don’t match' })
export type ResetValues = z.infer<typeof resetSchema>

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, 'Current password is required'),
    new_password: passwordSchema,
    confirm: z.string().min(1, 'Please confirm your password'),
  })
  .refine((v) => v.new_password === v.confirm, { path: ['confirm'], message: 'Passwords don’t match' })
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>
