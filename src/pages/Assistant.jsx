import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ChatMessage from "@/components/chat/ChatMessage";
import InvoicePreview from "@/components/chat/InvoicePreview";
import RecentFiles from "@/components/chat/RecentFiles";
import VoiceButton from "@/components/ui/VoiceButton";
import ConfirmationModal from "@/components/invoice/ConfirmationModal";

export default function Assistant() {
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState([
    {
      id: 1,
      isAI: true,
      content: "Olá! Sou seu assistente fiscal inteligente. Posso ajudá-lo a emitir notas fiscais, consultar documentos e gerenciar sua empresa.\n\nExemplos do que posso fazer:\n• \"Emitir nota de R$ 2.000 para Maria Silva\"\n• \"Qual meu faturamento este mês?\"\n• \"Listar minhas últimas notas fiscais\"",
      time: "Agora"
    }
  ]);
  const [pendingInvoice, setPendingInvoice] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => base44.entities.Invoice.list('-created_date', 10),
  });

  const createInvoiceMutation = useMutation({
    mutationFn: (data) => base44.entities.Invoice.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    }
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const processMessage = async (text) => {
    const userMessage = {
      id: Date.now(),
      isAI: false,
      content: text,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };
    setMessages(prev => [...prev, userMessage]);
    setIsProcessing(true);

    try {
      // Call the real AI function
      const conversationHistory = messages.map(msg => ({
        role: msg.isAI ? 'assistant' : 'user',
        content: msg.content
      }));

      const { data } = await base44.functions.invoke('processAICommand', {
        message: text,
        conversationHistory
      });

      if (data.success) {
        // Add AI response
        const aiResponse = {
          id: Date.now() + 1,
          isAI: true,
          content: data.explanation,
          time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, aiResponse]);

        // Handle invoice emission action
        if (data.action?.type === 'emitir_nfse' && data.action?.data) {
          const invoiceData = data.action.data;
          const newInvoice = {
            cliente_nome: invoiceData.cliente_nome,
            cliente_documento: invoiceData.cliente_documento,
            descricao_servico: invoiceData.descricao_servico,
            valor: invoiceData.valor,
            aliquota_iss: invoiceData.aliquota_iss || 5,
            valor_iss: (invoiceData.valor * (invoiceData.aliquota_iss || 5)) / 100,
            status: "pendente_confirmacao",
            municipio: invoiceData.municipio || "São Paulo - SP"
          };
          setPendingInvoice(newInvoice);
        }
      } else {
        // Handle error from AI
        const errorResponse = {
          id: Date.now() + 1,
          isAI: true,
          content: data.explanation || "Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.",
          time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, errorResponse]);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      const errorResponse = {
        id: Date.now() + 1,
        isAI: true,
        content: "Desculpe, ocorreu um erro ao processar sua mensagem. Verifique se as configurações da API estão corretas e tente novamente.",
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorResponse]);
    }
    
    setIsProcessing(false);
  };

  const handleSend = () => {
    if (!inputValue.trim() || isProcessing) return;
    processMessage(inputValue.trim());
    setInputValue("");
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleVoiceInput = (text) => {
    processMessage(text);
  };

  const handleConfirmInvoice = async () => {
    if (!pendingInvoice) return;
    setShowConfirmModal(false);
    setIsProcessing(true);
    
    try {
      // Get company
      const companies = await base44.entities.Company.list();
      const company = companies[0];

      if (!company) {
        throw new Error('Empresa não configurada');
      }

      // Call backend to emit invoice
      const { data } = await base44.functions.invoke('issueInvoice', {
        companyId: company.id,
        cliente_nome: pendingInvoice.cliente_nome,
        cliente_documento: pendingInvoice.cliente_documento,
        descricao_servico: pendingInvoice.descricao_servico,
        valor: pendingInvoice.valor,
        aliquota_iss: pendingInvoice.aliquota_iss || 5,
        municipio: pendingInvoice.municipio || company.cidade,
        data_prestacao: new Date().toISOString().split('T')[0],
        codigo_servico: '1401'
      });

      if (data.status === 'success') {
        const notaFiscal = data.invoice;

        // Create success notification
        await base44.entities.Notification.create({
          titulo: "Nota fiscal autorizada",
          mensagem: `NFS-e #${notaFiscal.numero} autorizada pela prefeitura. Valor: R$ ${pendingInvoice.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          tipo: "sucesso",
          invoice_id: data.invoice_id
        });

        const aiResponse = {
          id: Date.now(),
          isAI: true,
          content: `✅ Nota fiscal ${notaFiscal.status === 'autorizada' ? 'autorizada' : 'emitida'} com sucesso!\n\n📄 Número: ${notaFiscal.numero || '---'}\n👤 Cliente: ${pendingInvoice.cliente_nome}\n💰 Valor: R$ ${pendingInvoice.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n${notaFiscal.codigo_verificacao ? `🔐 Código: ${notaFiscal.codigo_verificacao}\n` : ''}\n✨ A nota foi enviada para a prefeitura. ${notaFiscal.pdf_url ? 'O PDF e XML estão disponíveis na seção "Notas Fiscais".' : ''}`,
          time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, aiResponse]);
        setPendingInvoice(null);
      } else {
        throw new Error(data.message || 'Erro ao emitir nota fiscal');
      }
    } catch (error) {
      console.error(error);
      
      // Create error notification
      await base44.entities.Notification.create({
        titulo: "Erro ao emitir nota",
        mensagem: error.message || 'Erro ao emitir nota fiscal. Tente novamente.',
        tipo: "erro"
      });

      const errorResponse = {
        id: Date.now(),
        isAI: true,
        content: `❌ Erro ao emitir nota fiscal: ${error.message || 'Erro desconhecido'}. Por favor, tente novamente ou verifique os dados.`,
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorResponse]);
      setPendingInvoice(null);
    }
    
    setIsProcessing(false);
  };

  const handleEditInvoice = () => {
    setPendingInvoice(null);
    const aiResponse = {
      id: Date.now(),
      isAI: true,
      content: "Ok, vamos corrigir os dados. Por favor, me diga quais informações precisa alterar.",
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };
    setMessages(prev => [...prev, aiResponse]);
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-6">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col glass-card rounded-3xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Assistente Fiscal IA</h2>
            <p className="text-xs text-gray-500">Pronto para ajudar</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            <span className="text-xs text-green-400">Online</span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <AnimatePresence>
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} isAI={message.isAI} />
            ))}
          </AnimatePresence>

          {/* Pending Invoice Preview */}
          {pendingInvoice && (
            <InvoicePreview
              invoice={pendingInvoice}
              onConfirm={handleConfirmInvoice}
              onEdit={handleEditInvoice}
              isProcessing={isProcessing}
            />
          )}

          {/* Processing Indicator */}
          {isProcessing && !pendingInvoice && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              </div>
              <div className="glass-card rounded-2xl px-5 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-2 h-2 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-2 h-2 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              </div>
            </motion.div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-white/5">
          <div className="flex items-end gap-3">
            <VoiceButton onVoiceInput={handleVoiceInput} disabled={isProcessing} />
            <div className="flex-1 relative">
              <Textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Digite sua mensagem ou use o microfone..."
                className="min-h-[56px] max-h-32 bg-white/5 border-white/10 text-white placeholder:text-gray-500 rounded-2xl resize-none pr-14 focus:border-orange-500/50 focus:ring-orange-500/20"
                disabled={isProcessing}
              />
              <Button
                onClick={handleSend}
                disabled={!inputValue.trim() || isProcessing}
                size="icon"
                className="absolute right-2 bottom-2 w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-xl disabled:opacity-50"
              >
                <Send className="w-4 h-4 text-white" />
              </Button>
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-3 text-center">
            Dica: Diga "Emitir nota de R$ [valor] para [cliente]" para criar uma nota fiscal rapidamente
          </p>
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-80 hidden xl:flex flex-col gap-6">
        {/* Quick Actions */}
        <div className="glass-card rounded-2xl p-5">
          <h3 className="text-sm font-medium text-gray-400 mb-4">Ações Rápidas</h3>
          <div className="space-y-2">
            {[
              { label: "Nova nota fiscal", action: "Emitir nova nota fiscal" },
              { label: "Consultar faturamento", action: "Qual meu faturamento?" },
              { label: "Ver impostos", action: "Mostrar impostos do mês" },
            ].map((item, index) => (
              <button
                key={index}
                onClick={() => processMessage(item.action)}
                disabled={isProcessing}
                className="w-full text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-sm transition-colors disabled:opacity-50"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Recent Files */}
        <RecentFiles invoices={invoices} />
      </div>
    </div>
  );
}