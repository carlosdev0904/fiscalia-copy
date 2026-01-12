import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Base44 Backend Function: issueInvoice
 * Issues a NFS-e via Nuvem Fiscal API
 * 
 * @param {Object} params - Function parameters
 * @param {string} params.companyId - Company ID
 * @param {string} params.cliente_nome - Client name
 * @param {string} params.cliente_documento - Client document (CPF/CNPJ)
 * @param {string} params.descricao_servico - Service description
 * @param {number} params.valor - Service value
 * @param {number} params.aliquota_iss - ISS tax rate (percentage)
 * @param {string} params.municipio - Municipality
 * @param {string} params.data_prestacao - Service date (ISO format)
 * @returns {status: "success" | "error", message: string, invoice?: object}
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
    const requiredFields = {
      companyId: 'ID da empresa',
      cliente_nome: 'Nome do cliente',
      cliente_documento: 'Documento do cliente',
      descricao_servico: 'Descrição do serviço',
      valor: 'Valor do serviço',
      aliquota_iss: 'Alíquota de ISS',
      municipio: 'Município',
      data_prestacao: 'Data da prestação'
    };

    for (const [field, label] of Object.entries(requiredFields)) {
      if (!params[field]) {
        return Response.json({
          status: "error",
          message: `Campo obrigatório ausente: ${label}`
        }, { status: 400 });
      }
    }

    // Get company data
    const company = await base44.asServiceRole.entities.Company.get(params.companyId);
    
    if (!company) {
      return Response.json({
        status: "error",
        message: "Empresa não encontrada"
      }, { status: 404 });
    }

    if (!company.nuvem_fiscal_id) {
      return Response.json({
        status: "error",
        message: "Empresa não registrada na Nuvem Fiscal"
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

    // Calculate ISS value
    const valor = parseFloat(params.valor);
    const aliquota_iss = parseFloat(params.aliquota_iss);
    const valorISS = (valor * aliquota_iss) / 100;
    const valorLiquido = valor - valorISS;

    // Prepare NFS-e data for Nuvem Fiscal
    const nfseData = {
      referencia: company.nuvem_fiscal_id,
      prestador: {
        cpf_cnpj: company.cnpj.replace(/\D/g, ''),
        inscricao_municipal: company.inscricao_municipal,
        razao_social: company.razao_social,
        nome_fantasia: company.nome_fantasia,
        endereco: {
          logradouro: params.logradouro || 'Rua Principal',
          numero: params.numero || '100',
          bairro: params.bairro || 'Centro',
          codigo_municipio: params.codigo_municipio || '3550308', // São Paulo default
          uf: company.uf,
          cep: params.cep || '01000000'
        }
      },
      tomador: {
        cpf_cnpj: params.cliente_documento.replace(/\D/g, ''),
        razao_social: params.cliente_nome,
        endereco: {
          codigo_municipio: params.tomador_codigo_municipio || '3550308',
          uf: params.tomador_uf || company.uf
        }
      },
      servico: {
        discriminacao: params.descricao_servico,
        codigo_tributario_municipio: params.codigo_servico || '01.07',
        codigo_cnae: company.cnae_principal?.replace(/\D/g, '') || '6311900',
        item_lista_servico: params.item_lista_servico || '1.07',
        valor_servicos: valor,
        aliquota: aliquota_iss,
        valor_iss: valorISS,
        iss_retido: params.iss_retido || false
      },
      data_emissao: new Date().toISOString(),
      data_prestacao: params.data_prestacao,
      natureza_operacao: 1, // Tributação no município
      regime_especial_tributacao: params.regime_especial || 6 // Não aplicável
    };

    // Call Nuvem Fiscal API
    const nuvemFiscalUrl = useSandbox
      ? 'https://api.sandbox.nuvemfiscal.com.br/nfse'
      : 'https://api.nuvemfiscal.com.br/nfse';

    const response = await fetch(nuvemFiscalUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${nuvemFiscalToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(nfseData)
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('Nuvem Fiscal error:', responseData);
      
      let errorMessage = 'Erro ao emitir nota fiscal';
      if (response.status === 401 || response.status === 403) {
        errorMessage = 'Erro de autenticação com a prefeitura';
      } else if (response.status === 400) {
        errorMessage = responseData.mensagem || responseData.error || 'Dados inválidos';
      } else if (response.status >= 500) {
        errorMessage = 'Erro no servidor da prefeitura';
      }

      return Response.json({
        status: "error",
        message: errorMessage
      }, { status: response.status });
    }

    // Determine invoice status
    let invoiceStatus = 'pendente_confirmacao';
    if (responseData.status === 'autorizada' || responseData.status_sefaz === 'autorizado') {
      invoiceStatus = 'autorizada';
    } else if (responseData.status === 'rejeitada' || responseData.status_sefaz === 'rejeitado') {
      invoiceStatus = 'rejeitada';
    }

    // Create invoice in database
    const invoiceData = {
      numero: responseData.numero || null,
      codigo_verificacao: responseData.codigo_verificacao || null,
      cliente_nome: params.cliente_nome,
      cliente_documento: params.cliente_documento,
      descricao_servico: params.descricao_servico,
      valor: valor,
      aliquota_iss: aliquota_iss,
      valor_iss: valorISS,
      iss_retido: params.iss_retido || false,
      status: invoiceStatus,
      data_emissao: responseData.data_emissao || new Date().toISOString().split('T')[0],
      pdf_url: responseData.pdf_url || responseData.link_pdf || null,
      xml_url: responseData.xml_url || responseData.link_xml || null,
      municipio: params.municipio,
      motivo_rejeicao: responseData.motivo_rejeicao || null
    };

    const savedInvoice = await base44.asServiceRole.entities.Invoice.create(invoiceData);

    // Create success notification
    await base44.asServiceRole.entities.Notification.create({
      titulo: "Nota fiscal emitida",
      mensagem: `Nota fiscal ${responseData.numero || 'criada'} com sucesso`,
      tipo: "sucesso",
      invoice_id: savedInvoice.id
    });

    return Response.json({
      status: "success",
      message: responseData.numero 
        ? `Nota fiscal ${responseData.numero} emitida com sucesso`
        : "Nota fiscal enviada para processamento",
      invoice: savedInvoice
    });

  } catch (error) {
    console.error('Error in issueInvoice:', error);

    // Map errors to user-friendly messages
    let userMessage = 'Erro ao emitir nota fiscal';
    
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      userMessage = 'Erro de conexão com a prefeitura';
    }

    return Response.json({
      status: "error",
      message: userMessage
    }, { status: 500 });
  }
});