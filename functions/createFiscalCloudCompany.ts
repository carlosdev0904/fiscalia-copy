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

    // Get Nuvem Fiscal token
    const useSandbox = Deno.env.get('NUVEM_FISCAL_USE_SANDBOX') !== 'false';
    const nuvemFiscalToken = useSandbox
      ? Deno.env.get('NUVEM_FISCAL_SANDBOX_TOKEN')
      : Deno.env.get('NUVEM_FISCAL_PRODUCTION_TOKEN');

    if (!nuvemFiscalToken) {
      return Response.json({
        status: "error",
        message: "Token da Nuvem Fiscal não configurado"
      }, { status: 500 });
    }

    // Prepare company registration data
    const registrationData = {
      razao_social: params.dados_empresa.razao_social,
      cnpj: params.dados_empresa.cnpj.replace(/\D/g, ''),
      inscricao_municipal: params.dados_empresa.inscricao_municipal,
      municipio: params.dados_empresa.municipio,
      uf: params.dados_empresa.uf.toUpperCase(),
      email: params.dados_empresa.email,
      telefone: params.dados_empresa.telefone.replace(/\D/g, ''),
      ambiente: useSandbox ? 'sandbox' : 'producao'
    };

    // Call Nuvem Fiscal API to register company
    const nuvemFiscalUrl = useSandbox
      ? 'https://api.sandbox.nuvemfiscal.com.br/'
      : 'https://api.nuvemfiscal.com.br/';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let response;
    try {
      console.log("nuvemFiscalToken", nuvemFiscalToken)
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