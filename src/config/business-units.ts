export const businessUnitBrands = {
  HOC: {
    logo: "/business-units/hoc.png",
    accent: "#b98a24",
    description: "Hospitalidad y operación de Hostal Oasis Centro",
  },
  HOB: {
    logo: "/business-units/hob.png",
    accent: "#bf8f27",
    description: "Hospitalidad y operación de Hostal Oasis Cobija",
  },
  HU: {
    logo: "/business-units/hu.png",
    accent: "#c09632",
    description: "Reservas y operación de Hostal Uruguay",
  },
  OM: {
    logo: "/business-units/om.png",
    accent: "#0b4f9c",
    description: "Producción, materiales y operación modular",
  },
  DA: {
    logo: "/business-units/da.jpeg",
    accent: "#0b356d",
    description: "Pedidos, distribución, entregas y cobranzas",
  },
} as const;

export type BusinessUnitCode = keyof typeof businessUnitBrands;

export function getBusinessUnitBrand(code?: string | null) {
  return code && code in businessUnitBrands
    ? businessUnitBrands[code as BusinessUnitCode]
    : {
        logo: "/oasis-logo-crane.png",
        accent: "#0b4f9c",
        description: "Gestión ejecutiva de la unidad de negocio",
      };
}
