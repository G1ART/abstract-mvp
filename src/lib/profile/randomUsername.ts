const RANDOM_USERNAME_REGEX = /^user_[a-f0-9]{8}$/i;

export const RANDOM_USERNAME_PROMPTED_KEY = "ab_random_username_prompted";

export function isRandomUsername(username: string | null | undefined): boolean {
  if (!username) return false;
  return RANDOM_USERNAME_REGEX.test(username.trim());
}
