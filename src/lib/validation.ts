import { z } from 'zod';

export const registerSchema = z.object({
  first_name: z
    .string()
    .trim()
    .min(1, 'Please enter your first name.')
    .max(50, 'Please enter your first name.')
    .regex(/^[a-zA-Z\-']+$/, 'Please enter your first name.'),
  last_name: z
    .string()
    .trim()
    .min(1, 'Please enter your last name.')
    .max(80, 'Please enter your last name.')
    .regex(/^[a-zA-Z\-']+$/, 'Please enter your last name.'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid email address.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters with a number, uppercase letter, and symbol.')
    .max(128)
    .regex(/[A-Z]/, 'Password must be at least 8 characters with a number, uppercase letter, and symbol.')
    .regex(/[0-9]/, 'Password must be at least 8 characters with a number, uppercase letter, and symbol.')
    .regex(/[!@#$%^&*]/, 'Password must be at least 8 characters with a number, uppercase letter, and symbol.'),
  tos_accepted: z.literal(true, {
    errorMap: () => ({ message: 'You must agree to the Terms of Service to continue.' })
  }),
  marketing_opt_in: z.boolean().optional().default(false)
});

export type RegisterFormValues = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Please enter your password.')
});

export type LoginFormValues = z.infer<typeof loginSchema>;
