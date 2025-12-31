import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Building2, ChevronDown, Plus, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function CompanySelector({ activeCompanyId, onCompanyChange }) {
  const queryClient = useQueryClient();

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => base44.entities.Company.list(),
  });

  const { data: settings } = useQuery({
    queryKey: ['userSettings'],
    queryFn: async () => {
      const allSettings = await base44.entities.UserSettings.list();
      return allSettings[0];
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (data) => {
      if (settings?.id) {
        return base44.entities.UserSettings.update(settings.id, data);
      }
      return base44.entities.UserSettings.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userSettings'] });
    }
  });

  const activeCompany = companies.find(c => c.id === activeCompanyId) || companies[0];

  const handleCompanyChange = async (companyId) => {
    await updateSettingsMutation.mutateAsync({ active_company_id: companyId });
    onCompanyChange?.(companyId);
    window.location.reload(); // Reload to refresh all data
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-between px-4 py-6 h-auto hover:bg-white/5"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl btn-gradient-animated flex items-center justify-center border-0 flex-shrink-0">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div className="text-left min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">
                {activeCompany?.nome_fantasia || activeCompany?.razao_social || 'Selecione uma empresa'}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {activeCompany?.regime_tributario || 'Sem regime'}
              </p>
            </div>
          </div>
          <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72 bg-[#1a1a2e] border-white/10" align="start">
        <DropdownMenuLabel className="text-gray-400 text-xs uppercase">
          Minhas Empresas
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-white/5" />
        {companies.map((company) => (
          <DropdownMenuItem
            key={company.id}
            onClick={() => handleCompanyChange(company.id)}
            className="text-white hover:bg-white/10 cursor-pointer py-3"
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {company.nome_fantasia || company.razao_social}
                  </p>
                  <p className="text-xs text-gray-500">
                    {company.regime_tributario}
                  </p>
                </div>
              </div>
              {company.id === activeCompanyId && (
                <Check className="w-4 h-4 text-[#0066FF] flex-shrink-0" />
              )}
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator className="bg-white/5" />
        <DropdownMenuItem asChild>
          <Link
            to={createPageUrl("CompanySetup")}
            className="text-[#0066FF] hover:bg-[#0066FF]/10 cursor-pointer flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Adicionar nova empresa
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}