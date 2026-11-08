const key = value => value.replaceAll('_', '').toLowerCase();

// Compare metadata only: no subscription, reducer, or player-data read is needed.
export function backendSchemaProblems(schema, bindings) {
  const sections = name => schema.sections.flatMap(section => section[name] ?? []);
  const types = schema.sections.flatMap(section => section.Typespace?.types ?? []);
  const rows = type => {
    if (type.Ref !== undefined) return rows(types[type.Ref]);
    if (type.Product) return type.Product.elements.map(field => key(field.name.some));
    if (type.Array) return rows(type.Array);
    const some = type.Sum?.variants.find(variant => variant.name?.some?.toLowerCase() === 'some');
    if (some) return rows(some.algebraic_type);
    throw new Error('Unrecognized backend row metadata. Update the CLI or inspect the schema manually.');
  };
  const problems = [];
  for (const [accessor, table] of Object.entries(bindings.tables)) {
    const deployed = sections('Tables').find(item => key(item.source_name) === key(accessor));
    const view = sections('Views').find(item => key(item.source_name) === key(accessor));
    if (!deployed && !view) { problems.push(`Missing table/view: ${accessor}`); continue; }
    const expected = Object.keys(table.columns).map(key);
    const actual = rows(deployed ? { Ref: deployed.product_type_ref } : view.return_type);
    if (JSON.stringify(expected) !== JSON.stringify(actual)) problems.push(`Row schema differs: ${accessor} (local fields: ${expected.join(', ')}; deployed: ${actual.join(', ')})`);
  }
  for (const [group, names] of [['Reducers', bindings.reducers], ['Procedures', bindings.procedures]]) {
    const available = new Set(sections(group).map(item => key(item.source_name)));
    for (const name of Object.keys(names)) if (!available.has(key(name))) problems.push(`Missing ${group.toLowerCase().slice(0, -1)}: ${name}`);
  }
  if (!sections('Tables').some(table => key(table.source_name) === 'questrefreshtimer')) problems.push('Missing server-side quest refresh scheduler: quest_refresh_timer');
  return problems;
}
