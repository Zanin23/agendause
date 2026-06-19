import { Link, useNavigate } from "react-router-dom";
import { CalendarCheck2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";

export const AppHeader = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const initials = (user?.user_metadata?.full_name || user?.email || "?")
    .split(" ")
    .map((p: string) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <header className="border-b border-border bg-card/40 backdrop-blur sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-foreground">
          <CalendarCheck2 className="h-5 w-5 text-primary" />
          <span className="font-semibold tracking-tight">TreinaCheck</span>
        </Link>
        {user && (
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-muted-foreground">
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        )}
      </div>
    </header>
  );
};