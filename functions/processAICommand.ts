import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import OpenAI from 'npm:openai';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Parse request body
        const { message, companyId = null, conversationHistory = [] } = await req.json();

        // Validate input
        if (!message || typeof message !== 'string') {
            return Response.json({
                success: false,
                error: 'MESSAGE_REQUIRED',
                message: 'Mensagem é obrigatória',
                explanation: 'Por favor, forneça uma mensagem para processar.'
            }, { status: 400 });
        }

        // Get OpenAI API key from environment
        const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
        if (!openaiApiKey) {
            return Response.json({
                success: false,
                error: 'API_KEY_NOT_CONFIGURED',
                message: 'OpenAI API key não configurada',
                explanation: 'A chave da API do OpenAI não está configurada. Entre em contato com o administrador.'
            }, { status: 500 });
        }

        // Initialize OpenAI client
        const openai = new OpenAI({
            apiKey: openaiApiKey
        });

        // Build system prompt
        const systemPrompt = `Você é um assistente fiscal especializado em ajudar empresas brasileiras a emitir notas fiscais de serviços (NFS-e).

Sua função é:
1. Entender comandos em português brasileiro
2. Retornar ações estruturadas em JSON
3. Explicar processos em linguagem natural

Ações disponíveis:
- emitir_nfse: Emitir uma nota fiscal de serviço
- consultar_status: Consultar status de uma nota fiscal
- listar_notas: Listar notas fiscais emitidas
- verificar_conexao: Verificar conexão com a prefeitura
- explicar_erro_fiscal: Explicar erros de conexão fiscal em linguagem natural
- explicar: Apenas explicar algo sem executar ação

IMPORTANTE:
- Você NUNCA deve chamar APIs fiscais diretamente
- Você apenas retorna JSON estruturado com a ação
- O backend executará a ação real
- Sempre retorne JSON válido
- Use português brasileiro para todas as explicações
- Quando o usuário perguntar sobre erros de conexão fiscal, use a ação "explicar_erro_fiscal"
- Explique erros técnicos de forma simples e clara em português
- Sugira soluções práticas para problemas de conexão

Formato de resposta (sempre JSON válido):
{
  "action": {
    "type": "tipo_da_acao" | null,
    "data": {
      // Dados específicos da ação
      // Para emitir_nfse:
      "cliente_nome": "string",
      "cliente_documento": "string (CPF ou CNPJ)",
      "descricao_servico": "string",
      "valor": "number",
      "aliquota_iss": "number (percentual)",
      "municipio": "string"
    }
  },
  "explanation": "Explicação em português brasileiro",
  "requiresConfirmation": true/false
}

Se não entender o comando ou não houver ação clara, retorne:
{
  "action": null,
  "explanation": "Explicação do que você pode fazer",
  "requiresConfirmation": false
}`;

        // Build conversation messages
        const messages = [
            { role: 'system', content: systemPrompt }
        ];

        // Add conversation history (last 10 messages)
        const recentHistory = conversationHistory.slice(-10);
        recentHistory.forEach(msg => {
            if (msg.role && msg.content) {
                messages.push({
                    role: msg.role,
                    content: msg.content
                });
            }
        });

        // Add current user message
        messages.push({
            role: 'user',
            content: message
        });

        // Call OpenAI API
        const completion = await openai.chat.completions.create({
            model: Deno.env.get("OPENAI_MODEL") || 'gpt-4o-mini',
            messages: messages,
            temperature: 0.7,
            max_tokens: 1000,
            response_format: { type: 'json_object' }
        });

        // Parse response
        const responseContent = completion.choices[0]?.message?.content;
        if (!responseContent) {
            throw new Error('Empty response from OpenAI');
        }

        // Parse JSON response
        let parsedResponse;
        try {
            parsedResponse = JSON.parse(responseContent);
        } catch (parseError) {
            // Try to extract JSON from markdown code blocks
            const jsonMatch = responseContent.match(/```json\s*([\s\S]*?)\s*```/) || 
                           responseContent.match(/```\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                parsedResponse = JSON.parse(jsonMatch[1]);
            } else {
                // Fallback: try to find JSON object in response
                const jsonObjectMatch = responseContent.match(/\{[\s\S]*\}/);
                if (jsonObjectMatch) {
                    parsedResponse = JSON.parse(jsonObjectMatch[0]);
                } else {
                    throw new Error('Could not parse JSON from response');
                }
            }
        }

        // Validate response structure
        if (!parsedResponse.explanation) {
            parsedResponse.explanation = 'Processando sua solicitação...';
        }

        if (!parsedResponse.action) {
            parsedResponse.action = null;
        }

        if (typeof parsedResponse.requiresConfirmation !== 'boolean') {
            parsedResponse.requiresConfirmation = parsedResponse.action?.type === 'emitir_nfse';
        }

        // Return structured response
        return Response.json({
            success: true,
            action: parsedResponse.action,
            explanation: parsedResponse.explanation,
            requiresConfirmation: parsedResponse.requiresConfirmation,
            data: parsedResponse.data || null
        });

    } catch (error) {
        console.error('Error in processAICommand:', error);

        return Response.json({
            success: false,
            error: error.message || 'UNKNOWN_ERROR',
            message: 'Erro ao processar comando',
            explanation: 'Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente ou reformule sua solicitação.'
        }, { status: 500 });
    }
});