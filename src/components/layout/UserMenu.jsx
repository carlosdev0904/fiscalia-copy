import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { User, Settings, LogOut, ChevronDown } from "lucide-react";

export default function UserMenu({ user }) {
  const handleLogout = async () => {
    await base44.auth.logout();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-between px-4 py-3 h-auto hover:bg-white/5"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500/20 to-purple-500/20 flex items-center justify-center border border-white/10 flex-shrink-0">
              <span className="text-sm font-semibold text-white">
                {user?.full_name?.charAt(0) || 'U'}
              </span>
            </div>
            <div className="text-left min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">{user?.full_name || 'Usuário'}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
          </div>
          <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64 bg-[#1a1a2e] border-white/10" align="end">
        <DropdownMenuLabel className="text-gray-400 text-xs uppercase">
          Minha Conta
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-white/5" />
        <DropdownMenuItem asChild>
          <Link
            to={createPageUrl("Settings")}
            className="text-white hover:bg-white/10 cursor-pointer flex items-center gap-3"
          >
            <Settings className="w-4 h-4" />
            Configurações
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-white/5" />
        <DropdownMenuItem
          onClick={handleLogout}
          className="text-red-400 hover:bg-red-500/10 cursor-pointer flex items-center gap-3"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}