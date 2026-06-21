import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Helmet } from "react-helmet-async";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <Helmet>
        <title>Página não encontrada — TreinaCheck</title>
        <meta name="description" content="A página que você procura não existe ou foi removida." />
        <meta name="robots" content="noindex" />
        <meta property="og:title" content="Página não encontrada — TreinaCheck" />
        <meta property="og:description" content="A página que você procura não existe ou foi removida." />
        <meta property="og:url" content={`https://agendause.lovable.app${location.pathname}`} />
      </Helmet>
      <div className="text-center">
        <h1 className="mb-4 text-4xl">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        <Link to="/" className="text-primary underline hover:text-primary/80">
          Return to Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
