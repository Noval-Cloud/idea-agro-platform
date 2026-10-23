/** Official department names, keyed by the upper-case spelling found in the source layers (typos included). */
const departments: Record<string, string> = {
  ARTIGAS: "Artigas",
  CANELONES: "Canelones",
  "CERRO LARGO": "Cerro Largo",
  COLONIA: "Colonia",
  DURAZNO: "Durazno",
  FLORES: "Flores",
  FLORIDA: "Florida",
  LAVALLEJA: "Lavalleja",
  MALDONADO: "Maldonado",
  MONTEVIDEO: "Montevideo",
  PAYSANDU: "Paysandú",
  "RIO NEGRO": "Río Negro",
  RIVERA: "Rivera",
  ROCHA: "Rocha",
  SALTO: "Salto",
  "SAN JOSE": "San José",
  SORIANO: "Soriano",
  TACUAREMBO: "Tacuarembó",
  TACUEREMBO: "Tacuarembó",
  "TREINTA Y TRES": "Treinta y Tres",
};

export function departmentName(sourceName: string): string {
  return departments[sourceName.trim().toUpperCase()] ?? sourceName;
}
