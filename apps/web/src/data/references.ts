/**
 * Bibliography behind the indicators. Titles stay in the language they were published in.
 * Every DOI was checked against Crossref.
 */
export type Reference = {
  authors: string;
  year: number;
  title: string;
  /** Language of the title (BCP 47), so a page in another language marks it up correctly. */
  lang: string;
  source: string;
  doi?: string;
  url?: string;
};

export const framework = {
  authors: "Cazzuli, F. & Paruelo, J. M. (eds.)",
  year: 2023,
  title: "Indicadores de desempeño ambiental para sistemas agropecuarios del Uruguay",
  lang: "es",
  source: "INIA, Serie Técnica 266",
  doi: "10.35676/INIA/ST.266",
} satisfies Reference;

export const references = {
  monteith1972: {
    authors: "Monteith, J. L.",
    year: 1972,
    title: "Solar radiation and productivity in tropical ecosystems",
    lang: "en",
    source: "Journal of Applied Ecology 9: 747–766",
    doi: "10.2307/2401901",
  },
  pineiro2006: {
    authors: "Piñeiro, G., Oesterheld, M. & Paruelo, J. M.",
    year: 2006,
    title:
      "Seasonal variation in aboveground production and radiation-use efficiency of temperate rangelands estimated through remote sensing",
    lang: "en",
    source: "Ecosystems 9: 357–373",
    doi: "10.1007/s10021-005-0013-x",
  },
  baeza2010: {
    authors: "Baeza, S., Lezama, F., Piñeiro, G., Altesor, A. & Paruelo, J. M.",
    year: 2010,
    title:
      "Spatial variability of above-ground net primary production in Uruguayan grasslands: a remote sensing approach",
    lang: "en",
    source: "Applied Vegetation Science 13: 72–85",
    doi: "10.1111/j.1654-109X.2009.01051.x",
  },
  gallego2023: {
    authors: "Gallego, F., Camba Sans, G., Di Bella, C. M., Tiscornia, G. & Paruelo, J. M.",
    year: 2023,
    title: "Performance of real evapotranspiration products and water yield estimations in Uruguay",
    lang: "en",
    source: "Remote Sensing Applications: Society and Environment 32: 101043",
    doi: "10.1016/j.rsase.2023.101043",
  },
  paruelo2016: {
    authors: "Paruelo, J. M., Texeira, M., Staiano, L., Mastrángelo, M., Amdan, L. & Gallego, F.",
    year: 2016,
    title: "An integrative index of Ecosystem Services provision based on remotely sensed data",
    lang: "en",
    source: "Ecological Indicators 71: 145–154",
    doi: "10.1016/j.ecolind.2016.06.054",
  },
  paruelo2001: {
    authors: "Paruelo, J. M., Jobbágy, E. G. & Sala, O. E.",
    year: 2001,
    title: "Current distribution of ecosystem functional types in temperate South America",
    lang: "en",
    source: "Ecosystems 4: 683–698",
    doi: "10.1007/s10021-001-0037-9",
  },
  alcarazSegura2013: {
    authors: "Alcaraz-Segura, D., Paruelo, J. M., Epstein, H. E. & Cabello, J.",
    year: 2013,
    title: "Environmental and human controls of ecosystem functional diversity in temperate South America",
    lang: "en",
    source: "Remote Sensing 5: 127–154",
    doi: "10.3390/rs5010127",
  },
  baezaParuelo2018: {
    authors: "Baeza, S. & Paruelo, J. M.",
    year: 2018,
    title:
      "Spatial and temporal variation of human appropriation of net primary production in the Rio de la Plata grasslands",
    lang: "en",
    source: "ISPRS Journal of Photogrammetry and Remote Sensing 145: 238–249",
    doi: "10.1016/j.isprsjprs.2018.07.014",
  },
  baeza2022: {
    authors: "Baeza, S. et al.",
    year: 2022,
    title: "Two decades of land cover mapping in the Río de la Plata grassland region: The MapBiomas Pampa initiative",
    lang: "en",
    source: "Remote Sensing Applications: Society and Environment 28: 100834",
    doi: "10.1016/j.rsase.2022.100834",
  },
  lezama2019: {
    authors: "Lezama, F., Pereira, M., Altesor, A. & Paruelo, J. M.",
    year: 2019,
    title: "Grasslands of Uruguay: classification based on vegetation plots",
    lang: "en",
    source: "Phytocoenologia 49: 211–229",
    doi: "10.1127/phyto/2019/0215",
  },
  renard1997: {
    authors: "Renard, K. G., Foster, G. R., Weesies, G. A., McCool, D. K. & Yoder, D. C.",
    year: 1997,
    title:
      "Predicting soil erosion by water: a guide to conservation planning with the Revised Universal Soil Loss Equation (RUSLE)",
    lang: "en",
    source: "USDA, Agriculture Handbook 703",
  },
} as const satisfies Record<string, Reference>;

export type ReferenceId = keyof typeof references;

export const doiUrl = (doi: string) => `https://doi.org/${doi}`;
