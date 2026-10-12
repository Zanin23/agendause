import { Helmet } from "react-helmet-async";

const SITE_URL = "https://agendause.lovable.app";
const SITE_IMAGE = `${SITE_URL}/logo-use-sistemas.png`;

interface SEOProps {
  title: string;
  description: string;
  path: string;
}

export function SEO({ title, description, path }: SEOProps) {
  const url = `${SITE_URL}${path}`;
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={SITE_IMAGE} />
      <meta property="og:image:alt" content="Logo da Use Sistemas" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={SITE_IMAGE} />
      <meta name="twitter:image:alt" content="Logo da Use Sistemas" />
    </Helmet>
  );
}