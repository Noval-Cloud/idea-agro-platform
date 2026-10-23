/** shpjs ships no types: it turns a zipped Shapefile into GeoJSON (one collection per layer). */
declare module "shpjs" {
  export default function shp(input: ArrayBuffer | string): Promise<unknown>;
}
