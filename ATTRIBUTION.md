# Geographic data and reference attribution

- **Satellite imagery:** EOxCloudless by EOX IT Services GmbH, containing modified
  Copernicus Sentinel data 2016 and 2017, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
  Historical imagery from the permitted `s2cloudless_3857` layer was cropped, resampled
  and cached for offline use. No newer non-commercial-only layers are included.
  [Provider](https://cloudless.eox.at/). Exact requests, geographic bounds, transformations
  and SHA-256 hashes are in `app/web/public/assets/imagery-attribution.json`,
  `regional-imagery.json` and `terrain-attribution.json`.
- **Elevation:** Mapzen Terrain Tiles / AWS Open Data, USGS SRTM and GMTED2010 data.
  Underlying USGS data is public domain. [Source attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).
  Terrain is georeferenced, with approximately 66-67 metre source spacing at these
  locations. Field grids and tile provenance are included alongside the assets.
- **Country outline:** Natural Earth, public-domain geographic data.
- **Kuwait wellsite photograph:** a Kuwait Oil Company photo-library image was viewed
  only as an equipment/material reference. Copyright remains with its owner; the
  photograph is **not redistributed**. Its original URL and observed details are
  retained in `terrain-attribution.json`. All wellsite meshes are illustrative,
  built from geometric primitives, not extracted or reconstructed from that photograph.
- Engineering rates, well positions, trajectories and geological surfaces are
  app-generated illustrative datasets, not published operator measurements. Well
  positions and equipment are indicative; there is no survey-accuracy claim.

Attribution links are also visible in the dashboard. Third-party dependencies retain
their own licences; publication does not relicense any third-party asset.
