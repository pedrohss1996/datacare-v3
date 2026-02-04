import {
  Plus,
  Search,
  Paperclip,
  Receipt,
  Building,
  Building2,
  Users,
  User,
  Calculator,
  LucideIcon,
  ChevronDown,
  CirclePlus
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
  children?: NavItem[];
}

const navItems: NavItem[] = [
  { 
    id: "new-process", 
    label: "Iniciar Processo", 
    icon: Plus,
    description: "Criar novo processo" 
  },
  { 
    id: "tracking", 
    label: "Acompanhamento", 
    icon: Search,
    description: "Acompanhar processos" 
  },
  { 
    id: "attachments", 
    label: "Anexos", 
    icon: Paperclip,
    description: "Gerenciar anexos" 
  },
  { 
    id: "invoices", 
    label: "Notas Fiscais", 
    icon: Receipt,
    description: "Notas e faturas" 
  },
  { 
    id: "suppliers", 
    label: "Fornecedores", 
    icon: Building,
    description: "Cadastro de fornecedores" 
  },
  { 
    id: "registrations", 
    label: "Cadastros", 
    icon: CirclePlus,
    description: "Gestão de cadastros",
    children: [
      {
        id: "register-users",
        label: "Usuários",
        icon: User,
        description: "Cadastro de novos usuários"
      },
      {
        id: "register-groups",
        label: "Grupos",
        icon: Users,
        description: "Cadastro de novos grupos"
      },
      {
        id: "register-units",
        label: "Unidades",
        icon: Building2,
        description: "Cadastro de novas unidades"
      },
     
    ]
  },
];

interface MainNavProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

export function MainNav({ activeSection, onSectionChange }: MainNavProps) {
  return (
    <nav className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-16 z-40 shadow-sm transition-colors duration-300">
      <div className="px-4 lg:px-6">
        <div className="flex items-center gap-1 overflow-x-auto py-3 scrollbar-hide">
          {navItems.map((item) => {
            const Icon = item.icon;
            
            const isActive = activeSection === item.id;
            const isNewProcess = item.id === "new-process";
            const isChildActive = item.children?.some(child => activeSection === child.id);
            const isParentActive = isActive || isChildActive;

            // --- DROPDOWNS (MENU COM FILHOS) ---
            if (item.children) {
              return (
                <DropdownMenu key={item.id}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className={cn(
                        "flex items-center gap-2 whitespace-nowrap transition-all duration-200",
                        // Lógica Híbrida para Dropdowns
                        isParentActive 
                          ? "bg-teal-50 text-teal-700 dark:bg-teal-600/10 dark:text-teal-400 border border-teal-200 dark:border-teal-900/50" 
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                      <ChevronDown className={cn("ml-1 h-3 w-3 transition-transform duration-200 opacity-70", isParentActive && "text-teal-600 dark:text-teal-400")} />
                    </Button>
                  </DropdownMenuTrigger>
                  
                  <DropdownMenuContent 
                    className="w-56 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 shadow-xl" 
                    align="start"
                  >
                    {item.children.map((child) => {
                      const ChildIcon = child.icon;
                      const isThisChildActive = activeSection === child.id;
                      return (
                        <DropdownMenuItem
                          key={child.id}
                          onClick={() => onSectionChange(child.id)}
                          className={cn(
                            "flex items-center gap-2 cursor-pointer py-2.5 focus:bg-slate-100 dark:focus:bg-slate-800 focus:text-slate-900 dark:focus:text-white my-1 rounded-md",
                            isThisChildActive && "bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 border border-teal-100 dark:border-teal-900/30"
                          )}
                        >
                          <ChildIcon className="h-4 w-4" />
                          <span>{child.label}</span>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            }

            // --- BOTÕES SIMPLES ---
            return (
              <Button
                key={item.id}
                variant="ghost" // "ghost" remove estilos padrão, permitindo nosso controle total no className
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap transition-all duration-200 border",
                  
                  // --- CASO 1: FIXO "INICIAR PROCESSO" (SEMPRE AZUL) ---
                  // Removemos condicionais de tema/estado aqui. Ele sobrescreve tudo.
                  isNewProcess && "bg-blue-600 text-white hover:bg-blue-700 border-blue-600 shadow-md hover:shadow-lg font-semibold",

                  // --- CASO 2: OUTROS BOTÕES (Lógica Híbrida Light/Dark) ---
                  // Só aplica se NÃO for o processo novo
                  !isNewProcess && isParentActive && "bg-teal-500 text-white hover:bg-teal-600 shadow-sm dark:bg-teal-600 border-teal-500",
                  
                  // Inativos
                  !isNewProcess && !isParentActive && "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 border-transparent"
                )}
                onClick={() => onSectionChange(item.id)}
              >
                <Icon className={cn("h-4 w-4", isNewProcess && "text-white")} />
                <span>{item.label}</span>
              </Button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}