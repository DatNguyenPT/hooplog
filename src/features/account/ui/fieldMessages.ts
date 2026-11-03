/** The text for each reason an account form can refuse a field, shared by all of those forms. */
export const EMAIL_MESSAGES = {
  required: 'account.fieldError.emailRequired',
  invalid: 'account.fieldError.emailInvalid',
} as const;

export const PASSWORD_MESSAGES = {
  required: 'account.fieldError.passwordRequired',
  tooShort: 'account.fieldError.passwordTooShort',
  tooLong: 'account.fieldError.passwordTooLong',
  needsLetter: 'account.fieldError.passwordNeedsLetter',
  needsNumber: 'account.fieldError.passwordNeedsNumber',
  sameAsCurrent: 'account.fieldError.passwordSameAsCurrent',
} as const;

export const CONFIRM_MESSAGES = {
  required: 'account.fieldError.confirmRequired',
  mismatch: 'account.fieldError.confirmMismatch',
} as const;

export const CODE_MESSAGES = {
  required: 'account.fieldError.codeRequired',
  invalid: 'account.fieldError.codeInvalid',
} as const;
