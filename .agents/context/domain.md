# Domain

What IDEA-Agro measures and the words used for it.

IDEA-Agro (_Indicadores de DEsempeño Ambiental del sector Agropecuario_) publishes environmental and productive indicators for Uruguay's agricultural land, mostly its natural grasslands (part of the Río de la Plata grasslands). The indicators are computed from satellite imagery in Google Earth Engine and come from published research led by INIA, Udelar and the University of Buenos Aires (LART-IFEVA, Dr. José Paruelo).

The reference document is INIA _Serie Técnica_ 266 (2023), _Indicadores de desempeño ambiental para sistemas agropecuarios del Uruguay_, edited by Cazzuli and Paruelo ([DOI 10.35676/INIA/ST.266](https://doi.org/10.35676/INIA/ST.266)).

## Indicators

| Id       | Name                                                    | Short  | Unit                        | Cadence                  | Period             |
| :------- | :------------------------------------------------------ | :----- | :-------------------------- | :----------------------- | :----------------- |
| `apar`   | Absorbed radiation                                      | APAR   | MJ/m² per year              | Every 16 days            | Since 2001         |
| `ppna`   | Grass productivity (aboveground net primary production) | ANPP   | kg DM/ha per year           | Every 16 days            | Since 2001         |
| `et`     | Evapotranspiration                                      | ET     | mm per year                 | Every 8 days             | Since 2001         |
| `rh`     | Water yield                                             | RH     | mm per year                 | Every 16 days            | Since 2003         |
| `cob`    | Land cover                                              | COB    | Hectares per cover type     | Yearly                   | 1985–2021          |
| `compn`  | Grassland communities                                   | ComPN  | Hectares per community      | Fixed reference map      | —                  |
| `iose`   | Ecosystem service supply index                          | ESPI   | Index from 0 to 1           | Yearly (productive year) | 2000–01 to 2021–22 |
| `divtfe` | Functional diversity                                    | DivTFE | Shannon index (bits)        | Per period               | 2017–2019          |
| `csue`   | Soil conservation                                       | CSUE   | t/ha per year               | Per period               | 2017–2019          |
| `ahppn`  | Human appropriation of net primary production           | HANPP  | % of potential productivity | Per period               | 2017–2019          |

What each one measures:

- **APAR:** the solar energy that vegetation captures to grow.
- **ANPP:** how much grass, as dry matter, the vegetation produces per hectare.
- **ET:** the water returned to the atmosphere from soil and plants.
- **RH:** the water left from the balance between rain and evapotranspiration, which feeds streams and aquifers.
- **COB:** what covers each place: natural grassland, crops, tree plantations, native forest or water.
- **ComPN:** the natural grassland types, defined by the species that make them up.
- **ESPI:** how much the ecosystem regulates carbon, water and biodiversity, judged by how much and how evenly vegetation grows through the year.
- **DivTFE:** the variety of ways ecosystems function side by side in a landscape.
- **CSUE:** how much soil is lost to rainfall erosion.
- **HANPP:** the share of what vegetation produces that human activity uses or removes.

Ids are the codes the data and the API use. Code and documentation write the English names; the Spanish names belong to the Spanish interface only.

The **productive year** runs from July to June (`2025–26`). Yearly totals of the 16-day and 8-day indicators are summed over it.

## Zones

A zone is any area whose indicator values are shown or computed.

| Kind                                   | What it is                                                         | How many                   |
| :------------------------------------- | :----------------------------------------------------------------- | :------------------------- |
| Police district (_seccional policial_) | Administrative division of each department                         | 279                        |
| Basin (_cuenca_), grades 1 to 5        | Hydrographic basins; grade 1 is the largest and grade 5 the finest | 6 / 47 / 296 / 917 / 1,426 |
| Rural parcel (_padrón_)                | Cadastral parcel, identified by department and number              | 102,873                    |
| User zone                              | A polygon a user uploads (KML, GeoJSON, zipped Shapefile) or draws | —                          |

Police districts and basins are the **divisions**. Divisions and padrones are **predefined zones**: their geometries live as Earth Engine assets and cannot be edited.

A **project** groups the zones a user works with. It is private by default. A zone in a project is either a reference to a predefined zone or a geometry of its own. Whatever is drawn outside a chosen project goes to the user's default project.

How zone values are computed and kept fresh is in [architecture.md](architecture.md).

## Glossary

| Spanish (data, interface)           | English (code, docs)    |
| :---------------------------------- | :---------------------- |
| _campo natural_, _pastizal natural_ | natural grassland       |
| _seccional policial_                | police district         |
| _cuenca_ (_grado_)                  | basin (grade)           |
| _padrón_                            | rural parcel, or padrón |
| _departamento_                      | department              |
| _año productivo_                    | productive year         |
| _materia seca_ (MS)                 | dry matter (DM)         |
| _zona_                              | zone                    |
| _proyecto_                          | project                 |
