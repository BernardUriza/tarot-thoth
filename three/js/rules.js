// The page's rules live in rules.yml; this is the only place that reads it.
import { load } from 'js-yaml';

export async function loadRules(url = 'rules.yml') {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return load(await response.text());
}
