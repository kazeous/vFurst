export const PRODUCT_CATEGORIES = ["REGISTRATION", "MERCH", "VENDOR_TABLE", "ADD_ON", "DONATION", "SERVICE"] as const;
export type ProductCategoryValue = (typeof PRODUCT_CATEGORIES)[number];

export const REGISTRATION_QUESTION_TYPES = ["SHORT_TEXT", "LONG_TEXT", "CHECKBOX"] as const;
export type RegistrationQuestionTypeValue = (typeof REGISTRATION_QUESTION_TYPES)[number];
