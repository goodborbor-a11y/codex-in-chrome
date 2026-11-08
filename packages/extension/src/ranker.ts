export type Candidate = { ref: string; name?: string; role?: string; text?: string; attributes?: Record<string,string>; inViewport?: boolean };
export type Match = Candidate & { confidence: number; reason: string };
const aliases: Record<string,string[]> = { search:['search','query','find'], submit:['submit','send','continue'], button:['button','btn'], textbox:['textbox','input','field','searchbox'] };
export function rankElements(query: string, nodes: Candidate[]): Match[] {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 1 && !['the','a','an','that','says','with'].includes(w));
  return nodes.map(node => {
    const name = (node.name || '').toLowerCase(), role = (node.role || '').toLowerCase(), text = (node.text || '').toLowerCase();
    let points = 0; const reasons: string[] = [];
    for (const word of words) {
      const variants = aliases[word] || [word];
      if (variants.some(v => name.includes(v))) { points += 3; reasons.push(`name matches ${word}`); }
      else if (variants.some(v => role.includes(v))) { points += 2; reasons.push(`role matches ${word}`); }
      else if (variants.some(v => text.includes(v))) { points += 1; reasons.push(`text matches ${word}`); }
    }
    if (node.inViewport) points += .25;
    const confidence = words.length ? Math.min(1,points/(words.length*3)) : 0;
    return { ...node, confidence, reason: reasons.join(', ') || 'weak match' };
  }).filter(node => node.confidence > .15).sort((a,b) => b.confidence-a.confidence).slice(0,20);
}
