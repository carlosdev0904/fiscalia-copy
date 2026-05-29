import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { getNuvemFiscalToken } from './_getNuvemFiscalToken.js';

/**
 * Test OAuth authentication with Nuvem Fiscal
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const useSandbox = Deno.env.get('NUVEM_FISCAL_USE_SANDBOX') !== 'false';
    
    console.log('Testing OAuth with sandbox:', useSandbox);
    
    // Get token via OAuth
    const token = await getNuvemFiscalToken(useSandbox);
    
    console.log('Token obtained successfully, length:', token.length);

    // Test API call with the token
    const apiUrl = useSandbox 
      ? 'https://api.sandbox.nuvemfiscal.com.br/empresa'
      : 'https://api.nuvemfiscal.com.br/empresa';

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    const responseData = await response.json().catch(() => ({}));

    return Response.json({
      success: true,
      tokenObtained: true,
      tokenLength: token.length,
      apiStatus: response.status,
      apiResponse: responseData
    });

  } catch (error) {
    console.error('OAuth test error:', error);
    return Response.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});