
export const validatePhoneNumber = (number: string): boolean => {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(number.replace(/\s/g, ''));
};
