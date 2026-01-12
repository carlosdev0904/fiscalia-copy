import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Base44 Backend Function: createFiscalCloudCompany
 * Registers a company in Nuvem Fiscal (Fiscal Cloud)
 * 
 * @param {Object} params - Function parameters
 * @param {string} params.companyId - Company ID in Base44 (required)
 * @param {Object} params.dados_empresa - Company data (required)
 * @returns {status: "success" | "error", message: string}
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ status: "error", message: 'Não autorizado' }, { status: 401 });
    }

    // Parse request body
    const params = await req.json();

    // Validate minimum required data
    if (!params.companyId) {
      return Response.json({
        status: "error",
        message: "ID da empresa é obrigatório"
      }, { status: 400 });
    }

    if (!params.dados_empresa) {
      return Response.json({
        status: "error",
        message: "Dados da empresa são obrigatórios"
      }, { status: 400 });
    }

    const requiredFields = {
      razao_social: 'Razão social',
      cnpj: 'CNPJ',
      inscricao_municipal: 'Inscrição municipal',
      municipio: 'Município',
      uf: 'UF',
      email: 'Email',
      telefone: 'Telefone'
    };

    for (const [field, label] of Object.entries(requiredFields)) {
      if (!params.dados_empresa[field]) {
        return Response.json({
          status: "error",
          message: `Campo obrigatório ausente: ${label}`
        }, { status: 400 });
      }
    }

    // Get Nuvem Fiscal OAuth token
    const useSandbox = Deno.env.get('NUVEM_FISCAL_USE_SANDBOX') !== 'false';

    const clientId = useSandbox
      ? Deno.env.get('NUVEM_FISCAL_SANDBOX_CLIENT_ID')
      : Deno.env.get('NUVEM_FISCAL_PRODUCTION_CLIENT_ID');

    const clientSecret = useSandbox
      ? Deno.env.get('NUVEM_FISCAL_SANDBOX_CLIENT_SECRET')
      : Deno.env.get('NUVEM_FISCAL_PRODUCTION_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      return Response.json({
        status: "error",
        message: "Credenciais da Nuvem Fiscal não configuradas"
      }, { status: 500 });
    }

    // OAuth 2.0 - Get access token
    const tokenUrl = 'https://auth.nuvemfiscal.com.br/oauth/token';
    const scopes = 'empresa cep cnpj nfse';

    const tokenBody = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: scopes
    });

    let nuvemFiscalToken;
    try {
      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: tokenBody.toString()
      });

      console.log("weesdfwefwefsdfwersdfsefs" ,tokenResponse);

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text();
        console.error('OAuth error:', errorData);
        return Response.json({
          status: "error",
          message: "Erro de autenticação com a Nuvem Fiscal"
        }, { status: 500 });
      }

      const tokenData = await tokenResponse.json();
      nuvemFiscalToken = tokenData.access_token;

      if (!nuvemFiscalToken) {
        return Response.json({
          status: "error",
          message: "Token de acesso não retornado"
        }, { status: 500 });
      }
    } catch (error) {
      console.error('Error getting Nuvem Fiscal token:', error);
      return Response.json({
        status: "error",
        message: "Erro de autenticação com a Nuvem Fiscal. Verifique as credenciais."
      }, { status: 500 });
    }

    // Prepare company registration data per Nuvem Fiscal API spec
    const registrationData = {
      cpf_cnpj: params.dados_empresa.cnpj.replace(/\D/g, ''),
      nome_razao_social: params.dados_empresa.razao_social,
      nome_fantasia: params.dados_empresa.nome_fantasia || params.dados_empresa.razao_social,
      inscricao_municipal: params.dados_empresa.inscricao_municipal,
      inscricao_estadual: params.dados_empresa.inscricao_estadual || '',
      endereco: {
        logradouro: params.dados_empresa.logradouro || 'Rua Principal',
        numero: params.dados_empresa.numero || '100',
        complemento: params.dados_empresa.complemento || '',
        bairro: params.dados_empresa.bairro || 'Centro',
        codigo_municipio: params.dados_empresa.codigo_municipio || '3550308',
        cidade: params.dados_empresa.municipio,
        uf: params.dados_empresa.uf.toUpperCase(),
        cep: params.dados_empresa.cep ? params.dados_empresa.cep.replace(/\D/g, '') : '01000000',
        pais: 'Brasil',
        codigo_pais: '1058'
      },
      email: params.dados_empresa.email,
      telefone: params.dados_empresa.telefone.replace(/\D/g, '')
    };

    // Call Nuvem Fiscal API to register company
    const nuvemFiscalUrl = useSandbox
      ? 'https://api.sandbox.nuvemfiscal.com.br/empresas'
      : 'https://api.nuvemfiscal.com.br/empresas';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let response;
    try {
      console.log("nuvemFiscalToken", nuvemFiscalToken, registrationData)
      response = await fetch(nuvemFiscalUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${nuvemFiscalToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(registrationData),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        return Response.json({
          status: "error",
          message: "Tempo de conexão esgotado"
        }, { status: 408 });
      }
      throw error;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      let userMessage = 'Erro ao registrar empresa';

      if (response.status === 401 || response.status === 403) {
        userMessage = 'Erro de autenticação';
      } else if (response.status === 400) {
        userMessage = errorData?.mensagem || 'Dados inválidos';
      } else if (response.status === 409) {
        userMessage = 'Empresa já registrada';
      } else if (response.status >= 500) {
        userMessage = 'Erro no servidor da Nuvem Fiscal';
      }

      return Response.json({
        status: "error",
        message: userMessage
      }, { status: response.status });
    }

    const responseData = await response.json();

    if (responseData && responseData.id) {
      const nuvemFiscalId = responseData.id;

      // Persist Nuvem Fiscal ID in Base44 database
      await base44.asServiceRole.entities.Company.update(params.companyId, {
        nuvem_fiscal_id: nuvemFiscalId,
        nuvem_fiscal_registered_at: new Date().toISOString()
      });

      return Response.json({
        status: "success",
        message: "Empresa registrada na Nuvem Fiscal com sucesso"
      });
    } else {
      return Response.json({
        status: "error",
        message: "Resposta inválida da Nuvem Fiscal"
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error in createFiscalCloudCompany:', error);

    return Response.json({
      status: "error",
      message: "Erro ao registrar empresa"
    }, { status: 500 });
  }
});