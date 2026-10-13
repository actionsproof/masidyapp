// One place for the Masidy brand. Never put provider names in user-facing text.
export const BRAND = {
  name: 'Masidy',
  rootDomain: process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? '',
}

// Replaces supplier names in text that came from a supplier (e.g. assistant chat messages).
export const scrub = (t: string) => t.replace(/\bv0\b/gi, BRAND.name).replace(/\bvercel\b/gi, BRAND.name)
