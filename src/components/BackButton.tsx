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
 * Visual: ghost, ícone somente, alinhado ao título.
 */
export function BackButton({ to, label, className, ariaLabel = "Voltar" }: BackButtonProps) {
  const navigate = useNavigate();

  const content = (
    <>
      <ArrowLeft className="h-4 w-4" />
      {label ? <span className="ml-1">{label}</span> : null}
    </>
  );

  if (to) {
    return (
      <Button
        asChild
        variant="ghost"
        size="sm"
        className={cn("px-2 shrink-0", className)}
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
      className={cn("px-2 shrink-0", className)}
      aria-label={ariaLabel}
      onClick={() => navigate(-1)}
    >
      {content}
    </Button>
  );
}

export default BackButton;