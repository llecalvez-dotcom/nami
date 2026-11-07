import type { PassportFields } from "@/lib/contracts";

export type Persona = {
  passport: PassportFields;
  home_address: string;
  phone: string;
  bali_accommodation: string;
};

export const PERSONA: Persona = {
  passport: {
    surname: "LEFICTIF",
    given_names: "Camille",
    nationality: "FR",
    birth_date: "1995-06-02",
    passport_number: "21ZZ01234",
    issue_date: "2021-03-15",
    expiry_date: "2031-03-14",
  },
  home_address: "12 rue de l'Exemple, 75000 Paris, France",
  phone: "+33 6 39 98 12 34",
  bali_accommodation: "Jl. Contoh No. 1, Ubud, Gianyar, Bali 80571",
};
