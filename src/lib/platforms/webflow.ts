/**
 * Webflow Localization API support.
 * Uses Webflow's REST API v2 to fetch and push locale strings.
 *
 * Requires in pronto.config.yml:
 *   webflow_site_id: <site-id>
 *   webflow_api_token: <token>   (or WEBFLOW_API_TOKEN env var)
 *
 * Webflow localization API:
 * - GET /sites/{siteId}/locales — list configured locales
 * - GET /pages/{pageId}/dom — get page DOM with locale content
 * - PUT /pages/{pageId}/dom — push translated content
 * - CMS: GET/PUT /collections/{collectionId}/items/{itemId}/locales/{localeId}
 */

export interface WebflowLocale {
  id: string
  cmsLocaleId: string
  tag: string           // e.g. "es", "ja"
  displayName: string
  primary: boolean
}

export interface WebflowStringItem {
  key: string           // node id or field path
  value: string
  context?: string      // page name, collection name
}

const WEBFLOW_API = 'https://api.webflow.com/v2'

function getToken(config: { webflow_api_token?: string }): string {
  const token = config.webflow_api_token ?? process.env.WEBFLOW_API_TOKEN
  if (!token) throw new Error('Webflow API token not set. Add webflow_api_token to pronto.config.yml or set WEBFLOW_API_TOKEN env var.')
  return token
}

export async function getWebflowLocales(siteId: string, token: string): Promise<WebflowLocale[]> {
  const res = await fetch(`${WEBFLOW_API}/sites/${siteId}/locales`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Webflow API error ${res.status}: ${await res.text()}`)
  const data = await res.json() as { locales?: WebflowLocale[] }
  return data.locales ?? []
}

export async function getWebflowPages(siteId: string, token: string): Promise<{ id: string; slug: string; title: string }[]> {
  const res = await fetch(`${WEBFLOW_API}/sites/${siteId}/pages`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Webflow API error ${res.status}: ${await res.text()}`)
  const data = await res.json() as { pages?: { id: string; slug: string; title: string }[] }
  return data.pages ?? []
}

export async function getPageStrings(pageId: string, localeId: string, token: string): Promise<WebflowStringItem[]> {
  const res = await fetch(`${WEBFLOW_API}/pages/${pageId}/dom?localeId=${localeId}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!res.ok) return []
  const data = await res.json() as { nodes?: { id: string; type: string; text?: { text?: string } }[] }
  const items: WebflowStringItem[] = []
  for (const node of data.nodes ?? []) {
    if (node.text?.text?.trim()) {
      items.push({ key: node.id, value: node.text.text })
    }
  }
  return items
}

export async function pushPageTranslations(
  pageId: string,
  localeId: string,
  translations: Record<string, string>,
  token: string,
): Promise<void> {
  const nodes = Object.entries(translations).map(([id, text]) => ({
    id,
    type: 'text',
    text: { text },
  }))
  await fetch(`${WEBFLOW_API}/pages/${pageId}/dom?localeId=${localeId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ nodes }),
  })
}

// CMS collection items
export async function getCollections(siteId: string, token: string): Promise<{ id: string; slug: string; displayName: string }[]> {
  const res = await fetch(`${WEBFLOW_API}/sites/${siteId}/collections`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!res.ok) return []
  const data = await res.json() as { collections?: { id: string; slug: string; displayName: string }[] }
  return data.collections ?? []
}

export { getToken as getWebflowToken }
