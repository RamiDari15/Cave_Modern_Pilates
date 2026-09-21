export const MOBILE_PHONE_ERROR = "Enter a valid phone number. Include + and the country code for international numbers.";

export function normalizeMobilePhone(value) {
  if (typeof value !== "string") return "";
  const input = value.trim();
  if (!/^\+?[\d\s().-]+$/.test(input) || input.length > 32) return "";

  const digits = input.replace(/\D/g, "");
  if (/^(\d)\1+$/.test(digits)) return "";

  if (digits.length === 11 && digits.startsWith("1")) {
    const nationalNumber = digits.slice(1);
    return /^(\d)\1+$/.test(nationalNumber) ? "" : nationalNumber;
  }
  if (digits.length === 10 && !input.startsWith("+")) return digits;
  if (input.startsWith("+") && !digits.startsWith("0") && !digits.startsWith("1") && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }
  return "";
}
