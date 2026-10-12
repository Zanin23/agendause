import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Helmet } from "react-helmet-async";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4">
      <Helmet>
        <title>Página não encontrada — TreinaCheck</title>
        <meta name="description" content="A página que você procura não existe ou foi removida." />
        <meta name="robots" content="noindex" />
        <meta property="og:title" content="Página não encontrada — TreinaCheck" />
        <meta property="og:description" content="A página que você procura não existe ou foi removida." />
        <meta property="og:url" content={`https://agendause.lovable.app${location.pathname}`} />
      </Helmet>
      <div className="text-center">
        <p className="mb-2 text-4xl font-semibold" aria-hidden="true">404</p>
        <h1 className="mb-2 text-xl font-semibold">Página não encontrada</h1>
        <p className="mb-4 text-muted-foreground">O endereço pode ter sido alterado ou removido.</p>
        <Link to="/" className="text-primary underline hover:text-primary/80">
          Voltar ao início
        </Link>
      </div>
    </main>
  );
};

export default NotFound;
