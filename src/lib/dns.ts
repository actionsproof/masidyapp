// Masidy-worded DNS instructions. Values come from your own env, not from the host's raw output.
export function dnsRecords(verification: any[] = []) {
  const recs: { type: string; name: string; value: string }[] = [
    { type: 'CNAME', name: 'www (or the subdomain you use)', value: process.env.DOMAIN_CNAME_TARGET ?? '' },
    { type: 'A', name: '@ (root domain)', value: process.env.DOMAIN_APEX_IP ?? '' },
  ].filter(r => r.value)
  for (const v of verification) if (v?.type === 'TXT') recs.push({ type: 'TXT', name: v.domain, value: v.value })
  return recs
}
