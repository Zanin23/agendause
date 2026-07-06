import { MapPin, Wrench, Video, type LucideIcon } from "lucide-react";

export type VisitType = "presencial" | "interno" | "remoto";

export const VISIT_TYPES: {
  id: VisitType;
  label: string;
  short: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  border: string;
}[] = [
  {
    id: "presencial",
    label: "Visita presencial",
    short: "Presencial",
    icon: MapPin,
    color: "#F26B1F",
    bg: "#FFF3EA",
    border: "#F26B1F",
  },
  {
    id: "interno",
    label: "Ajuste interno",
    short: "Interno",
    icon: Wrench,
    color: "#6F7FB8",
    bg: "#EEF1FB",
    border: "#6F7FB8",
  },
  {
    id: "remoto",
    label: "Treinamento remoto",
    short: "Remoto",
    icon: Video,
    color: "#1F9D55",
    bg: "#EAF7EF",
    border: "#1F9D55",
  },
];

export const getVisitType = (id: string | null | undefined) =>
  VISIT_TYPES.find((v) => v.id === id) ?? VISIT_TYPES[0];