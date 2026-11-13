/** Normalizes what the user typed so "  Finalizar " matches "finalizar". */
export function matchesPhrase(typed: string, phrase: string): boolean {
  return typed.trim().toLocaleLowerCase('pt-BR') === phrase.trim().toLocaleLowerCase('pt-BR');
}
