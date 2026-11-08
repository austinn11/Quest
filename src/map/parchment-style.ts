import type { StyleSpecification } from 'maplibre-gl';

// Recolor vector geometry, retaining the provider's geographic data, road widths,
// label placement, fonts, sprites and attribution.
export function parchmentStyle(style: StyleSpecification): StyleSpecification {
  return { ...style, layers: style.layers.map(layer => {
    const identity = `${layer.id} ${'source-layer' in layer ? layer['source-layer'] : ''}`;
    if (layer.type === 'background') return { ...layer, paint: { ...layer.paint, 'background-color': '#e8ddbf' } };
    if (layer.type === 'fill') {
      const color = /water/i.test(identity) ? '#a4bdb3' : /park|wood|forest|grass|landcover/i.test(identity) ? '#c2c5a1' : /building/i.test(identity) ? '#cdbd9c' : /landuse|residential/i.test(identity) ? '#ded3b5' : undefined;
      if (color) return { ...layer, paint: { ...layer.paint, 'fill-color': color } };
    }
    if (layer.type === 'line') {
      const color = /water/i.test(identity) ? '#91ada5' : /boundary/i.test(identity) ? '#9a8664' : /road|transportation/i.test(identity) ? /casing|outline/i.test(identity) ? '#b39b74' : '#fbf0d6' : undefined;
      if (color) return { ...layer, paint: { ...layer.paint, 'line-color': color } };
    }
    if (layer.type === 'symbol' && layer.layout?.['text-field']) return { ...layer, paint: { ...layer.paint, 'text-color': '#4e4737', 'text-halo-color': '#faf1dc', 'text-halo-width': 1.2 } };
    return layer;
  }) };
}
