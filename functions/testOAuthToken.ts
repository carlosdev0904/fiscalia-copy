import { getNuvemFiscalToken } from './_getNuvemFiscalToken.js';

Deno.serve(async (req) => {
  try {
    const useSandbox = true;
    
    console.log('🔑 Testando obtenção de token OAuth...');
    
    const token = await getNuvemFiscalToken(useSandbox);
    
    console.log('✅ Token obtido com sucesso!');
    console.log('Token length:', token.length);
    console.log('Token starts with eyJ:', token.startsWith('eyJ'));
    console.log('Token preview:', token.substring(0, 50) + '...');
    
    return Response.json({
      status: 'success',
      message: 'Token OAuth obtido com sucesso',
      token_length: token.length,
      token_preview: token.substring(0, 50) + '...'
    });
    
  } catch (error) {
    console.error('❌ Erro ao obter token:', error);
    
    return Response.json({
      status: 'error',
      message: error.message
    }, { status: 500 });
  }
});