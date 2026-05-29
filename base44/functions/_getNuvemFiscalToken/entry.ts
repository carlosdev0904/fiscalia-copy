/**
 * Helper: Get Nuvem Fiscal OAuth Access Token
 * Exchanges Client ID and Client Secret for an OAuth 2.0 access token
 * 
 * @param {boolean} useSandbox - Use sandbox or production environment
 * @returns {Promise<string>} Access token (JWT)
 * @throws {Error} If authentication fails
 */

export async function getNuvemFiscalToken(useSandbox = true) {
  const clientId = useSandbox
    ? Deno.env.get('NUVEM_FISCAL_SANDBOX_CLIENT_ID')
    : Deno.env.get('NUVEM_FISCAL_PRODUCTION_CLIENT_ID');

  const clientSecret = useSandbox
    ? Deno.env.get('NUVEM_FISCAL_SANDBOX_CLIENT_SECRET')
    : Deno.env.get('NUVEM_FISCAL_PRODUCTION_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    throw new Error('Credenciais da Nuvem Fiscal não configuradas');
  }

  // OAuth 2.0 token endpoint
  const tokenUrl = 'https://auth.nuvemfiscal.com.br/oauth/token';

  // Required scopes for NFS-e operations
  const scopes = 'empresa cep cnpj nfse';

  // Build request body (application/x-www-form-urlencoded)
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: scopes
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('OAuth error:', errorData);
    throw new Error('Falha ao obter token de acesso da Nuvem Fiscal');
  }

  const data = await response.json();

  if (!data.access_token) {
    throw new Error('Token de acesso não retornado');
  }

  return data.access_token;
}