import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

function ptChecksum(vat: string): boolean {
  if (!/^\d{9}$/.test(vat)) return false
  const d = vat.split('').map(Number)
  // first digit must be valid for PT (1,2,3,5,6,8,9 typically)
  const sum = d[0]*9 + d[1]*8 + d[2]*7 + d[3]*6 + d[4]*5 + d[5]*4 + d[6]*3 + d[7]*2
  const mod = sum % 11
  const check = mod < 2 ? 0 : 11 - mod
  return check === d[8]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const rawCountry = String(body?.country_code ?? '').toUpperCase().trim()
    const rawVat = String(body?.vat_number ?? '').replace(/[\s\-\.]/g, '').toUpperCase().trim()

    if (!rawCountry || !rawVat) {
      return new Response(JSON.stringify({ error: 'missing_country_or_vat' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Strip country prefix if user typed e.g. PT123456789
    const vatDigits = rawVat.startsWith(rawCountry) ? rawVat.slice(rawCountry.length) : rawVat

    let checksum_valid: boolean | null = null
    if (rawCountry === 'PT') {
      checksum_valid = ptChecksum(vatDigits)
    }

    let vies_valid: boolean | null = null
    let name: string | null = null
    let address: string | null = null
    let service_available = true
    let error: string | null = null

    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 8000)
    try {
      const url = `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${encodeURIComponent(rawCountry)}/vat/${encodeURIComponent(vatDigits)}`
      const r = await fetch(url, { signal: controller.signal, headers: { 'Accept': 'application/json' } })
      if (!r.ok) {
        service_available = false
        error = `vies_http_${r.status}`
      } else {
        const j = await r.json().catch(() => null) as any
        if (j && typeof j === 'object') {
          vies_valid = typeof j.isValid === 'boolean' ? j.isValid : (j.valid ?? null)
          name = (j.name ?? j.traderName ?? null) || null
          if (typeof name === 'string') name = name.trim() || null
          const addr = j.address ?? j.traderAddress ?? null
          address = typeof addr === 'string' ? (addr.trim() || null) : (addr ? JSON.stringify(addr) : null)
        } else {
          service_available = false
          error = 'vies_invalid_response'
        }
      }
    } catch (e) {
      service_available = false
      error = (e as Error)?.name === 'AbortError' ? 'vies_timeout' : 'vies_unreachable'
    } finally {
      clearTimeout(t)
    }

    return new Response(
      JSON.stringify({ checksum_valid, vies_valid, name, address, service_available, error }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message || 'internal_error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})