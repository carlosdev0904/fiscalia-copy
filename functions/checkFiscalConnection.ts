import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Base44 Backend Function: checkFiscalConnection
 * Verifies fiscal connection status with Nuvem Fiscal
 * 
 * @param {Object} params - Function parameters
 * @param {string} params.companyId - Company ID (required)
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

    // Call Nuvem Fiscal API health check
    const nuvemFiscalUrl = useSandbox
      ? 'https://api.sandbox.nuvemfiscal.com.br/empresas'
      : 'https://api.nuvemfiscal.com.br/empresas';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let isConnected = false;
    let errorMessage = 'Falha na conexão com a prefeitura';

    try {
      const response = await fetch(nuvemFiscalUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${nuvemFiscalToken}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      isConnected = response.ok;

      if (!isConnected) {
        if (response.status === 401 || response.status === 403) {
          errorMessage = 'Erro de autenticação';
        }
      }
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        errorMessage = 'Tempo de conexão esgotado';
      }
    }

    const connectionStatus = isConnected ? 'conectado' : 'falha';

    // Persist connection status in database
    const statusData = {
      company_id: params.companyId,
      status: connectionStatus,
      mensagem: isConnected ? 'Conexão estabelecida' : errorMessage,
      ultima_verificacao: new Date().toISOString()
    };

    const existingStatus = await base44.asServiceRole.entities.FiscalIntegrationStatus.filter({
      company_id: params.companyId
    });

    if (existingStatus.length > 0) {
      await base44.asServiceRole.entities.FiscalIntegrationStatus.update(
        existingStatus[0].id,
        statusData
      );
    } else {
      await base44.asServiceRole.entities.FiscalIntegrationStatus.create(statusData);
    }

    return Response.json({
      status: isConnected ? "success" : "error",
      message: isConnected ? "Conexão fiscal estabelecida" : errorMessage
    });

  } catch (error) {
    console.error('Error in checkFiscalConnection:', error);

    return Response.json({
      status: "error",
      message: "Falha na verificação de conexão"
    }, { status: 500 });
  }
});