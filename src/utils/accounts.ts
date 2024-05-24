function sanitizeWebsite(website: string | undefined): string | undefined {
  if (!website) return undefined;

  try {
    // See if 'website' is a valid url
    new URL(website);
    return website;
  } catch (_) {
    try {
      const prefixed = 'https://' + website;
      // 'website' could still be a valid url
      // try adding a 'https' prefix to 'website'
      new URL(prefixed);

      return prefixed;
    } catch (_) {
      // 'website' is not a valid url even with 'https' prefix
      return undefined;
    }
  }
}

export { sanitizeWebsite };
