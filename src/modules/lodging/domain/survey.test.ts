import { describe, expect, it } from "vitest";
import {
  SURVEY_CATEGORIES,
  receptionistsLabel,
  summarizeSurveys,
  surveyQuestion,
  surveyAverage,
  surveySubmissionSchema,
  receptionistOptions,
  summarizeByReceptionist,
  type SurveyRow,
  surveyMessage,
} from "./survey";

const row = (over: Partial<SurveyRow> = {}): SurveyRow => ({
  cleanliness: 5,
  comfort: 4,
  staff: 5,
  value_for_money: 3,
  recommend: 5,
  ...over,
});

describe("encuesta de satisfacción", () => {
  it("sin respuestas no inventa promedios", () => {
    expect(summarizeSurveys([])).toMatchObject({
      count: 0,
      overall: null,
      recommendAverage: null,
      weakest: null,
    });
  });

  it("calcula promedios, recomendación y la categoría más débil", () => {
    const result = summarizeSurveys([
      row(),
      row({ cleanliness: 3, value_for_money: 2, recommend: 2 }),
      row({ recommend: 4 }),
    ]);
    expect(result.count).toBe(3);
    expect(result.categories.find((c) => c.key === "cleanliness")?.average).toBe(4.3);
    expect(result.weakest?.key).toBe("value_for_money");
    // recomendación 5, 2 y 4: promedio 3.7 y 2 de 3 recomiendan (4 o 5)
    expect(result.recommendAverage).toBe(3.7);
    expect(result.recommenders).toBe(2);
  });

  it("no marca área débil si todo es 5", () => {
    const perfect = row({ cleanliness: 5, comfort: 5, staff: 5, value_for_money: 5 });
    expect(summarizeSurveys([perfect]).weakest).toBeNull();
    expect(surveyAverage(perfect)).toBe(5);
  });

  it("valida rangos del formulario", () => {
    const ok = {
      token: "a".repeat(32),
      cleanliness: "5",
      comfort: "4",
      staff: "5",
      value_for_money: "3",
      recommend: "5",
    };
    expect(surveySubmissionSchema.safeParse(ok).success).toBe(true);
    expect(surveySubmissionSchema.safeParse({ ...ok, cleanliness: "6" }).success).toBe(false);
    expect(surveySubmissionSchema.safeParse({ ...ok, recommend: "6" }).success).toBe(false);
    expect(surveySubmissionSchema.safeParse({ ...ok, recommend: "0" }).success).toBe(false);
    expect(surveySubmissionSchema.safeParse({ ...ok, token: "xyz" }).success).toBe(false);
  });
});

describe("recepcionistas nombradas en la encuesta", () => {
  const staff = SURVEY_CATEGORIES.find((c) => c.key === "staff")!;
  const cleanliness = SURVEY_CATEGORIES.find((c) => c.key === "cleanliness")!;

  it("Centro nombra a Kathya o Alicia", () => {
    expect(receptionistsLabel("HOC")).toBe("Kathya o Alicia");
    expect(surveyQuestion(staff, "HOC")).toBe("¿Cómo fue la atención que recibiste de Kathya o Alicia en recepción?");
  });

  it("los demás hostales conservan la pregunta general", () => {
    expect(receptionistsLabel("HOB")).toBeNull();
    expect(receptionistsLabel(undefined)).toBeNull();
    expect(surveyQuestion(staff, "HU")).toBe(staff.question);
  });

  it("solo cambia la pregunta de atención", () => {
    expect(surveyQuestion(cleanliness, "HOC")).toBe(cleanliness.question);
  });
});


describe("surveyMessage", () => {
  it("saluda por el primer nombre e incluye el link", () => {
    expect(surveyMessage("Hostal Uruguay", "https://x/encuesta/abc", "Marcela Soto")).toBe(
      "Hola Marcela, gracias por alojarte en Hostal Uruguay. Nos ayudaría mucho saber cómo fue tu estadía; responde esta breve encuesta (1 minuto): https://x/encuesta/abc",
    );
  });
  it("sin nombre real (reserva importada) saluda sin nombre", () => {
    expect(surveyMessage("Hostal Uruguay", "https://x/e/1", "Reserva Airbnb")).toMatch(/^Hola, gracias/);
    expect(surveyMessage("Hostal Uruguay", "https://x/e/1")).toMatch(/^Hola, gracias/);
  });
});

describe("quién atendió al huésped", () => {
  const base = {
    token: "a".repeat(32),
    cleanliness: "5",
    comfort: "5",
    staff: "5",
    value_for_money: "5",
    recommend: "5",
  };

  it("Centro ofrece a Kathya, Alicia y no recuerdo; los demás hostales no preguntan", () => {
    expect(receptionistOptions("HOC")).toEqual(["Kathya", "Alicia", "No lo recuerdo"]);
    expect(receptionistOptions("HOB")).toEqual([]);
    expect(receptionistOptions(undefined)).toEqual([]);
  });

  it("solo acepta nombres de la lista", () => {
    expect(surveySubmissionSchema.parse({ ...base, receptionist: "Alicia" }).receptionist).toBe("Alicia");
    expect(surveySubmissionSchema.parse({ ...base, receptionist: "Cualquiera" }).receptionist).toBe("");
    expect(surveySubmissionSchema.parse(base).receptionist).toBe("");
  });

  it("separa las respuestas por recepcionista y agrupa las sin indicar", () => {
    const rows = [
      { ...row({ staff: 5 }), receptionist: "Kathya" },
      { ...row({ staff: 3 }), receptionist: "Kathya" },
      { ...row({ staff: 4 }), receptionist: "Alicia" },
      { ...row({ staff: 2 }), receptionist: null },
    ];
    const stats = summarizeByReceptionist(rows);
    expect(stats.find((r) => r.name === "Kathya")).toMatchObject({ count: 2, staffAverage: 4 });
    expect(stats.find((r) => r.name === "Alicia")).toMatchObject({ count: 1, staffAverage: 4 });
    expect(stats.find((r) => r.name === "Sin indicar")).toMatchObject({ count: 1, staffAverage: 2 });
  });
});
