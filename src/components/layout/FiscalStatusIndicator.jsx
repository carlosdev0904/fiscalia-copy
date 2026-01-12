import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export default function FiscalStatusIndicator({ companyId }) {
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: ['fiscalStatus', companyId],
    queryFn: async () => {
      const statuses = await base44.entities.FiscalIntegrationStatus.filter({ company_id: companyId });
      return statuses[0];
    },
    enabled: !!companyId,
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const { data } = await base44.functions.invoke('checkFiscalConnection', {
        companyId
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscalStatus'] });
    }
  });

  if (isLoading || !status) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5">
        <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
        <span className="text-xs text-gray-400">Verificando...</span>
      </div>
    );
  }

  const statusConfig = {
    conectado: {
      icon: CheckCircle,
      color: "text-green-400",
      bg: "bg-green-500/10",
      border: "border-green-500/20"
    },
    falha: {
      icon: AlertCircle,
      color: "text-red-400",
      bg: "bg-red-500/10",
      border: "border-red-500/20"
    },
    verificando: {
      icon: Loader2,
      color: "text-yellow-400",
      bg: "bg-yellow-500/10",
      border: "border-yellow-500/20"
    }
  };

  const config = statusConfig[status.status] || statusConfig.verificando;
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`p-4 rounded-xl ${config.bg} border ${config.border}`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 ${config.color} flex-shrink-0 mt-0.5 ${status.status === 'verificando' ? 'animate-spin' : ''}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${config.color}`}>
            {status.status === 'conectado' ? '🟢 Conectado' : 
             status.status === 'falha' ? '🔴 Falha de conexão' : 
             '🟡 Verificando'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {status.mensagem || 'Verificando status da conexão com a prefeitura...'}
          </p>
          {status.ultima_verificacao && (
            <p className="text-xs text-gray-600 mt-2">
              Última verificação: {new Date(status.ultima_verificacao).toLocaleString('pt-BR')}
            </p>
          )}
        </div>
      </div>
      <Button
        onClick={() => verifyMutation.mutate()}
        disabled={verifyMutation.isPending}
        size="sm"
        variant="outline"
        className="mt-3 w-full bg-transparent border-white/10 text-white hover:bg-white/5"
      >
        <RefreshCw className={`w-4 h-4 mr-2 ${verifyMutation.isPending ? 'animate-spin' : ''}`} />
        {verifyMutation.isPending ? 'Verificando...' : 'Verificar conexão'}
      </Button>
    </motion.div>
  );
}