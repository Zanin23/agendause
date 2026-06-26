import { ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BackButtonProps = {
  to?: string;
  label?: string;
  className?: string;
  ariaLabel?: string;
};

/**
 * Padrão de botão "Voltar" usado em todas as telas internas.
 * Visual padronizado: ghost com ícone + rótulo "Voltar".
 * Animação sutil: a seta desliza para a esquerda no hover.
 */
export function BackButton({ to, label = "Voltar", className, ariaLabel = "Voltar" }: BackButtonProps) {
  const navigate = useNavigate();

  const content = (
    <>
      <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
      {label ? <span className="ml-1.5">{label}</span> : null}
    </>
  );

  if (to) {
    return (
      <Button
        asChild
        variant="ghost"
        size="sm"
        className={cn("group px-2 shrink-0 text-muted-foreground hover:text-foreground", className)}
        aria-label={ariaLabel}
      >
        <Link to={to}>{content}</Link>
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("group px-2 shrink-0 text-muted-foreground hover:text-foreground", className)}
      aria-label={ariaLabel}
      onClick={() => navigate(-1)}
    >
      {content}
    </Button>
  );
}

export default BackButton;