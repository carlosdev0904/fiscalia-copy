import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Base44 Backend Function: checkInvoiceStatus
 * Queries the status of an issued NFS-e
 * 
 * @param {Object} params - Function parameters
 * @param {string} params.numero - NFS-e number (required)
 * @param {string} params.invoiceId - Invoice ID in database (optional)
 * @returns {status: "success" | "error", message: string, invoiceStatus?: string}
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
    if (!params.numero) {
      return Response.json({
        status: "error",
        message: "Número da nota fiscal é obrigatório"
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

    // Call Nuvem Fiscal API to check status
    const nuvemFiscalUrl = useSandbox
      ? `https://api.sandbox.nuvemfiscal.com.br/nfse/${params.numero}`
      : `https://api.nuvemfiscal.com.br/nfse/${params.numero}`;

    const response = await fetch(nuvemFiscalUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${nuvemFiscalToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      let errorMessage = 'Erro ao consultar status da nota';
      
      if (response.status === 404) {
        errorMessage = 'Nota fiscal não encontrada';
      } else if (response.status === 401 || response.status === 403) {
        errorMessage = 'Erro de autenticação';
      }

      return Response.json({
        status: "error",
        message: errorMessage
      }, { status: response.status });
    }

    const responseData = await response.json();

    // Map Nuvem Fiscal status
    const nfStatus = responseData.status || responseData.status_sefaz;
    let mappedStatus = 'pendente_confirmacao';
    
    if (nfStatus === 'autorizada' || nfStatus === 'aprovada' || nfStatus === 'autorizado') {
      mappedStatus = 'autorizada';
    } else if (nfStatus === 'rejeitada' || nfStatus === 'rejeitado') {
      mappedStatus = 'rejeitada';
    } else if (nfStatus === 'cancelada' || nfStatus === 'cancelado') {
      mappedStatus = 'cancelada';
    }

    // Update invoice in database if invoiceId provided
    if (params.invoiceId) {
      const updateData = {
        status: mappedStatus,
        numero: responseData.numero || params.numero,
        codigo_verificacao: responseData.codigo_verificacao || null,
        pdf_url: responseData.pdf_url || responseData.link_pdf || null,
        xml_url: responseData.xml_url || responseData.link_xml || null,
        motivo_rejeicao: responseData.motivo_rejeicao || null
      };

      await base44.asServiceRole.entities.Invoice.update(params.invoiceId, updateData);

      // Create notification
      await base44.asServiceRole.entities.Notification.create({
        titulo: "Status atualizado",
        mensagem: `Nota fiscal ${params.numero}: ${mappedStatus}`,
        tipo: mappedStatus === 'autorizada' ? 'sucesso' : 
              mappedStatus === 'rejeitada' ? 'erro' : 'info',
        invoice_id: params.invoiceId
      });
    } else {
      // Try to find invoice by number
      const invoices = await base44.asServiceRole.entities.Invoice.filter({ 
        numero: params.numero
      });
      
      if (invoices.length > 0) {
        const invoice = invoices[0];
        const updateData = {
          status: mappedStatus,
          codigo_verificacao: responseData.codigo_verificacao || invoice.codigo_verificacao,
          pdf_url: responseData.pdf_url || responseData.link_pdf || invoice.pdf_url,
          xml_url: responseData.xml_url || responseData.link_xml || invoice.xml_url,
          motivo_rejeicao: responseData.motivo_rejeicao || invoice.motivo_rejeicao
        };

        await base44.asServiceRole.entities.Invoice.update(invoice.id, updateData);
      }
    }

    return Response.json({
      status: "success",
      message: `Status da nota ${params.numero}: ${mappedStatus}`,
      invoiceStatus: mappedStatus,
      details: {
        numero: responseData.numero,
        codigo_verificacao: responseData.codigo_verificacao,
        pdf_url: responseData.pdf_url || responseData.link_pdf,
        xml_url: responseData.xml_url || responseData.link_xml
      }
    });

  } catch (error) {
    console.error('Error in checkInvoiceStatus:', error);

    let userMessage = 'Erro ao consultar status da nota';
    
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      userMessage = 'Erro de conexão com a prefeitura';
    }

    return Response.json({
      status: "error",
      message: userMessage
    }, { status: 500 });
  }
});