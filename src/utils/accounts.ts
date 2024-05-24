function sanitizeWebsite(website: string | undefined): string | undefined {
  if (!website) return undefined;

  if (
    'https://'.includes(website) ||
    'http://'.includes(website)
  ) return undefined;

  try {
    // See if 'website' is a valid url
    new URL(website);
    return website;
  } catch (_) {
    try {
      const websiteWithPrefix = 'https://' + website;
      // 'website' could still be a valid url
      // try adding a 'https' prefix to 'website'
      new URL(websiteWithPrefix);

      return websiteWithPrefix;
    } catch (_) {
      // 'website' is not a valid url even with 'https' prefix
      return undefined;
    }
  }
}

export { sanitizeWebsite };
