export const materialCategorySegments = [
  {
    segment: "Estructura y obra gruesa",
    categories: [
      "Áridos",
      "Cementos y morteros",
      "Hormigón",
      "Acero estructural",
      "Maderas estructurales",
      "Perfiles metálicos",
    ],
  },
  {
    segment: "Construcción modular",
    categories: [
      "Paneles y placas",
      "Aislación térmica y acústica",
      "Revestimientos",
      "Cubiertas y techumbre",
      "Puertas y ventanas",
      "Elementos prefabricados",
    ],
  },
  {
    segment: "Instalaciones",
    categories: [
      "Electricidad",
      "Iluminación",
      "Sanitaria y agua potable",
      "Alcantarillado",
      "Gas",
      "Climatización y ventilación",
    ],
  },
  {
    segment: "Terminaciones",
    categories: [
      "Pinturas y recubrimientos",
      "Pisos",
      "Cerámicos",
      "Quincallería",
      "Sellos y adhesivos",
      "Muebles y equipamiento",
    ],
  },
  {
    segment: "Operación y apoyo",
    categories: [
      "Fijaciones y tornillería",
      "Herramientas",
      "Elementos de protección personal",
      "Consumibles",
      "Embalaje",
      "Otros materiales",
    ],
  },
] as const;

export const constructionUnits = [
  {
    group: "Unidades",
    values: [
      ["unidad", "Unidad (un)"],
      ["par", "Par"],
      ["juego", "Juego"],
      ["rollo", "Rollo"],
      ["saco", "Saco"],
      ["caja", "Caja"],
      ["plancha", "Plancha"],
      ["barra", "Barra"],
      ["perfil", "Perfil"],
    ],
  },
  {
    group: "Longitud",
    values: [
      ["mm", "Milímetro (mm)"],
      ["cm", "Centímetro (cm)"],
      ["m", "Metro lineal (m)"],
      ["km", "Kilómetro (km)"],
    ],
  },
  {
    group: "Superficie",
    values: [
      ["cm²", "Centímetro cuadrado (cm²)"],
      ["m²", "Metro cuadrado (m²)"],
    ],
  },
  {
    group: "Volumen",
    values: [
      ["cm³", "Centímetro cúbico (cm³)"],
      ["m³", "Metro cúbico (m³)"],
      ["ml", "Mililitro (ml)"],
      ["l", "Litro (l)"],
    ],
  },
  {
    group: "Peso",
    values: [
      ["g", "Gramo (g)"],
      ["kg", "Kilogramo (kg)"],
      ["t", "Tonelada (t)"],
    ],
  },
] as const;
