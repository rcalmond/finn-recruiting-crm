-- Migration 046: Add geocoordinates to schools for map view

alter table schools
  add column latitude  double precision,
  add column longitude double precision;

create index schools_coords_idx
  on schools(latitude, longitude)
  where latitude is not null and longitude is not null;
