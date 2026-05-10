/**
 * Shopify Translate & Adapt API support.
 * Uses Shopify's GraphQL Admin API to fetch and push translations.
 *
 * Requires in pronto.config.yml:
 *   shopify_store: mystore.myshopify.com
 *   shopify_api_token: <token>  (or SHOPIFY_API_TOKEN env var)
 *
 * Key resource types: PRODUCT, COLLECTION, SHOP, THEME, EMAIL_TEMPLATE, ARTICLE, BLOG, PAGE, LINK
 */

export interface ShopifyTranslatableContent {
  key: string
  value: string
  digest: string
  resourceId: string
  resourceType: string
}

const TRANSLATABLE_RESOURCE_TYPES = [
  'ONLINE_STORE_THEME',
  'SHOP',
  'PAGE',
  'BLOG',
  'ARTICLE',
  'PRODUCT',
  'COLLECTION',
  'MENU',
  'EMAIL_TEMPLATE',
] as const

function getToken(config: { shopify_api_token?: string }): string {
  const token = config.shopify_api_token ?? process.env.SHOPIFY_API_TOKEN
  if (!token) throw new Error('Shopify API token not set. Add shopify_api_token to pronto.config.yml or set SHOPIFY_API_TOKEN env var.')
  return token
}

function shopifyGql(store: string, token: string) {
  return async function query<T>(q: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await fetch(`https://${store}/admin/api/2025-01/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: q, variables }),
    })
    if (!res.ok) throw new Error(`Shopify API error ${res.status}: ${await res.text()}`)
    const json = await res.json() as { data: T; errors?: { message: string }[] }
    if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join(', '))
    return json.data
  }
}

export async function getTranslatableResources(
  store: string,
  token: string,
  resourceType: typeof TRANSLATABLE_RESOURCE_TYPES[number],
  locale: string,
): Promise<ShopifyTranslatableContent[]> {
  const gql = shopifyGql(store, token)
  const query = `
    query TranslatableResources($resourceType: TranslatableResourceType!, $locale: String!) {
      translatableResources(resourceType: $resourceType, first: 50) {
        edges {
          node {
            resourceId
            translatableContent {
              key
              value
              digest
            }
            translations(locale: $locale) {
              key
              value
            }
          }
        }
      }
    }
  `
  const data = await gql<{
    translatableResources: {
      edges: {
        node: {
          resourceId: string
          translatableContent: { key: string; value: string; digest: string }[]
        }
      }[]
    }
  }>(query, { resourceType, locale })

  const items: ShopifyTranslatableContent[] = []
  for (const edge of data.translatableResources.edges) {
    for (const content of edge.node.translatableContent) {
      if (content.value?.trim()) {
        items.push({ ...content, resourceId: edge.node.resourceId, resourceType })
      }
    }
  }
  return items
}

export async function registerTranslations(
  store: string,
  token: string,
  resourceId: string,
  locale: string,
  translations: { key: string; value: string; translatableContentDigest: string }[],
): Promise<void> {
  const gql = shopifyGql(store, token)
  const mutation = `
    mutation translationsRegister($resourceId: ID!, $translations: [TranslationInput!]!) {
      translationsRegister(resourceId: $resourceId, translations: $translations) {
        translations { key value }
        userErrors { field message }
      }
    }
  `
  await gql(mutation, {
    resourceId,
    translations: translations.map(t => ({ ...t, locale })),
  })
}

export { getToken as getShopifyToken, TRANSLATABLE_RESOURCE_TYPES, shopifyGql }
