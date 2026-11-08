import type { StyleSpecification } from 'maplibre-gl';

// Recolor vector geometry in warm, paper-like neutrals, retaining the provider's geographic data, road widths,
// label placement, fonts, sprites and attribution.
export function parchmentStyle(style: StyleSpecification): StyleSpecification {
  return { ...style, layers: style.layers.map(layer => {
    const identity = `${layer.id} ${'source-layer' in layer ? layer['source-layer'] : ''}`;
    if (layer.type === 'background') return { ...layer, paint: { ...layer.paint, 'background-color': '#efeae1' } };
    if (layer.type === 'fill') {
      const color = /water/i.test(identity) ? '#bccfd0' : /park|wood|forest|grass|landcover/i.test(identity) ? '#d5dac3' : /building/i.test(identity) ? '#ddd4c6' : /landuse|residential/i.test(identity) ? '#e7e1d6' : undefined;
      if (color) return { ...layer, paint: { ...layer.paint, 'fill-color': color } };
    }
    if (layer.type === 'line') {
      const color = /water/i.test(identity) ? '#a5bec0' : /boundary/i.test(identity) ? '#a6947c' : /road|transportation/i.test(identity) ? /casing|outline/i.test(identity) ? '#cdbfaa' : '#fbf9f5' : undefined;
      if (color) return { ...layer, paint: { ...layer.paint, 'line-color': color } };
    }
    if (layer.type === 'symbol' && layer.layout?.['text-field']) return { ...layer, paint: { ...layer.paint, 'text-color': '#4f4538', 'text-halo-color': '#f7f4ee', 'text-halo-width': 1.2 } };
    return layer;
  }) };
}
