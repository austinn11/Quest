# Curated map locations

The six F11 quest destinations use the site coordinates published in the [Texas Parks & Wildlife Texas Discovery Loop](https://tpwd.texas.gov/huntwild/wildlife/wildlife-trails/ppww/texas-discovery-loop), checked on November 7, 2026. These points identify sites, not guaranteed entrances or navigable routes. Check posted access, current opening hours, admission, and trail conditions before visiting.

| Template | Destination | Latitude | Longitude |
| --- | --- | --- | --- |
| `easy-white-rock-scout` | Old Fish Hatchery Nature Area / White Rock Lake | 32.8158 | -96.7284 |
| `easy-lagoon-watch` | Leonhardt Lagoon, Fair Park | 32.7781 | -96.7622 |
| `medium-discovery-sketch` | Texas Discovery Gardens | 32.7757 | -96.7600 |
| `medium-arboretum-bestiary` | Dallas Arboretum and Botanical Garden | 32.8222 | -96.7163 |
| `hard-cedar-ridge` | Cedar Ridge Preserve | 32.6376 | -96.9614 |
| `hard-cedar-hill` | Cedar Hill State Park | 32.5721 | -96.9862 |

The pre-existing campus reference at 32.9858, -96.7501 remains unchanged and is now labeled University of Texas at Dallas campus. It is a general campus point rather than a specific building or entrance; consult the [official UTD campus map](https://map.utdallas.edu/) for campus access.

Coordinates and labels are stored in SpacetimeDB templates. The six-slot board references those templates, and historical completions retain the same template ID after replacement. Do not move or delete templates that already have completion history; create a new template for a different destination instead. The frontend projects these locations through one helper so future assignment-specific locations can be added without rewriting map components. F11 does not perform place discovery, geocoding, or dynamic location generation.
